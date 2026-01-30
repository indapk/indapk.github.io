// sw.js - INDapk PWA with Push Notifications
const VERSION = "v1.2.0";
const STATIC_CACHE = `indapk-static-${VERSION}`;
const RUNTIME_CACHE = `indapk-runtime-${VERSION}`;
const NOTIFICATION_CACHE = `indapk-notifications-${VERSION}`;
const OFFLINE_URL = "/offline.html";

// Konfigurasi URL API Game
const API_URLS = {
  ps2: "https://script.google.com/macros/s/AKfycbwvTmKNFx0rxWjAAlTpQk9h0hnFD-GcKZcUG4g3MtHFJLnw86lPGqgSoQuuVUJDe1xy/exec",
  switch: "https://script.google.com/macros/s/AKfycbytk1iwBYb2xGF2j3fjTmTFBNzQ_ifXsxrddlDWuPPNdMjWbHvyiRppEcoq0V1BGjn-/exec",
  psp: "https://script.google.com/macros/s/AKfycbxCg1_l60T858d14WKA3N8c23VJ_YYj_XxX2H4Rqad1tSwaolutSrksSw9ippHu1QOA/exec",
  android: "https://script.google.com/macros/s/AKfycbwjF-qp6zHQGiBchoReCX3xLpWSLJysoUsRDDiXbm3nZ51RdaLWrpCh5jqno5A-Rmn4/exec",
  psvita: "https://script.google.com/macros/s/AKfycbySh1tyONA4ib6wNwq6ZXoHKiMX1P4e0rZ-4IvMiZTEyjJ6XDm1hdPwakYcOeuWPE_IQg/exec",
  wii: "https://script.google.com/macros/s/AKfycbz8uhfQtYxyUmZSVloZlY0UDxkQayeYAemS6zDXS4zDKKJ-DYuq16pqFJLkNCYXg18a/exec",
  gamecube: "https://script.google.com/macros/s/AKfycbzN2P7leht4d5IM_zHmevEi4-jhqL_CjzHF31dlrSvR1osR1COe3oocfKR5PC86wE6Oig/exec",
  '3ds': "https://script.google.com/macros/s/AKfycbwvTthKe_U-lCNxMu4c4WtuJbfp3Xzt8aWyAT10hFU1LXsKmsTidBoCnTQfShokliVq/exec",
  pc: "https://script.google.com/macros/s/AKfycbxKEqdp8W2YOvP-s11-Py8mmt-qBStCFr6pdnV2kjTCX3tDI04xBtlfH5XDE3ldx2Kd3Q/exec"
};

const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/offline.html",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"
];

// Install: precache file penting
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE)),
      caches.open(NOTIFICATION_CACHE).then(cache => cache.put('notified_games', new Response(JSON.stringify([])))),
      self.skipWaiting()
    ])
  );
});

// Activate: bersihin cache versi lama
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => 
        Promise.all(keys.map(key => {
          if (![STATIC_CACHE, RUNTIME_CACHE, NOTIFICATION_CACHE].includes(key)) {
            return caches.delete(key);
          }
        }))
      ),
      self.clients.claim()
    ])
  );
  
  // Mulai background sync untuk cek game baru
  event.waitUntil(startBackgroundSync());
});

// Background Sync untuk cek game baru setiap 5 menit
async function startBackgroundSync() {
  if ('periodicSync' in self.registration) {
    try {
      await self.registration.periodicSync.register('check-new-games', {
        minInterval: 5 * 60 * 1000, // 5 menit
      });
    } catch (error) {
      console.log('Periodic Sync gagal:', error);
    }
  }
}

// Fungsi untuk mendapatkan game yang sudah dinotifikasi
async function getNotifiedGames() {
  try {
    const cache = await caches.open(NOTIFICATION_CACHE);
    const response = await cache.match('notified_games');
    if (response) {
      return await response.json();
    }
  } catch (error) {
    console.error('Error getting notified games:', error);
  }
  return [];
}

// Fungsi untuk menyimpan game yang sudah dinotifikasi
async function saveNotifiedGames(games) {
  try {
    const cache = await caches.open(NOTIFICATION_CACHE);
    await cache.put('notified_games', new Response(JSON.stringify(games)));
  } catch (error) {
    console.error('Error saving notified games:', error);
  }
}

