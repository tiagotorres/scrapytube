/// <reference lib="webworker" />
// The service worker: it keeps a copy of the app, so it opens at once (and
// says when the NAS can't be reached rather than showing the browser's
// error). Requests to the API always go to the NAS.
//
// It is written without imports: the build turns it into plain JavaScript and
// puts the list of files to save in front of it (see vite.config.ts).

/** The built files to keep, added at build time. */
declare const __PRECACHE__: string[];
/** Changes with every build. */
declare const __VERSION__: string;

/** This script is a classic worker script: `self` is cast, not redeclared. */
const worker = self as unknown as ServiceWorkerGlobalScope;

const SHELL = `shell-${__VERSION__}`;

worker.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then(cache => cache.addAll(__PRECACHE__))
      .then(() => worker.skipWaiting()),
  );
});

worker.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('shell-') && name !== SHELL) await caches.delete(name);
      }
      await worker.clients.claim();
    })(),
  );
});

worker.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== worker.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') event.respondWith(answerPage(request));
  else event.respondWith(answerFile(request));
});

/**
 * A page of the app: the NAS's copy when it answers quickly (so an update is
 * picked up), else the saved one.
 */
async function answerPage(request: Request): Promise<Response> {
  const saved = await caches.match('/', { cacheName: SHELL });
  if (!saved) return fetch(request);
  try {
    const fresh = await Promise.race([
      fetch(request),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('slow')), 2500)),
    ]);
    return fresh.ok ? fresh : saved;
  } catch {
    return saved;
  }
}

/** A built file: the saved copy (its name changes with its content), else the NAS's. */
async function answerFile(request: Request): Promise<Response> {
  const saved = await caches.match(request, { cacheName: SHELL });
  return saved ?? fetch(request);
}
