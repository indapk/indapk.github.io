// sw.js - INDapk PWA dengan Notifikasi Game Baru
const VERSION = "v1.1.0";
const STATIC_CACHE = `indapk-static-${VERSION}`;
const RUNTIME_CACHE = `indapk-runtime-${VERSION}`;
const OFFLINE_URL = "/offline.html";

// API URLs untuk semua platform
const GAME_API_URLS = {
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

const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/offline.html",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/notification-bell.png"
];

// Konstanta untuk notifikasi
const NOTIFICATION_TITLE = "🎮 INDapk - Game Baru!";
const NOTIFICATION_ICON = "/icons/icon-192x192.png";
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 menit

// Cache untuk game yang sudah dinotifikasi
const NOTIFIED_GAMES_CACHE = "indapk-notified-games";
const NOTIFICATION_SETTINGS = "indapk-notification-settings";

// Install: precache file penting
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE)
        .then((cache) => cache.addAll(PRECACHE)),
      initializeNotifiedGamesCache(),
      initializeNotificationSettings()
    ]).then(() => self.skipWaiting())
  );
});

// Activate: bersihin cache versi lama
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(
        keys.map((key) => {
          if (![STATIC_CACHE, RUNTIME_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      )),
      self.clients.claim(),
      startPeriodicGameCheck()
    ])
  );
});

// Inisialisasi cache untuk game yang sudah dinotifikasi
async function initializeNotifiedGamesCache() {
  const cache = await caches.open(NOTIFIED_GAMES_CACHE);
  const response = await cache.match("games");
  if (!response) {
    await cache.put("games", new Response(JSON.stringify([])));
  }
}

// Inisialisasi pengaturan notifikasi default
async function initializeNotificationSettings() {
  const cache = await caches.open(NOTIFICATION_SETTINGS);
  const response = await cache.match("settings");
  if (!response) {
    const defaultSettings = {
      enabled: false,
      platforms: ["switch", "android", "pc"], // Platform default
      frequency: "all", // all, popular, daily
      lastDailyCheck: null
    };
    await cache.put("settings", new Response(JSON.stringify(defaultSettings)));
  }
}

// Dapatkan pengaturan notifikasi
async function getNotificationSettings() {
  const cache = await caches.open(NOTIFICATION_SETTINGS);
  const response = await cache.match("settings");
  if (!response) return null;
  return response.json();
}

// Simpan pengaturan notifikasi
async function saveNotificationSettings(settings) {
  const cache = await caches.open(NOTIFICATION_SETTINGS);
  await cache.put("settings", new Response(JSON.stringify(settings)));
}

// Dapatkan daftar game yang sudah dinotifikasi
async function getNotifiedGames() {
  const cache = await caches.open(NOTIFIED_GAMES_CACHE);
  const response = await cache.match("games");
  if (!response) return [];
  return response.json();
}

// Tambah game ke daftar yang sudah dinotifikasi
async function addToNotifiedGames(gameId, platform) {
  const games = await getNotifiedGames();
  const gameKey = `${platform}_${gameId}`;
  
  if (!games.includes(gameKey)) {
    games.push(gameKey);
    // Hapus game tertua jika lebih dari 100
    if (games.length > 100) {
      games.shift();
    }
    
    const cache = await caches.open(NOTIFIED_GAMES_CACHE);
    await cache.put("games", new Response(JSON.stringify(games)));
  }
}

// Cek apakah game sudah dinotifikasi
async function isGameNotified(gameId, platform) {
  const games = await getNotifiedGames();
  const gameKey = `${platform}_${gameId}`;
  return games.includes(gameKey);
}

