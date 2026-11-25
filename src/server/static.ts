import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';

import type { AppEnv } from './http.ts';

/**
 * How long browsers may keep a file of the web app. File names under /assets
 * contain a hash of their content, so they may be kept forever; the page,
 * the service worker and the manifest are always checked again, so a new
 * version is picked up on the next visit (or phones would keep an old one).
 */
export function cacheControl(urlPath: string): string {
  if (urlPath.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  const isFile = /\.[a-z0-9]+$/i.test(urlPath);
  if (!isFile || urlPath.endsWith('.html') || /(^|\/)(sw\.js|manifest\.webmanifest)$/.test(urlPath)) return 'no-cache';
  return 'public, max-age=86400';
}

/** Serves the built web app. */
export function serveClient(app: Hono<AppEnv>, clientDir: string): boolean {
  const indexFile = path.join(clientDir, 'index.html');
  if (!existsSync(indexFile)) return false;
  const indexHtml = readFileSync(indexFile, 'utf8');

  app.use('*', async (c, next) => {
    await next();
    if (c.res.status === 200 && !c.req.path.startsWith('/api/')) {
      c.res.headers.set('Cache-Control', cacheControl(c.req.path));
    }
  });
  // Sends the .br or .gz copy made at build time when the browser accepts it.
  app.use('/assets/*', serveStatic({ root: clientDir, precompressed: true }));
  app.use('*', serveStatic({ root: clientDir }));
  // Any other page is a route of the app (/stats, /sessions/…).
  app.get('*', c => {
    if (/\.[a-z0-9]+$/i.test(c.req.path)) return c.notFound();
    return c.html(indexHtml);
  });
  return true;
}
