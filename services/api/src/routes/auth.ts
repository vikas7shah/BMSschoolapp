import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { DEFAULT_PREFS, startLoginSchema, verifyLoginSchema, type Identifier } from '@bms/shared';
import {
  bumpRateLimit, env, getSecret, getUser, getUserByEmail, getUserByPhone, putLoginChannel,
  putUser, updateUser,
} from '@bms/backend';
import type { User } from '@bms/shared';
import { answerCustomAuth, startCustomAuth, type CodeDestination } from '../cognito.js';
import { clearCookie, issueSession, sessionCookie } from '../session.js';
import type { Vars } from '../app.js';

const route = new Hono<{ Variables: Vars }>();

/**
 * The endpoint says outright when a number or address is not on file. That
 * lets someone confirm which contacts belong to a roster family, and the
 * school has chosen usability over that risk: a parent typing an old address
 * should be told, not left waiting for a code that will never come.
 */
const NOT_FOUND = {
  EMAIL: "We don't have that email address on file. Check the spelling, or ask the "
    + 'office which address they hold for you.',
  PHONE: "We don't have that mobile number on file. Check the number, or ask the "
    + 'office which one they hold for you.',
} as const;
const SENT = 'A code is on its way.';

function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return (c.req.header('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';
}

/** Both sign-in routes resolve an identifier the same way. */
async function findUser(identifier: Identifier): Promise<User | null> {
  const user = identifier.kind === 'EMAIL'
    ? await getUserByEmail(identifier.value)
    : await getUserByPhone(identifier.value);
  return user && user.status !== 'DISABLED' ? user : null;
}

route.post('/api/auth/start', async (c) => {
  const parsed = startLoginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Enter your mobile number or email address.' }, 400);
  }
  const { identifier } = parsed.data;

  // Two independent limits: one stops hammering a single family's account,
  // the other stops one host walking the whole identifier space.
  const [perIdentifier, perIp] = await Promise.all([
    bumpRateLimit(`otp:id:${identifier.value}`, 900),
    bumpRateLimit(`otp:ip:${clientIp(c)}`, 900),
  ]);
  if (perIdentifier > 5 || perIp > 20) {
    return c.json({ error: 'Too many attempts. Please try again in a few minutes.' }, 429);
  }

  // Email sign-in depends on a verified SES sender; say so plainly rather than
  // pretending a code was sent. This leaks configuration, not who is enrolled.
  if (identifier.kind === 'EMAIL' && !env.fromEmail) {
    return c.json({ error: 'Email sign-in is not set up yet. Please use your mobile number.' }, 503);
  }

  const user = await findUser(identifier);
  if (!user) return c.json({ error: NOT_FOUND[identifier.kind], code: 'NOT_ON_FILE' }, 404);

  // The code always goes to a channel we can actually deliver on, and to the
  // address on file — never to anything the caller supplied.
  //
  // While SMS is unavailable, a phone sign-in is delivered by email instead.
  // AWS accepts an undeliverable text and drops it silently, so without this
  // the parent would be told a code was on its way and simply never get one.
  let destination: CodeDestination;
  if (identifier.kind === 'EMAIL') {
    destination = { channel: 'EMAIL', to: user.email ?? identifier.value, name: user.firstName };
  } else if (env.smsEnabled && user.phone) {
    destination = { channel: 'SMS', to: user.phone, name: user.firstName };
  } else if (user.email) {
    destination = { channel: 'EMAIL', to: user.email, name: user.firstName };
  } else {
    // Nothing we can reach them on. Say so plainly rather than leaving them
    // waiting for a text that cannot arrive.
    return c.json({
      error: 'We cannot send a code to that number yet. If you are on the school '
        + 'roster, please ask the office to add your email address.',
      code: 'NO_DELIVERY_CHANNEL',
    }, 503);
  }

  // Cognito will not carry this into CreateAuthChallenge on InitiateAuth, so
  // it is stashed where the trigger can read it.
  // Falls back to the phone for accounts created before usernames were stored
  // explicitly, so an un-migrated record can still sign in.
  const username = user.cognitoUsername ?? user.phone;
  if (!username) return c.json({ error: NOT_FOUND[identifier.kind], code: 'NOT_ON_FILE' }, 404);

  await putLoginChannel(username, destination);
  const session = await startCustomAuth(username, destination);
  return c.json({ message: SENT, session, sentTo: mask(destination) });
});

