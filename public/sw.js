// Service Worker de UCP Horas
// - Estáticos: cache-first (la app funciona sin conexión una vez instalada)
// - API: network-first (los datos siempre frescos; sin conexión responde error claro)
// - Push: muestra notificaciones nativas aunque la app esté cerrada
const CACHE = 'ucp-horas-v2';
const SHELL = ['/', '/index.html', '/manifest.json'];

// ===== Notificaciones push (llegan con la app cerrada) =====
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { mensaje: e.data ? e.data.text() : '' }; }
  e.waitUntil(
    self.registration.showNotification(data.titulo || 'UCP Horas', {
      body: data.mensaje || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'ucp-aviso',
      renotify: true,
      data: { enlace: data.enlace || '/' },
    })
  );
});

// Al tocar la notificación: abrir/enfocar la app en el enlace indicado
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = e.notification.data?.enlace || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ('focus' in c) {
          try { c.navigate(destino); } catch {}
          return c.focus();
        }
      }
      return clients.openWindow(destino);
    })
  );
});

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // API y uploads: siempre red primero, nunca se guardan en caché
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión a internet' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Navegaciones (rutas del SPA): red primero, si falla servir el shell
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
    return;
  }

  // Estáticos del mismo origen: caché primero, se actualiza en segundo plano
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const red = fetch(e.request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return resp;
        }).catch(() => cached);
        return cached || red;
      })
    );
  }
});
