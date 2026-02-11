// sw.js - INDapk PWA
const VERSION = "v1.0.0";
const STATIC_CACHE = `indapk-static-${VERSION}`;
const RUNTIME_CACHE = `indapk-runtime-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/offline.html",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png"
];

// Install: precache file penting
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate: bersihin cache versi lama
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (![STATIC_CACHE, RUNTIME_CACHE].includes(key)) {
          return caches.delete(key);
        }
      })
    )).then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const res = await fetch(request);
  const cache = await caches.open(RUNTIME_CACHE);
  cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((res) => {
    cache.put(request, res.clone());
    return res;
  }).catch(() => null);

  return cached || (await fetchPromise) || caches.match(OFFLINE_URL);
}

// Fetch: strategi untuk halaman dan asset
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Hanya GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Navigasi halaman: Network First, fallback cache, fallback offline
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || (await caches.match(OFFLINE_URL));
      }
    })());
    return;
  }

  // Same-origin asset: cache-first untuk cepat
  if (url.origin === self.location.origin) {
    const dest = req.destination; // "script", "style", "image", "font", dll
    if (["script", "style", "image", "font"].includes(dest)) {
      event.respondWith(cacheFirst(req));
      return;
    }
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Cross-origin (CDN, gambar luar): runtime caching ringan
  if (["script", "style", "image", "font"].includes(req.destination)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

// ====== PUSH NOTIFICATION HANDLER ======

self.addEventListener('push', function(event) {
  if (!event.data) {
    console.log('Push event but no data');
    return;
  }

  try {
    const data = event.data.json();
    console.log('Push data received:', data);

    const options = {
      body: data.body || 'Game baru tersedia!',
      icon: data.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/',
        gameId: data.gameId,
        platform: data.platform,
        timestamp: Date.now()
      },
      actions: data.actions || [
        { action: 'open', title: 'Lihat Game' },
        { action: 'close', title: 'Tutup' }
      ],
      requireInteraction: true,
      silent: false,
      renotify: true,
      tag: data.tag || `game-${Date.now()}`
    };

    event.waitUntil(
      self.registration.showNotification(
        data.title || '🎮 Game Baru INDapk',
        options
      )
    );

  } catch (error) {
    console.error('Error showing push notification:', error);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data;

  if (action === 'close') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Cek apakah sudah ada tab yang terbuka
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(data.url) && 'focus' in client) {
            return client.focus();
          }
        }
        // Buka tab baru
        if (clients.openWindow) {
          return clients.openWindow(data.url || '/');
        }
      })
  );
});

// Notification close handler
self.addEventListener('notificationclose', function(event) {
  console.log('Notification was closed', event.notification.tag);
});

// ====== PERIODIC BACKGROUND SYNC ======
// Untuk cek notifikasi periodik (experimental)

self.addEventListener('periodicsync', function(event) {
  if (event.tag === 'check-new-games') {
    event.waitUntil(
      fetch('/api/check-notifications')
        .then(response => response.json())
        .then(data => {
          if (data.notifications && data.notifications.length > 0) {
            return self.registration.showNotification('Game Baru!', {
              body: `Ada ${data.notifications.length} game baru tersedia`,
              icon: '/icons/icon-192x192.png',
              badge: '/icons/icon-192x192.png'
            });
          }
        })
        .catch(err => console.error('Periodic sync error:', err))
    );
  }
});