// Fetch game dari API tertentu
async function fetchGamesFromAPI(apiUrl, platform) {
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "action=getAllGames"
    });
    
    if (!response.ok) {
      throw new Error(`API ${platform} error: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.status === "success" && Array.isArray(data.data)) {
      return data.data.map(game => ({
        ...game,
        platform: platform
      }));
    }
    return [];
  } catch (error) {
    console.error(`[SW] Error fetching ${platform} games:`, error);
    return [];
  }
}

// Cek game baru dari semua platform
async function checkForNewGames() {
  console.log("[SW] Checking for new games...");
  const settings = await getNotificationSettings();
  
  if (!settings || !settings.enabled) {
    console.log("[SW] Notifications disabled, skipping check");
    return;
  }
  
  // Cek frekuensi daily
  if (settings.frequency === "daily") {
    const now = new Date();
    const lastCheck = settings.lastDailyCheck ? new Date(settings.lastDailyCheck) : null;
    
    if (lastCheck && 
        lastCheck.getDate() === now.getDate() &&
        lastCheck.getMonth() === now.getMonth() &&
        lastCheck.getFullYear() === now.getFullYear()) {
      console.log("[SW] Already checked for new games today");
      return;
    }
  }
  
  const notifiedGames = await getNotifiedGames();
  const newGames = [];
  
  // Fetch games dari setiap platform yang diaktifkan
  for (const platform of settings.platforms) {
    const apiUrl = GAME_API_URLS[platform];
    if (!apiUrl) continue;
    
    try {
      const games = await fetchGamesFromAPI(apiUrl, platform);
      
      // Filter game baru (belum ada di cache notifikasi)
      for (const game of games) {
        const gameKey = `${platform}_${game.download_id || game.ori_name}`;
        
        if (!notifiedGames.includes(gameKey)) {
          // Cek kriteria popularitas jika mode "popular"
          if (settings.frequency === "popular") {
            const isPopular = game.category_list?.some(cat => 
              ["action", "rpg", "adventure", "open world"].includes(cat.toLowerCase())
            );
            if (!isPopular) continue;
          }
          
          newGames.push({
            id: game.download_id || game.ori_name,
            name: game.nama_game || game.ori_name,
            platform: platform,
            platform_name: getPlatformLabel(platform),
            thumbnail: game.thumbnail_url || null,
            timestamp: game.timestamp || new Date().toISOString(),
            categories: game.category_list || []
          });
          
          // Tandai sebagai sudah dinotifikasi
          await addToNotifiedGames(gameKey, platform);
        }
      }
    } catch (error) {
      console.error(`[SW] Error checking ${platform} games:`, error);
    }
  }
  
  // Update timestamp daily check
  if (settings.frequency === "daily") {
    settings.lastDailyCheck = new Date().toISOString();
    await saveNotificationSettings(settings);
  }
  
  // Kirim notifikasi jika ada game baru
  if (newGames.length > 0) {
    await sendNotifications(newGames);
  }
  
  console.log(`[SW] Found ${newGames.length} new games`);
}

// Kirim notifikasi
async function sendNotifications(games) {
  const settings = await getNotificationSettings();
  
  // Kirim notifikasi untuk setiap game baru
  for (const game of games) {
    try {
      await self.registration.showNotification(NOTIFICATION_TITLE, {
        body: `${game.name} - ${game.platform_name}\n🎮 Platform: ${game.platform_name}`,
        icon: game.thumbnail || NOTIFICATION_ICON,
        badge: NOTIFICATION_ICON,
        image: game.thumbnail,
        tag: `new-game-${game.id}`,
        data: {
          url: `https://indapk.github.io/download.html?game=${game.id}&platform=${game.platform}`,
          gameId: game.id,
          platform: game.platform
        },
        actions: [
          {
            action: "open",
            title: "🔍 Lihat Game"
          },
          {
            action: "dismiss",
            title: "Tutup"
          }
        ],
        vibrate: [200, 100, 200],
        requireInteraction: true
      });
      
      console.log(`[SW] Notification sent for: ${game.name}`);
      
      // Tunggu sebentar antara notifikasi
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error("[SW] Error sending notification:", error);
    }
  }
}

// Helper function untuk label platform
function getPlatformLabel(platform) {
  const labels = {
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
  return labels[platform] || platform;
}

// Mulai pengecekan berkala
function startPeriodicGameCheck() {
  // Cek langsung saat pertama kali
  checkForNewGames();
  
  // Set interval untuk pengecekan berkala
  setInterval(() => {
    checkForNewGames();
  }, CHECK_INTERVAL);
  
  console.log(`[SW] Periodic game check started (${CHECK_INTERVAL / 60000} minutes)`);
}

// Handle klik notifikasi
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  
  if (event.action === "open") {
    const url = event.notification.data?.url || "https://indapk.github.io";
    
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true })
        .then((clientList) => {
          // Cari tab yang sudah terbuka
          for (const client of clientList) {
            if (client.url === url && "focus" in client) {
              return client.focus();
            }
          }
          // Buka tab baru jika belum ada
          if (clients.openWindow) {
            return clients.openWindow(url);
          }
        })
    );
  }
});

// Handle pesan dari client
self.addEventListener("message", (event) => {
  if (event.data && event.data.type) {
    switch (event.data.type) {
      case "UPDATE_NOTIFICATION_SETTINGS":
        saveNotificationSettings(event.data.settings)
          .then(() => {
            event.ports[0].postMessage({ status: "success" });
            checkForNewGames(); // Cek langsung setelah update
          })
          .catch(error => {
            event.ports[0].postMessage({ status: "error", error: error.message });
          });
        break;
        
      case "GET_NOTIFICATION_SETTINGS":
        getNotificationSettings()
          .then(settings => {
            event.ports[0].postMessage({ status: "success", settings });
          })
          .catch(error => {
            event.ports[0].postMessage({ status: "error", error: error.message });
          });
        break;
        
      case "TEST_NOTIFICATION":
        self.registration.showNotification("🎮 INDapk - Test Notification", {
          body: "Ini adalah notifikasi test dari INDapk!",
          icon: NOTIFICATION_ICON,
          badge: NOTIFICATION_ICON,
          tag: "test-notification",
          requireInteraction: true
        });
        event.ports[0].postMessage({ status: "success" });
        break;
    }
  }
});

// Cache strategies
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

// Sync event untuk background sync
self.addEventListener("sync", (event) => {
  if (event.tag === "check-new-games") {
    event.waitUntil(checkForNewGames());
  }
});

// Periodic sync (jika didukung)
if ("periodicSync" in self.registration) {
  try {
    self.registration.periodicSync.register("check-new-games", {
      minInterval: CHECK_INTERVAL
    });
  } catch (error) {
    console.log("[SW] Periodic sync not supported:", error);
  }
}