route.post('/api/auth/verify', async (c) => {
  const parsed = verifyLoginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Enter the 6-digit code' }, 400);
  const { identifier, code, session } = parsed.data;

  if ((await bumpRateLimit(`otpv:${identifier.value}`, 900)) > 10) {
    return c.json({ error: 'Too many attempts. Please request a new code.' }, 429);
  }

  const user = await findUser(identifier);
  if (!user) return c.json({ error: 'We could not sign you in.' }, 401);

  const outcome = await answerCustomAuth(user.cognitoUsername ?? user.phone ?? '', code, session);
  if (!outcome.ok) {
    return c.json(
      {
        error: outcome.reason === 'EXPIRED'
          ? 'That code has expired. Please request a new one.'
          : 'That code is not right.',
        session: outcome.reason === 'WRONG_CODE' ? outcome.session : undefined,
        expired: outcome.reason === 'EXPIRED',
      },
      401,
    );
  }

  // First successful sign-in flips an invited parent to active.
  await updateUser(user.userId, {
    lastLoginAt: new Date().toISOString(),
    ...(user.status === 'INVITED' ? { status: 'ACTIVE' as const } : {}),
  });

  const token = await issueSession({ sub: user.userId, role: user.role, sid: user.schoolId });
  c.header('Set-Cookie', sessionCookie(token));
  return c.json({ ok: true });
});

route.post('/api/auth/logout', (c) => {
  c.header('Set-Cookie', clearCookie());
  return c.json({ ok: true });
});

/* ------------------------------------------------------- test sign-in */
// A fixed code that signs in as a stand-alone "Test Admin" — no mailbox, no
// phone, no link to a real family. Exists only while the stack was deployed
// with devLogin true: without the secret's ARN these routes say 404.
const TEST_ADMIN_ID = 'test-admin';
const DEV_LOGIN_SECRET_ARN = process.env.DEV_LOGIN_SECRET_ARN ?? '';

route.get('/api/auth/test', (c) => c.json({ enabled: !!DEV_LOGIN_SECRET_ARN }));

route.post('/api/auth/test', async (c) => {
  if (!DEV_LOGIN_SECRET_ARN) return c.json({ error: 'Not found' }, 404);

  const ip = clientIp(c);
  if ((await bumpRateLimit(`test-login:${ip}`, 900)) > 5) {
    return c.json({ error: 'Too many attempts. Please try again in a few minutes.' }, 429);
  }

  const body = await c.req.json().catch(() => ({}));
  const given = String(body.code ?? '').trim();
  const expected = (await getSecret(DEV_LOGIN_SECRET_ARN)).trim();
  const ok = given.length === expected.length
    && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) {
    console.warn(`Test Admin sign-in refused from ${ip}`);
    return c.json({ error: "That's not the test code." }, 401);
  }

  const now = new Date().toISOString();
  const user: User = (await getUser(TEST_ADMIN_ID)) ?? {
    userId: TEST_ADMIN_ID, cognitoUsername: TEST_ADMIN_ID, schoolId: env.schoolId, role: 'ADMIN',
    firstName: 'Test', lastName: 'Admin', status: 'ACTIVE',
    prefs: { ...DEFAULT_PREFS }, createdAt: now, updatedAt: now,
  };
  if (user.createdAt === now) await putUser(user);
  await updateUser(user.userId, { lastLoginAt: new Date().toISOString() });
  console.warn(`Test Admin signed in from ${ip}`);

  const token = await issueSession({ sub: user.userId, role: user.role, sid: user.schoolId });
  c.header('Set-Cookie', sessionCookie(token));
  return c.json({ ok: true });
});

/** "•••••5268" / "v•••@gmail.com" — enough to reassure, not enough to reveal. */
function mask(d: CodeDestination): string {
  if (d.channel === 'SMS') return `•••••${d.to.slice(-4)}`;
  const [local = '', domain = ''] = d.to.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

export default route;
