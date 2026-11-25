/**
 * Registers the service worker, which keeps a copy of the app (and lets
 * Android install it and share links to it). Only in the built app, and only
 * where browsers allow it: HTTPS (the Tailscale address), or localhost.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(error => {
      console.warn('The service worker could not be registered:', error);
    });
  });
}
