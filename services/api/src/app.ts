import { Hono, type MiddlewareHandler } from 'hono';
import type { User } from '@bms/shared';
import { getUser } from '@bms/backend';
import { COOKIE_NAME, readCookie, verifySession, type SessionClaims } from './session.js';

export type Vars = { user: User; claims: SessionClaims };
export type Env = { Variables: Vars };
export type App = Hono<Env>;

export const createApp = (): App => new Hono<Env>();

/** Rejects anonymous requests and loads the caller's user record once. */
export const authenticate: MiddlewareHandler<Env> = async (c, next) => {
  const token = readCookie(c.req.header('cookie'), COOKIE_NAME);
  const claims = await verifySession(token);
  if (!claims) return c.json({ error: 'Not signed in' }, 401);

  const user = await getUser(claims.sub);
  if (!user || user.status === 'DISABLED') return c.json({ error: 'Not signed in' }, 401);

  c.set('claims', claims);
  c.set('user', user);
  await next();
  return undefined;
};

export const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (c.get('user')?.role !== 'ADMIN') return c.json({ error: 'Admins only' }, 403);
  await next();
  return undefined;
};
