// Offline-first cache. Bump VERSION (build does it) to refresh.
const VERSION = 'ed4c552-muvjiy41';
const FILES = ['./', 'index.html', 'lab.js', 'engine.js', 'charts.js', 'styles.css', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(VERSION).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
