import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSecret } from '@bms/backend';
import { env } from '@bms/backend';

export const COOKIE_NAME = 'bms_session';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface SessionClaims {
  sub: string;      // userId
  role: 'PARENT' | 'ADMIN';
  sid: string;      // school id
  iat: number;
  exp: number;
}

const b64url = (b: Buffer) => b.toString('base64url');
const fromB64url = (s: string) => Buffer.from(s, 'base64url');

async function key(): Promise<Buffer> {
  return Buffer.from(await getSecret(env.sessionSecretArn), 'utf8');
}

function sign(data: string, k: Buffer): string {
  return b64url(createHmac('sha256', k).update(data).digest());
}

export async function issueSession(claims: Omit<SessionClaims, 'iat' | 'exp'>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionClaims = { ...claims, iat: now, exp: now + MAX_AGE_SECONDS };
  // Fixed header — we never read `alg` back from the token, which removes any
  // possibility of an algorithm-confusion attack.
  const head = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const data = `${head}.${body}`;
  return `${data}.${sign(data, await key())}`;
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts as [string, string, string];

  const expected = sign(`${head}.${body}`, await key());
  const a = fromB64url(sig);
  const b = fromB64url(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(fromB64url(body).toString('utf8')) as SessionClaims;
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null;
    if (!claims.sub || !claims.sid) return null;
    return claims;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_SECONDS}`,
  ].join('; ');
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return undefined;
}
