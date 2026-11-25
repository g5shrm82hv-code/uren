/* Derks Uren – service worker: alles offline beschikbaar.
 * Na een update van de bestanden: verhoog VERSION, dan haalt de app de nieuwe versie op.
 */
const VERSION = 'derks-uren-v1.0.2';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app.css',
  './time.js',
  './form-config.js',
  './pdf.js',
  './app.js',
  './logo.png',
  './formulier.jpg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Eerst uit de cache (snel en offline); op de achtergrond verversen als er netwerk is.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        if (hit) { e.waitUntil(net); return hit; }
        return net.then((res) => res || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error()));
      })
    )
  );
});
