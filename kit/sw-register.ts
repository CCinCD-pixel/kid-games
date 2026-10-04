/**
 * Service-worker registration. dist/sw.js is generated at build time (tools/sw/).
 * A new version waits until a page that passes `activateWaiting: true` (the hub) tells it to take
 * over, so a game in progress is never swapped underneath the child. Not registered in `vite dev`.
 */
export function registerServiceWorker(opts: { activateWaiting?: boolean } = {}): void {
  if (import.meta.env.DEV || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!/^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.href)) return;
  const activate = (w: ServiceWorker | null) => {
    if (w && opts.activateWaiting) w.postMessage({ type: 'SKIP_WAITING' });
  };
  const run = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        activate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) activate(w);
          });
        });
      })
      .catch(() => {});
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}
