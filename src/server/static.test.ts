import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createTestApp } from './test-helpers.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** An app serving a small built web app. */
function appWithClient() {
  const dir = mkdtempSync(path.join(tmpdir(), 'scrapytube-static-'));
  dirs.push(dir);
  const clientDir = path.join(dir, 'client');
  mkdirSync(path.join(clientDir, 'assets'), { recursive: true });
  writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>ScrapyTube</title>');
  writeFileSync(path.join(clientDir, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  writeFileSync(path.join(clientDir, 'manifest.webmanifest'), '{}');
  writeFileSync(path.join(clientDir, 'favicon.svg'), '<svg/>');
  writeFileSync(path.join(clientDir, 'assets', 'index-abc123.js'), 'console.log(1);');
  const test = createTestApp({ clientDir });
  return { app: test.app, close: test.cleanup };
}

describe('serving the web app', () => {
  it('keeps hashed files forever, but always checks the page, the service worker and the manifest', async () => {
    const { app, close } = appWithClient();
    const cache = async (url: string) => (await app.request(url)).headers.get('cache-control');
    expect(await cache('/assets/index-abc123.js')).toBe('public, max-age=31536000, immutable');
    expect(await cache('/sw.js')).toBe('no-cache');
    expect(await cache('/manifest.webmanifest')).toBe('no-cache');
    expect(await cache('/')).toBe('no-cache');
    expect(await cache('/favicon.svg')).toBe('public, max-age=86400');
    await close();
  });

  it('answers the app’s own pages with the page, and missing files with a 404', async () => {
    const { app, close } = appWithClient();
    const page = await app.request('/settings/users');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>ScrapyTube</title>');
    expect((await app.request('/missing.png')).status).toBe(404);
    await close();
  });
});
