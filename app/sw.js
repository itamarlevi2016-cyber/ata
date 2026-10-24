// Offline cache for English Quest. Bump VERSION whenever app files change.
const VERSION = 'english-quest-v2';
const ASSETS = [
  './', './index.html', './app.js', './quest.js', './style.css', './quest.css', './manifest.webmanifest',
  './assets/teacher.webp', './assets/kingdom.webp', './assets/icon.svg',
  './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate for same-origin GETs: serve from cache at once,
// refresh the cache in the background, fall back to the cached shell offline.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const refresh = fetch(req).then(res => {
        if (res.ok) caches.open(VERSION).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
      if (hit) { e.waitUntil(refresh.catch(() => {})); return hit; }
      return refresh;
    })
  );
});
