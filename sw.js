// ============================================
// sw.js - INDapk PWA v3.0
// FIXED: REAL-TIME NOTIFICATION RECEIVER
// ============================================

const VERSION = "v3.0.0";
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

const NOTIFICATION_API_URL = "https://script.google.com/macros/s/AKfycbzcVDAcVxcWQ7yL8LBRb1mrPSmu8qr-9T_ykg925vu7o2_kUO7QmWtv_10XyImNu--A/exec";

// ============================================
// INSTALL - PRECACHE STATIC ASSETS
// ============================================
self.addEventListener("install", (event) => {
  console.log("✅ SW v3.0 Installing...");
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
  console.log("✅ SW v3.0 Activated");
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

  if (url.origin === self.location.origin) {
    const dest = req.destination;
    if (["script", "style", "image", "font"].includes(dest)) {
      event.respondWith(cacheFirst(req));
      return;
    }
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (["script", "style", "image", "font"].includes(req.destination)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

// ============================================
// FIX: MESSAGE HANDLER - TERIMA NOTIF DARI PAGE
// ============================================
self.addEventListener('message', function(event) {
  console.log('📨 SW Received:', event.data);
  
  const data = event.data;
  
  if (data && data.type === 'SHOW_NOTIFICATION') {
    showGameNotification(data.payload);
  }
  
  if (data && data.type === 'NEW_NOTIFICATIONS') {
    const notifications = data.payload;
    notifications.forEach(notif => {
      const game = {
        game_id: notif.game_id,
        platform: notif.platform,
        game_name: notif.game_name,
        download_id: notif.download_id,
        thumbnail_url: notif.thumbnail_url || ''
      };
      showGameNotification(game);
    });
  }
  
  if (data && data.type === 'GET_PENDING_NOTIFICATIONS') {
    fetchPendingNotifications();
  }
  
  if (data && data.type === 'PUSH_NOTIFICATION') {
    const game = data.payload;
    showGameNotification(game);
  }
});

// ============================================
// FIX: FETCH PENDING NOTIFICATIONS DARI SERVER
// ============================================
async function fetchPendingNotifications() {
  try {
    console.log('🔍 SW: Checking for pending notifications...');
    
    const response = await fetch(NOTIFICATION_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        action: 'getPendingNotifications'
      })
    });
    
    const result = await response.json();
    
    if (result.status === 'success' && result.count > 0) {
      const pending = result.data;
      
      console.log(`🎮 SW: Found ${pending.length} pending notifications!`);
      
      if (pending.length > 0) {
        const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        
        clientsList.forEach(client => {
          client.postMessage({
            type: 'PENDING_NOTIFICATIONS',
            payload: pending
          });
        });
        
        pending.forEach(notif => {
          const game = {
            game_id: notif.game_id,
            platform: notif.platform,
            game_name: notif.game_name,
            download_id: notif.download_id,
            thumbnail_url: notif.thumbnail_url || ''
          };
          showGameNotification(game);
        });
        
        for (const notif of pending) {
          try {
            await fetch(NOTIFICATION_API_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                action: 'markNotificationSent',
                game_id: notif.game_id
              })
            });
          } catch (e) {
            console.error('❌ SW: Failed to mark notification as sent:', e);
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ SW: Error fetching notifications:', error);
  }
}

// ============================================
// SHOW NOTIFICATION
// ============================================
async function showGameNotification(game) {
  console.log('🎮 Showing notification:', game);
  
  if (!game || !game.game_name) {
    console.error('❌ Invalid game data:', game);
    return;
  }
  
  const platformIcons = {
    'ps1': '🎮 PS1', 'ps2': '🎮 PS2', 'ps3': '🎮 PS3', 'ps4': '🎮 PS4',
    'switch': '🕹️ Switch', 'psp': '📱 PSP', 'psvita': '📱 PS Vita',
    'android': '🤖 Android', 'pc': '💻 PC', 'wii': '🎮 Wii',
    'gamecube': '📦 Gamecube', '3ds': '📟 3DS', 'java': '☕ Java',
    'ios': '🍎 iOS', 'apksgi': '🔞 APKsgi'
  };
  
  const platformDisplay = platformIcons[game.platform] || `🎯 ${game.platform.toUpperCase()}`;
  let thumbnailUrl = game.thumbnail_url || '/icons/icon-192x192.png';
  
  if (thumbnailUrl.includes('placehold.co') || !thumbnailUrl) {
    thumbnailUrl = '/icons/icon-192x192.png';
  }
  
  const gameUrl = `https://indapk.github.io/download.html?game=${game.download_id}&platform=${game.platform}`;
  
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
// NOTIFICATION CLICK HANDLER
// ============================================
self.addEventListener('notificationclick', function(event) {
  console.log('👆 Notification clicked:', event.action);
  
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  
  notification.close();
  
  let url = data.url || '/';
  
  if (action === 'open' || action === 'download' || action === '') {
    url = data.url || `https://indapk.github.io/download.html?game=${data.download_id}&platform=${data.platform}`;
  } else if (action === 'close') {
    return;
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(data.download_id) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// ============================================
// NOTIFICATION CLOSE HANDLER
// ============================================
self.addEventListener('notificationclose', function(event) {
  console.log('❌ Notification closed:', event.notification.tag);
});

// ============================================
// PERIODIC SYNC (EXPERIMENTAL)
// ============================================
self.addEventListener('periodicsync', function(event) {
  if (event.tag === 'check-indapk-notifications') {
    console.log('🔄 Periodic sync: checking notifications...');
    event.waitUntil(fetchPendingNotifications());
  }
});

// ============================================
// SYNC EVENT - UNTUK RETRY
// ============================================
self.addEventListener('sync', function(event) {
  if (event.tag === 'retry-notifications') {
    console.log('🔄 Sync: retry failed notifications');
    event.waitUntil(fetchPendingNotifications());
  }
});

// ============================================
// PUSH EVENT (FALLBACK)
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
// BACKGROUND FETCH
// ============================================
self.addEventListener('backgroundfetchsuccess', function(event) {
  console.log('✅ Background fetch succeeded:', event.registration.id);
  
  event.waitUntil(
    (async function() {
      const records = await event.registration.matchAll();
      const response = await records[0].responseReady;
      const blob = await response.blob();
      
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
// AUTO CHECK EVERY 15 SECONDS
// ============================================
setInterval(() => {
  console.log('🔄 SW: Auto-checking for notifications...');
  fetchPendingNotifications();
}, 15000); // 15 DETIK!

// Initial check after 3 seconds
setTimeout(() => {
  console.log('🔄 SW: Initial notification check...');
  fetchPendingNotifications();
}, 3000);

console.log('🚀 SW v3.0 Ready - Real-time notifications enabled! (Check every 15 seconds)');
