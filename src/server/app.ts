import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { compress } from 'hono/compress';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';

import type { ApiErrorBody } from '#shared/types.ts';

import { databaseCopy } from './backups.ts';
import { HttpError, notFound } from './errors.ts';
import type { AppContext, AppEnv } from './http.ts';
import { setSessionCookie } from './http.ts';
import { downloadRoutes, probeRoutes } from './routes/downloads.ts';
import { folderRoutes, systemRoutes } from './routes/folders.ts';
import { sessionRoutes } from './routes/session.ts';
import { userRoutes } from './routes/users.ts';
import { SESSION_COOKIE, resolveSession } from './sessions.ts';
import { serveClient } from './static.ts';

/** API routes that work without signing in. */
const PUBLIC_ROUTES = new Set(['/api/health', '/api/session', '/api/setup', '/api/login', '/api/logout']);

/** Sent with every change, so that other websites (which can't send it without CORS permission) can't act with someone's cookie. */
export const CSRF_HEADER = 'x-scrapytube';

const tooLarge = () => {
  throw new HttpError(413, 'PAYLOAD_TOO_LARGE');
};

export function createApp(ctx: AppContext) {
  const { db, config } = ctx;
  const app = new Hono<AppEnv>();

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: error.code, message: error.message } satisfies ApiErrorBody, error.status);
    }
    if (error instanceof HTTPException) {
      const code = error.status === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST';
      return c.json({ error: code, message: error.message } satisfies ApiErrorBody, error.status);
    }
    console.error(error);
    return c.json({ error: 'INTERNAL' } satisfies ApiErrorBody, 500);
  });

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // Videos' pictures come from YouTube.
        imgSrc: ["'self'", 'data:', 'https://i.ytimg.com'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      // HSTS would also force HTTPS on the NAS's plain-HTTP ports.
      strictTransportSecurity: false,
      referrerPolicy: 'same-origin',
      xFrameOptions: 'DENY',
    }),
  );

  // Downloaded files are sent as they are (they don't compress).
  const compressApi = compress();
  app.use('/api/*', (c, next) => (c.req.path.endsWith('/file') ? next() : compressApi(c, next)));

  app.use('/api/*', async (c, next) => {
    await next();
    c.res.headers.set('Cache-Control', 'no-store');
    // Lets an open page notice that the server was updated.
    c.res.headers.set('X-App-Version', config.version);
  });

  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header(CSRF_HEADER) !== '1') {
      throw new HttpError(403, 'FORBIDDEN');
    }
    await next();
  });

  app.use('/api/*', bodyLimit({ maxSize: 64 * 1024, onError: tooLarge }));

  app.use('/api/*', async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const session = token ? resolveSession(db, token, config.sessionDays) : null;
    c.set('session', session ?? undefined);
    if (!session && !PUBLIC_ROUTES.has(c.req.path)) throw new HttpError(401, 'UNAUTHORIZED');
    // Someone using the app stays signed in: the cookie's lifetime follows the session's.
    if (token && session?.renewed) setSessionCookie(c, token, config.sessionDays);
    await next();
  });

  app.get('/api/health', c => {
    db.prepare('SELECT 1').get();
    return c.json({ ok: true, version: config.version });
  });

  app.route('/api', sessionRoutes(ctx));
  app.route('/api/users', userRoutes(ctx));
  app.route('/api/probe', probeRoutes(ctx));
  app.route('/api/downloads', downloadRoutes(ctx));
  app.route('/api/folders', folderRoutes(ctx));
  app.route('/api/system', systemRoutes(ctx));

  app.get('/api/backup', c => {
    const data = databaseCopy(db, config.dataDir);
    const today = new Date().toISOString().slice(0, 10);
    c.header('Content-Type', 'application/vnd.sqlite3');
    c.header('Content-Disposition', `attachment; filename="scrapytube-${today}.db"`);
    return c.body(new Uint8Array(data));
  });

  app.all('/api/*', () => {
    throw notFound();
  });

  serveClient(app, config.clientDir);
  return app;
}
