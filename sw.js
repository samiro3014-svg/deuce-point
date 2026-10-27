/* Caché básica para abrir la app sin conexión. Red primero para recibir siempre la última versión. */
const CACHE = 'deucepoint-v10';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'seed-exercises.js', 'seed-foods.js', 'nutri.js', 'auto.js', 'fotos.js', 'menus.js', 'gestion.js', 'tenis.js', 'nutricion2.js', 'comunidad.js', 'negocio.js', 'importar.js', 'personalizar.js', 'diario.js', 'entreno2.js', 'seguimiento.js', 'alimentacion.js', 'entreno3.js', 'experiencia.js', 'analisis.js', 'negocio2.js', 'acudiente.html', 'inicio.html', 'manifest.json', 'favicon.png', 'icon-192.png', 'logo.png', 'logo-mark.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
/* Notificaciones push (enviadas por la función «enviar-notificaciones» de Supabase) */
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Deuce Point', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Deuce Point', { body: d.body || '', icon: 'icon-192.png', badge: 'favicon.png', tag: d.tag || undefined, actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : [], data: { url: d.url || './', urls: d.urls || {} } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const dd = e.notification.data || {};
  const url = new URL((e.action && dd.urls && dd.urls[e.action]) || dd.url || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => { for (const w of ws) { if ('focus' in w) { w.navigate ? w.navigate(url) : null; return w.focus(); } } return clients.openWindow(url); }));
});
