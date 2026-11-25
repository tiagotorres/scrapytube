import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';

import {
  changePasswordSchema,
  loginSchema,
  setupSchema,
  updateMeSchema,
} from '#shared/schemas.ts';
import type { SessionInfo } from '#shared/types.ts';

import { HttpError } from '../errors.ts';
import type { AppContext, AppEnv, Ctx } from '../http.ts';
import { clientAddress, readBody, sessionId, signIn, userId } from '../http.ts';
import { DUMMY_HASH, verifyPassword } from '../passwords.ts';
import { RateLimiter } from '../rate-limit.ts';
import { SESSION_COOKIE, deleteSession } from '../sessions.ts';
import { requireUser, toUser } from '../store/rows.ts';
import { createUser, findUserByUsername, hasUsers, setPassword, updateMe } from '../store/users.ts';

/** Sign-in, first-time setup, and the signed-in user's own account. */
export function sessionRoutes(ctx: AppContext) {
  const { db, config } = ctx;
  const app = new Hono<AppEnv>();
  // Password checks allowed every 15 minutes: per address, and per account
  // (so changing addresses doesn't help to guess one person's password).
  const byAddress = new RateLimiter(10, 15 * 60 * 1000);
  const byAccount = new RateLimiter(20, 15 * 60 * 1000);
  let settingUp = false;

  const sessionInfo = (c: Ctx): SessionInfo => {
    const session = c.get('session');
    return {
      setupRequired: !hasUsers(db),
      user: session ? toUser(requireUser(db, session.userId)) : null,
      version: config.version,
    };
  };

  /** Counts a password check for these keys, or refuses it when over the limit. */
  const limitAttempt = (c: Ctx, address: string, account: string) => {
    const wait = Math.max(byAddress.attempt(address), byAccount.attempt(account));
    if (wait > 0) {
      c.header('Retry-After', String(wait));
      throw new HttpError(429, 'RATE_LIMITED');
    }
  };

  const forgetAttempts = (address: string, account: string) => {
    byAddress.reset(address);
    byAccount.reset(account);
  };

  app.get('/session', c => c.json(sessionInfo(c)));

  app.post('/setup', async c => {
    const input = await readBody(c, setupSchema);
    if (settingUp || hasUsers(db)) throw new HttpError(409, 'SETUP_DONE');
    settingUp = true;
    try {
      const user = await createUser(db, input);
      signIn(c, ctx, user.id);
      return c.json({ setupRequired: false, user, version: config.version } satisfies SessionInfo);
    } finally {
      settingUp = false;
    }
  });

  app.post('/login', async c => {
    const input = await readBody(c, loginSchema);
    const address = clientAddress(c);
    const account = `login:${input.username}`;
    limitAttempt(c, address, account);
    const user = findUserByUsername(db, input.username);
    const valid = await verifyPassword(input.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS');
    forgetAttempts(address, account);
    signIn(c, ctx, user.id);
    return c.json(toUser(user));
  });

  app.post('/logout', c => {
    const session = c.get('session');
    if (session) deleteSession(db, session.id);
    if (getCookie(c, SESSION_COOKIE)) deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.body(null, 204);
  });

  app.patch('/me', async c => {
    const input = await readBody(c, updateMeSchema);
    return c.json(updateMe(db, userId(c), input));
  });

  app.post('/me/password', async c => {
    const me = userId(c);
    const input = await readBody(c, changePasswordSchema);
    const address = clientAddress(c);
    const account = `user:${me}`;
    limitAttempt(c, address, account);
    if (!(await verifyPassword(input.currentPassword, requireUser(db, me).password_hash))) {
      throw new HttpError(400, 'WRONG_PASSWORD');
    }
    forgetAttempts(address, account);
    await setPassword(db, me, input.newPassword, sessionId(c));
    return c.body(null, 204);
  });

  return app;
}
