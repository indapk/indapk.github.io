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

// =====================================================
// PUSH NOTIFICATION HANDLER
// =====================================================

// Push event listener untuk notifikasi
self.addEventListener('push', function(event) {
    if (!event.data) return;
    
    try {
        const data = event.data.json();
        
        const options = {
            body: data.body || 'Game baru telah ditambahkan ke INDapk!',
            icon: data.icon || '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            vibrate: [200, 100, 200],
            data: {
                url: data.url || '/',
                gameId: data.gameId,
                platform: data.platform
            },
            actions: [
                {
                    action: 'open',
                    title: '🔍 Lihat Game'
                },
                {
                    action: 'close',
                    title: '❌ Tutup'
                }
            ],
            silent: false,
            renotify: true,
            tag: data.tag || 'new-game',
            requireInteraction: true
        };
        
        event.waitUntil(
            self.registration.showNotification(
                data.title || '🎮 Game Baru di INDapk',
                options
            )
        );
    } catch (error) {
        console.error('Error showing push notification:', error);
    }
});

// Notification click handler
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    if (event.action === 'close') {
        return;
    }
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function(clientList) {
            // Cek apakah sudah ada tab yang terbuka
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Buka tab baru
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Background sync untuk cek game baru
self.addEventListener('sync', function(event) {
    if (event.tag === 'check-new-games') {
        event.waitUntil(checkNewGamesInBackground());
    }
});

// Fungsi untuk cek game baru di background
async function checkNewGamesInBackground() {
    try {
        const NOTIFICATION_API_URL = "https://script.google.com/macros/s/YOUR_DEPLOYED_URL/exec";
        
        const response = await fetch(NOTIFICATION_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'action=checkNewGames'
        });
        
        const result = await response.json();
        
        if (result.status === 'success' && result.count > 0) {
            // Kirim notifikasi untuk setiap game baru
            result.data.forEach(game => {
                self.registration.showNotification(`🎮 Game Baru: ${game.name}`, {
                    body: `Platform: ${game.platform}\nKlik untuk melihat detail`,
                    icon: game.thumbnail || '/icons/icon-192x192.png',
                    badge: '/icons/icon-192x192.png',
                    vibrate: [200, 100, 200],
                    data: {
                        url: `https://indapk.github.io/download.html?game=${game.download_id}&platform=${game.platform}`,
                        gameId: game.id
                    }
                });
            });
        }
        
        return result;
    } catch (error) {
        console.error('Background sync error:', error);
    }
}
