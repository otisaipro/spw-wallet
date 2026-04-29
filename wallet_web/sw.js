// SW v3: navigate requests use network-first instead of cache-first so a
// freshly-deployed HTML is picked up on the very next PWA open. Cache is
// only the fallback for offline. Static assets stay cache-first (icons,
// images don't change often). Bumping CACHE name forces install+activate
// to run and prune the old shell that pinned the buggy renderTxItem.
const CACHE = 'spw-wallet-v3';

const SHELL = [
  '/',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API and cross-origin: always network, never cached.
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) return;

  // Navigation (HTML): NETWORK-FIRST.
  // Why: this app's HTML carries all the JS — when we ship a fix we must
  // not serve a stale shell. Falls back to cached '/' only when the user
  // is offline or the network call fails.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('/', copy));
        }
        return res;
      }).catch(() =>
        caches.open(CACHE).then(c => c.match('/').then(r => r || Response.error()))
      )
    );
    return;
  }

  // Static assets: cache-first (these rarely change).
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      });
    })
  );
});