// Fungsi untuk cek game baru dari semua platform
async function checkForNewGames() {
  try {
    const notifiedGames = await getNotifiedGames();
    const newGames = [];
    
    // Cek setiap platform
    for (const [platform, url] of Object.entries(API_URLS)) {
      try {
        const response = await fetch(`${url}?action=getAllGames&timestamp=${Date.now()}`);
        if (!response.ok) continue;
        
        const result = await response.json();
        if (result.status === 'success' && Array.isArray(result.data)) {
          // Filter game baru (hari ini)
          const today = new Date().toDateString();
          const platformNewGames = result.data.filter(game => {
            const gameDate = new Date(game.timestamp || game.date_added || Date.now()).toDateString();
            const gameId = `${platform}-${game.download_id || game.nama_game}`;
            return gameDate === today && !notifiedGames.includes(gameId);
          });
          
          // Tambahkan platform info
          platformNewGames.forEach(game => {
            newGames.push({
              ...game,
              platform: platform,
              platform_name: getPlatformName(platform)
            });
          });
        }
      } catch (error) {
        console.error(`Error checking ${platform}:`, error);
      }
    }
    
    return newGames;
  } catch (error) {
    console.error('Error checking new games:', error);
    return [];
  }
}

// Fungsi helper untuk nama platform
function getPlatformName(platform) {
  const names = {
    ps2: 'PlayStation 2',
    switch: 'Nintendo Switch',
    psp: 'PSP',
    android: 'Android',
    psvita: 'PS Vita',
    wii: 'Wii',
    gamecube: 'Gamecube',
    '3ds': '3DS',
    pc: 'PC'
  };
  return names[platform] || platform;
}

// Tampilkan notifikasi
async function showNotification(game) {
  const options = {
    body: `Platform: ${game.platform_name}\n${game.category || ''}`,
    icon: game.thumbnail_url || '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: `new-game-${game.platform}-${game.download_id || game.nama_game}`,
    timestamp: Date.now(),
    data: {
      url: `/download.html?game=${game.download_id}&platform=${game.platform}`,
      gameId: `${game.platform}-${game.download_id || game.nama_game}`
    },
    actions: [
      {
        action: 'open',
        title: 'Lihat Detail'
      },
      {
        action: 'dismiss',
        title: 'Tutup'
      }
    ]
  };
  
  await self.registration.showNotification(
    `🎮 ${game.nama_game || game.ori_name || 'Game Baru'}`,
    options
  );
}

// Event listener untuk periodic sync
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-new-games') {
    event.waitUntil(checkAndNotifyNewGames());
  }
});

// Cek dan notifikasi game baru
async function checkAndNotifyNewGames() {
  const newGames = await checkForNewGames();
  const notifiedGames = await getNotifiedGames();
  
  for (const game of newGames) {
    const gameId = `${game.platform}-${game.download_id || game.nama_game}`;
    
    // Tampilkan notifikasi
    await showNotification(game);
    
    // Simpan ke cache
    notifiedGames.push(gameId);
  }
  
  if (newGames.length > 0) {
    await saveNotifiedGames(notifiedGames);
    
    // Update badge
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'NEW_GAMES_COUNT',
        count: newGames.length
      });
    });
  }
}

// Event listener untuk push notification
self.addEventListener('push', (event) => {
  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: 'Game Baru!',
        body: 'Ada game baru yang tersedia',
        icon: '/icons/icon-192x192.png'
      };
    }
  }
  
  const options = {
    body: data.body || 'Cek game baru sekarang!',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: [
      {
        action: 'open',
        title: 'Buka'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || '🎮 INDapk Game Baru',
      options
    )
  );
});

// Event listener untuk klik notifikasi
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open' || event.action === '') {
    const url = event.notification.data?.url || '/';
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Cari tab yang sudah terbuka
          for (const client of clientList) {
            if (client.url === url && 'focus' in client) {
              return client.focus();
            }
          }
          
          // Buka tab baru
          if (clients.openWindow) {
            return clients.openWindow(url);
          }
        })
    );
  }
});

// Cache strategy untuk halaman dan asset
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, res.clone());
    }
    return res;
  } catch (error) {
    // Fallback ke offline page untuk navigasi
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(async (res) => {
      if (res.ok) {
        await cache.put(request, res.clone());
      }
      return res;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || (request.mode === 'navigate' ? caches.match(OFFLINE_URL) : new Response('Offline'));
}

// Fetch event listener
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Hanya GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip API calls untuk tidak dicache
  if (Object.values(API_URLS).some(apiUrl => url.href.includes(apiUrl))) {
    return;
  }

  // Navigasi halaman: Network First
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(req, fresh.clone());
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

  // Cross-origin (CDN): stale-while-revalidate
  if (["script", "style", "image", "font"].includes(req.destination)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

// Message listener dari client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_NEW_GAMES') {
    event.waitUntil(checkAndNotifyNewGames());
  }
});
