// sw.js - INDapk PWA dengan Notifikasi Game Baru
const VERSION = "v2.0.0";
const STATIC_CACHE = `indapk-static-${VERSION}`;
const RUNTIME_CACHE = `indapk-runtime-${VERSION}`;
const NOTIFICATION_CACHE = `indapk-notifications-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/offline.html",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png"
];

// Konfigurasi API URLs untuk game
const API_URLS = {
  ps2: "https://script.google.com/macros/s/AKfycbwvTmKNFx0rxWjAAlTpQk9h0hnFD-GcKZcUG4g3MtHFJLnw86lPGqgSoQuuVUJDe1xy/exec",
  switch: "https://script.google.com/macros/s/AKfycbytk1iwBYb2xGF2j3fjTmTFBNzQ_ifXsxrddlDWuPPNdMjWbHvyiRppEcoq0V1BGjn-/exec",
  psp: "https://script.google.com/macros/s/AKfycbxCg1_l60T858d14WKA3N8c23VJ_YYj_XxX2H4Rqad1tSwaolutSrksSw9ippHu1QOA/exec",
  android: "https://script.google.com/macros/s/AKfycbwjF-qp6zHQGiBchoReCX3xLpWSLJysoUsRDDiXbm3nZ51RdaLWrpCh5jqno5A-Rmn4/exec",
  psvita: "https://script.google.com/macros/s/AKfycbySh1tyONA4ib6wNwq6ZXoHKiMX1P4e0rZ-4IvMiZTEyjJ6XDm1hdPwakYcOeuWPE_IQg/exec",
  wii: "https://script.google.com/macros/s/AKfycbz8uhfQtYxyUmZSVloZlY0UDxkQayeYAemS6zDXS4zDKKJ-DYuq16pqFJLkNCYXg18a/exec",
  gamecube: "https://script.google.com/macros/s/AKfycbzN2P7leht4d5IM_zHmevEi4-jhqL_CjzHF31dlrSvR1osR1COe3oocfKR5PC86wE6Oig/exec",
  "3ds": "https://script.google.com/macros/s/AKfycbwvTthKe_U-lCNxMu4c4WtuJbfp3Xzt8aWyAT10hFU1LXsKmsTidBoCnTQfShokliVq/exec",
  pc: "https://script.google.com/macros/s/AKfycbxKEqdp8W2YOvP-s11-Py8mmt-qBStCFr6pdnV2kjTCX3tDI04xBtlfH5XDE3ldx2Kd3Q/exec"
};

// Install: precache file penting
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => {
        console.log("Service Worker installed");
        return self.skipWaiting();
      })
  );
});

// Activate: bersihin cache versi lama
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (![STATIC_CACHE, RUNTIME_CACHE, NOTIFICATION_CACHE].includes(key)) {
          return caches.delete(key);
        }
      })
    )).then(() => {
      console.log("Service Worker activated");
      return self.clients.claim();
    })
  );
});

// ====== NOTIFICATION SYSTEM ======
// Periodic sync untuk cek game baru
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "check-new-games") {
    event.waitUntil(checkForNewGames());
  }
});

// Push notification
self.addEventListener("push", (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || "Ada game baru tersedia!",
    icon: data.icon || "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: data.tag || "new-game",
    data: data.data || {},
    requireInteraction: false,
    actions: data.actions || [
      { action: "open", title: "Buka Game" },
      { action: "close", title: "Tutup" }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || "Game Baru!", options)
  );
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  
  if (event.action === "open" || event.action === "") {
    const gameData = event.notification.data;
    if (gameData && gameData.gameId) {
      event.waitUntil(
        clients.matchAll({ type: "window" }).then((clientList) => {
          const url = `/download.html?game=${gameData.gameId}&platform=${gameData.platform}`;
          
          // Jika ada window yang terbuka, fokus dan navigasi
          for (const client of clientList) {
            if (client.url.includes("/") && "navigate" in client) {
              return client.navigate(url).then(client.focus());
            }
          }
          
          // Jika tidak ada, buka window baru
          return clients.openWindow(url);
        })
      );
    }
  }
});

// Cek game baru
async function checkForNewGames() {
  try {
    const settings = await getNotificationSettings();
    if (!settings.enabled) return;
    
    const cache = await caches.open(NOTIFICATION_CACHE);
    const lastCheck = await cache.match("last-check");
    const notifiedGames = await cache.match("notified-games");
    
    let lastCheckTime = 0;
    let notifiedGamesList = [];
    
    if (lastCheck) {
      const data = await lastCheck.json();
      lastCheckTime = data.timestamp || 0;
    }
    
    if (notifiedGames) {
      const data = await notifiedGames.json();
      notifiedGamesList = data.games || [];
    }
    
    // Cek game baru dari setiap platform yang dipilih user
    const platformsToCheck = settings.platforms || ["all"];
    const allNewGames = [];
    
    for (const platform of platformsToCheck) {
      if (platform === "all") {
        // Cek semua platform
        for (const [key, url] of Object.entries(API_URLS)) {
          const newGames = await checkPlatformForNewGames(key, url, lastCheckTime, notifiedGamesList);
          allNewGames.push(...newGames);
        }
      } else if (API_URLS[platform]) {
        const newGames = await checkPlatformForNewGames(platform, API_URLS[platform], lastCheckTime, notifiedGamesList);
        allNewGames.push(...newGames);
      }
    }
    
    // Filter berdasarkan frekuensi
    const filteredGames = filterGamesByFrequency(allNewGames, settings.frequency);
    
    // Kirim notifikasi untuk game baru
    for (const game of filteredGames) {
      await sendNewGameNotification(game);
      notifiedGamesList.push(`${game.platform}-${game.download_id}`);
    }
    
    // Update cache
    await cache.put("last-check", new Response(JSON.stringify({ timestamp: Date.now() })));
    await cache.put("notified-games", new Response(JSON.stringify({ games: notifiedGamesList })));
    
  } catch (error) {
    console.error("Error checking for new games:", error);
  }
}

// Cek game baru dari platform tertentu
async function checkPlatformForNewGames(platform, apiUrl, lastCheckTime, notifiedGamesList) {
  try {
    const response = await fetch(`${apiUrl}?action=getAllGames`);
    if (!response.ok) return [];
    
    const data = await response.json();
    if (data.status !== "success" || !data.data) return [];
    
    const newGames = [];
    const gameId = `${platform}-`;
    
    for (const game of data.data) {
      const gameKey = `${platform}-${game.download_id}`;
      
      // Skip jika sudah dinotifikasi
      if (notifiedGamesList.includes(gameKey)) continue;
      
      // Konversi timestamp game
      const gameTime = parseGameTimestamp(game.timestamp);
      
      // Cek jika game lebih baru dari lastCheckTime
      if (gameTime > lastCheckTime) {
        newGames.push({
          ...game,
          platform,
          platform_name: getPlatformName(platform),
          game_time: gameTime
        });
      }
    }
    
    return newGames;
  } catch (error) {
    console.error(`Error checking ${platform}:`, error);
    return [];
  }
}

// Filter game berdasarkan frekuensi notifikasi
function filterGamesByFrequency(games, frequency) {
  if (frequency === "all") return games;
  
  // Urutkan berdasarkan tanggal (terbaru dulu)
  games.sort((a, b) => b.game_time - a.game_time);
  
  if (frequency === "popular") {
    // Dalam implementasi nyata, perlu logika untuk menentukan popularitas
    // Untuk sementara, return semua game
    return games;
  } else if (frequency === "daily") {
    // Return game terbaru hari ini saja
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return games.filter(game => {
      const gameDate = new Date(game.game_time);
      return gameDate >= today;
    });
  }
  
  return games;
}

// Kirim notifikasi game baru
async function sendNewGameNotification(game) {
  const title = `🎮 Game Baru: ${game.nama_game || game.ori_name}`;
  const body = `Platform: ${game.platform_name || getPlatformName(game.platform)}`;
  
  const options = {
    body: body,
    icon: game.thumbnail_url || "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: `new-game-${game.platform}-${game.download_id}`,
    data: {
      gameId: game.download_id,
      platform: game.platform,
      url: `/download.html?game=${game.download_id}&platform=${game.platform}`
    },
    actions: [
      { action: "open", title: "Lihat Game" },
      { action: "close", title: "Tutup" }
    ]
  };
  
  return self.registration.showNotification(title, options);
}

// Helper functions
function parseGameTimestamp(timestamp) {
  if (!timestamp) return Date.now();
  
  try {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? Date.now() : date.getTime();
  } catch {
    return Date.now();
  }
}

function getPlatformName(platform) {
  const names = {
    ps2: "PlayStation 2",
    switch: "Nintendo Switch",
    psp: "PSP",
    psvita: "PS Vita",
    wii: "Wii",
    gamecube: "Gamecube",
    "3ds": "3DS",
    android: "Android",
    pc: "PC"
  };
  
  return names[platform] || platform;
}

async function getNotificationSettings() {
  try {
    const cache = await caches.open(NOTIFICATION_CACHE);
    const settings = await cache.match("settings");
    
    if (settings) {
      return await settings.json();
    }
    
    // Default settings
    return {
      enabled: false,
      platforms: ["all"],
      frequency: "all"
    };
  } catch {
    return {
      enabled: false,
      platforms: ["all"],
      frequency: "all"
    };
  }
}

// ====== CACHE STRATEGIES ======
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
    const dest = req.destination;
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

// Background sync for notifications
self.addEventListener("sync", (event) => {
  if (event.tag === "send-notification-settings") {
    event.waitUntil(syncNotificationSettings());
  }
});

async function syncNotificationSettings() {
  // Implementasi sync settings ke server
  console.log("Syncing notification settings...");
}
