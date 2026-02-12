// ============================================
// sw.js - INDapk PWA v2.0
// PUSH NOTIFICATION WITHOUT VAPID
// MENGGUNAKAN BACKGROUND SYNC & FETCH POLLING
// ============================================

const VERSION = "v2.0.0";
const STATIC_CACHE = `indapk-static-${VERSION}`;
const RUNTIME_CACHE = `indapk-runtime-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  "/",
  "/index.html",
  "/download.html",
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png"
];

// ============================================
// INSTALL - PRECACHE STATIC ASSETS
// ============================================
self.addEventListener("install", (event) => {
  console.log("✅ SW Installing...");
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ============================================
// ACTIVATE - CLEAN OLD CACHES
// ============================================
self.addEventListener("activate", (event) => {
  console.log("✅ SW Activating...");
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (![STATIC_CACHE, RUNTIME_CACHE].includes(key)) {
          console.log("🗑️ Deleting old cache:", key);
          return caches.delete(key);
        }
      })
    )).then(() => self.clients.claim())
  );
});

// ============================================
// CACHE STRATEGIES
// ============================================
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

// ============================================
// FETCH HANDLER
// ============================================
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Navigasi halaman: Network First
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

  // Same-origin asset: cache-first
  if (url.origin === self.location.origin) {
    const dest = req.destination;
    if (["script", "style", "image", "font"].includes(dest)) {
      event.respondWith(cacheFirst(req));
      return;
    }
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Cross-origin assets
  if (["script", "style", "image", "font"].includes(req.destination)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

// ============================================
// 🚨 PUSH NOTIFICATION HANDLER
// MENERIMA NOTIFIKASI DARI ADMIN VIA POST MESSAGE
// ============================================

// LISTENER UNTUK MENERIMA NOTIFIKASI DARI HALAMAN
self.addEventListener('message', function(event) {
  console.log('📨 SW Received message:', event.data);
  
  const data = event.data;
  
  if (data && data.type === 'SHOW_NOTIFICATION') {
    showGameNotification(data.payload);
  }
  
  if (data && data.type === 'CHECK_NEW_GAMES') {
    checkNewGames();
  }
});

// FUNCTION UNTUK MENAMPILKAN NOTIFIKASI GAME
async function showGameNotification(game) {
  console.log('🎮 Showing notification for:', game);
  
  // Format platform untuk display
  const platformIcons = {
    'ps1': '🎮 PS1', 'ps2': '🎮 PS2', 'ps3': '🎮 PS3', 'ps4': '🎮 PS4', 'ps5': '🎮 PS5',
    'psvita': '📱 PS Vita', 'psp': '📱 PSP',
    'switch': '🕹️ Switch', '3ds': '📟 3DS', 'wii': '🎮 Wii', 'wiiu': '🎮 Wii U', 'gamecube': '📦 GameCube',
    'android': '🤖 Android', 'ios': '🍎 iOS', 'pc': '💻 PC',
    'java': '☕ Java', 'apksgi': '🔞 APKsgi'
  };
  
  const platformDisplay = platformIcons[game.platform] || `🎯 ${game.platform.toUpperCase()}`;
  
  // Buat thumbnail URL (pakai proxy jika perlu)
  let thumbnailUrl = game.thumbnail_url || '/icons/icon-192x192.png';
  if (!thumbnailUrl || thumbnailUrl.includes('placehold.co')) {
    thumbnailUrl = '/icons/icon-192x192.png';
  }
  
  // Buat URL untuk dibuka
  const gameUrl = game.url || `https://indapk.github.io/download.html?game=${game.download_id}&platform=${game.platform}`;
  
  const options = {
    body: `${platformDisplay}\n🎯 ${game.game_name}`,
    icon: thumbnailUrl,
    badge: '/icons/icon-192x192.png',
    image: thumbnailUrl,
    vibrate: [200, 100, 200],
    data: {
      url: gameUrl,
      game_id: game.game_id,
      platform: game.platform,
      game_name: game.game_name,
      download_id: game.download_id,
      timestamp: Date.now()
    },
    actions: [
      { action: 'open', title: '🔍 Lihat Game' },
      { action: 'download', title: '⬇️ Download' },
      { action: 'close', title: '✖️ Tutup' }
    ],
    requireInteraction: true,
    silent: false,
    renotify: true,
    tag: `game-${game.game_id || Date.now()}`,
    timestamp: Date.now()
  };

  return self.registration.showNotification(
    `🎮 GAME BARU: ${game.platform.toUpperCase()}`,
    options
  );
}

