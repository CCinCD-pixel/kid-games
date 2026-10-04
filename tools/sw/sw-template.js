/* 星港 service worker — GENERATED at build time by tools/sw/build-sw.mjs from the dist file list.
 * Do not edit dist/sw.js; edit tools/sw/sw-template.js.
 *
 * Caches
 *   kg-shell-<VERSION>  versioned precache of HTML/JS/CSS/images (replaced on every deploy)
 *   kg-media-v1         audio / models / fonts, lazily cached, keyed by URL and checked against the
 *                       content hash in MEDIA; survives deploys, stale entries pruned on activate
 * Strategy
 *   navigations         network-first with a 3 s timeout, then the cached page, then the hub
 *   precached files     cache-first (they are versioned by VERSION)
 *   media               cache-first with hash check; Range requests answered from cache (206)
 *   anything else       network, falling back to cache
 * Rules
 *   never cache or replay a redirected response (Safari rejects them for navigations)
 *   a new version waits; the hub page sends {type:'SKIP_WAITING'} so a game is never swapped mid-play
 */
/* eslint-disable no-restricted-globals */
const MANIFEST = self.__KG_MANIFEST__;
const VERSION = MANIFEST.version;
const SHELL = `kg-shell-${VERSION}`;
const MEDIA = 'kg-media-v1';
const NAV_TIMEOUT_MS = 3000;
const PRECACHE = new Set(MANIFEST.precache);
const MEDIA_HASH = MANIFEST.media; // { "/audio/x/y.m4a": "sha1" }
const PAGES = MANIFEST.pages; // ["/", "/chess/", ...]

const sameOrigin = (url) => url.origin === self.location.origin;
const cacheable = (res) => res && res.status === 200 && res.type === 'basic' && !res.redirected;

function pageKey(pathname) {
  if (pathname.endsWith('/index.html')) return pathname.slice(0, -'index.html'.length);
  if (pathname.endsWith('/')) return pathname;
  if (!/\.[a-z0-9]+$/i.test(pathname)) return pathname + '/';
  return pathname;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // One by one so a single failure (e.g. a flaky request) does not abort the whole install.
    await Promise.all([...PRECACHE].map(async (path) => {
      try {
        const res = await fetch(new Request(path, { cache: 'no-cache', credentials: 'same-origin' }));
        if (cacheable(res)) await cache.put(path, res);
      } catch (_) { /* fetched again at runtime */ }
    }));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key === SHELL || key === MEDIA) continue;
      if (key.startsWith('kg-') || key.startsWith('kid-games')) await caches.delete(key);
    }
    // prune media entries that are gone or whose content changed
    const media = await caches.open(MEDIA);
    for (const req of await media.keys()) {
      const p = new URL(req.url).pathname;
      const res = await media.match(req);
      const h = res && res.headers.get('x-kg-hash');
      if (!MEDIA_HASH[p] || h !== MEDIA_HASH[p]) await media.delete(req);
    }
    await self.clients.claim();
  })());
});

async function withMediaHash(res, hash) {
  const headers = new Headers(res.headers);
  headers.set('x-kg-hash', hash);
  return new Response(await res.blob(), { status: 200, statusText: 'OK', headers });
}

async function rangeResponse(res, rangeHeader) {
  const blob = await res.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || '');
  const size = blob.size;
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const headers = new Headers(res.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(blob.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}

async function handleMedia(request, path) {
  const cache = await caches.open(MEDIA);
  const range = request.headers.get('range');
  const hit = await cache.match(path);
  if (hit && hit.headers.get('x-kg-hash') === MEDIA_HASH[path]) return range ? rangeResponse(hit, range) : hit;
  if (range) {
    // Let the network serve partial content; fill the cache in the background with a full fetch.
    fetch(path, { credentials: 'same-origin' }).then(async (full) => {
      if (cacheable(full)) await cache.put(path, await withMediaHash(full, MEDIA_HASH[path]));
    }).catch(() => {});
    return fetch(request);
  }
  const res = await fetch(request);
  if (cacheable(res)) {
    const stored = await withMediaHash(res.clone(), MEDIA_HASH[path]);
    await cache.put(path, stored);
  }
  return res;
}

async function matchPage(pathname) {
  const key = pageKey(pathname);
  const cache = await caches.open(SHELL);
  return (await cache.match(key, { ignoreSearch: true }))
    || (await cache.match(key + 'index.html', { ignoreSearch: true }))
    || null;
}

async function handleNavigate(event, url) {
  const network = fetch(event.request).then(async (res) => {
    if (cacheable(res) && PAGES.includes(pageKey(url.pathname))) {
      const cache = await caches.open(SHELL);
      await cache.put(pageKey(url.pathname), res.clone());
    }
    return res; // an opaqueredirect (redirect mode "manual") is returned untouched, never cached
  });
  event.waitUntil(network.catch(() => {}));
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), NAV_TIMEOUT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first !== 'timeout') return first;
    const cached = await matchPage(url.pathname);
    return cached || await network;
  } catch (_) {
    const cached = await matchPage(url.pathname);
    if (cached) return cached;
    const hub = await matchPage('/');
    return hub || Response.error();
  }
}

async function handleStatic(request, path) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(path);
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) await cache.put(path, res.clone());
  return res;
}

async function handleOther(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;
  if (url.pathname === '/sw.js') return;
  if (request.mode === 'navigate') { event.respondWith(handleNavigate(event, url)); return; }
  if (MEDIA_HASH[url.pathname]) { event.respondWith(handleMedia(request, url.pathname)); return; }
  if (PRECACHE.has(url.pathname)) { event.respondWith(handleStatic(request, url.pathname)); return; }
  event.respondWith(handleOther(request));
});
