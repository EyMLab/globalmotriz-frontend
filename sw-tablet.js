const CACHE_NAME = 'tablet-insumos-v1';

const ASSETS = [
  'tablet.html',
  'css/tablet.css',
  'js/tablet-offline.js',
  'js/tablet-app.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.origin !== location.origin) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('{"error":"offline"}', {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