// ============================================
// 🔍 CHECK NEW GAMES FROM SERVER (POLLING)
// ============================================
async function checkNewGames() {
  console.log('🔍 SW: Checking for new games...');
  
  try {
    // AMBIL DARI LOCALSTORAGE VIA CLIENTS
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    
    for (const client of clientsList) {
      client.postMessage({ type: 'GET_PENDING_NOTIFICATIONS' });
    }
    
  } catch (error) {
    console.error('❌ SW: Error checking new games:', error);
  }
}

// ============================================
// 👆 NOTIFICATION CLICK HANDLER
// ============================================
self.addEventListener('notificationclick', function(event) {
  console.log('👆 Notification clicked:', event.action);
  
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  
  notification.close();
  
  // Handle actions
  let url = data.url || '/';
  
  if (action === 'open' || action === 'download' || action === '') {
    // Default action: buka halaman game
    url = data.url || `https://indapk.github.io/download.html?game=${data.download_id}&platform=${data.platform}`;
  } else if (action === 'close') {
    return; // Tutup notifikasi, tidak buka apa2
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Cek apakah sudah ada tab dengan URL yang sama
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(data.download_id) && 'focus' in client) {
            return client.focus();
          }
        }
        // Buka tab baru
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// ============================================
// ❌ NOTIFICATION CLOSE HANDLER
// ============================================
self.addEventListener('notificationclose', function(event) {
  console.log('❌ Notification closed:', event.notification.tag);
});

// ============================================
// 📱 PERIODIC BACKGROUND SYNC (EXPERIMENTAL)
// ============================================
self.addEventListener('periodicsync', function(event) {
  if (event.tag === 'check-indapk-games') {
    console.log('🔄 Periodic sync: checking games...');
    event.waitUntil(checkNewGames());
  }
});

// ============================================
// 🔄 SYNC EVENT - UNTUK RETRY GAGAL
// ============================================
self.addEventListener('sync', function(event) {
  if (event.tag === 'retry-notifications') {
    console.log('🔄 Sync: retry failed notifications');
    event.waitUntil(checkNewGames());
  }
});

// ============================================
// 📨 PUSH EVENT (TANPA VAPID - HANYA UNTUK COMPATIBILITY)
// ============================================
self.addEventListener('push', function(event) {
  console.log('📨 Push event received (fallback)');
  
  if (!event.data) {
    return;
  }
  
  try {
    const data = event.data.json();
    showGameNotification(data);
  } catch (e) {
    console.error('Error parsing push data:', e);
  }
});

// ============================================
// 💾 BACKGROUND FETCH (UNTUK DOWNLOAD)
// ============================================
self.addEventListener('backgroundfetchsuccess', function(event) {
  console.log('✅ Background fetch succeeded:', event.registration.id);
  
  event.waitUntil(
    (async function() {
      const records = await event.registration.matchAll();
      const response = await records[0].responseReady;
      const blob = await response.blob();
      
      // Trigger download di client
      const clientsList = await clients.matchAll({ type: 'window' });
      for (const client of clientsList) {
        client.postMessage({
          type: 'DOWNLOAD_COMPLETE',
          payload: {
            id: event.registration.id,
            blob: URL.createObjectURL(blob)
          }
        });
      }
    })()
  );
});

// ============================================
// 🆘 OFFLINE FALLBACK
// ============================================
self.addEventListener('offline', function() {
  console.log('📴 App is offline');
});

console.log('🚀 Service Worker v2.0.0 loaded - Ready for notifications!');
