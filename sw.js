/* Caché básica para abrir la app sin conexión. Red primero para recibir siempre la última versión. */
const CACHE = 'deucepoint-v5';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'seed-exercises.js', 'seed-foods.js', 'nutri.js', 'auto.js', 'fotos.js', 'menus.js', 'gestion.js', 'manifest.json', 'favicon.png', 'icon-192.png', 'logo.png', 'logo-mark.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
