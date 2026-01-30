// sw.js - INDapk PWA dengan Notifikasi Game Baru
const VERSION = "v1.2.0";
const STATIC_CACHE = `indapk-static-${VERSION}`;
const RUNTIME_CACHE = `indapk-runtime-${VERSION}`;

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

// File yang akan di-cache - dengan fallback untuk ikon
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js",
  "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Inter:wght@400;600;700;800&display=swap"
];

// Ikon fallback jika file asli tidak ditemukan
const NOTIFICATION_ICON = "https://cdnjs.cloudflare.com/ajax/libs/bootstrap-icons/1.10.0/font/bootstrap-icons.css";

const NOTIFICATION_TITLE = "🎮 INDapk - Game Baru!";
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 menit

// Cache untuk game yang sudah dinotifikasi
const NOTIFIED_GAMES_CACHE = "indapk-notified-games";
const NOTIFICATION_SETTINGS = "indapk-notification-settings";

// Install: precache file penting
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...", VERSION);
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE)
        .then((cache) => {
          console.log("[SW] Caching essential files");
          return cache.addAll(PRECACHE).catch(err => {
            console.warn("[SW] Failed to cache some files:", err);
            return Promise.resolve();
          });
        }),
      initializeNotifiedGamesCache(),
      initializeNotificationSettings()
    ]).then(() => {
      console.log("[SW] Installation complete, skipping waiting");
      return self.skipWaiting();
    })
  );
});

// Activate: bersihin cache versi lama
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (![STATIC_CACHE, RUNTIME_CACHE].includes(key)) {
              console.log("[SW] Deleting old cache:", key);
              return caches.delete(key);
            }
          })
        );
      }),
      self.clients.claim(),
      startPeriodicGameCheck()
    ]).then(() => {
      console.log("[SW] Activation complete");
      // Kirim pesan ke semua client bahwa SW aktif
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: "SW_ACTIVATED", version: VERSION });
        });
      });
    })
  );
});

// Inisialisasi cache untuk game yang sudah dinotifikasi
async function initializeNotifiedGamesCache() {
  const cache = await caches.open(NOTIFIED_GAMES_CACHE);
  const response = await cache.match("games");
  if (!response) {
    await cache.put("games", new Response(JSON.stringify([])));
    console.log("[SW] Notified games cache initialized");
  }
}

// Inisialisasi pengaturan notifikasi default
async function initializeNotificationSettings() {
  const cache = await caches.open(NOTIFICATION_SETTINGS);
  const response = await cache.match("settings");
  if (!response) {
    const defaultSettings = {
      enabled: false,
      platforms: ["switch", "android", "pc"],
      frequency: "all",
      lastDailyCheck: null,
      pushEnabled: false
    };
    await cache.put("settings", new Response(JSON.stringify(defaultSettings)));
    console.log("[SW] Notification settings initialized");
  }
}

// Dapatkan pengaturan notifikasi
async function getNotificationSettings() {
  try {
    const cache = await caches.open(NOTIFICATION_SETTINGS);
    const response = await cache.match("settings");
    if (!response) return null;
    const settings = await response.json();
    console.log("[SW] Retrieved notification settings:", settings);
    return settings;
  } catch (error) {
    console.error("[SW] Error getting notification settings:", error);
    return null;
  }
}

// Simpan pengaturan notifikasi
async function saveNotificationSettings(settings) {
  try {
    const cache = await caches.open(NOTIFICATION_SETTINGS);
    await cache.put("settings", new Response(JSON.stringify(settings)));
    console.log("[SW] Saved notification settings:", settings);
    return true;
  } catch (error) {
    console.error("[SW] Error saving notification settings:", error);
    return false;
  }
}

// Dapatkan daftar game yang sudah dinotifikasi
async function getNotifiedGames() {
  try {
    const cache = await caches.open(NOTIFIED_GAMES_CACHE);
    const response = await cache.match("games");
    if (!response) return [];
    const games = await response.json();
    return games;
  } catch (error) {
    console.error("[SW] Error getting notified games:", error);
    return [];
  }
}

// Tambah game ke daftar yang sudah dinotifikasi
async function addToNotifiedGames(gameId, platform) {
  try {
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
      console.log("[SW] Added to notified games:", gameKey);
    }
    return true;
  } catch (error) {
    console.error("[SW] Error adding to notified games:", error);
    return false;
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
    console.log(`[SW] Fetching games from ${platform} API`);
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
      console.log(`[SW] Found ${data.data.length} games for ${platform}`);
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
    if (!apiUrl) {
      console.warn(`[SW] No API URL for platform: ${platform}`);
      continue;
    }
    
    try {
      const games = await fetchGamesFromAPI(apiUrl, platform);
      
      // Filter game baru (belum ada di cache notifikasi)
      for (const game of games) {
        const gameId = game.download_id || game.ori_name;
        if (!gameId) continue;
        
        const gameKey = `${platform}_${gameId}`;
        
        if (!notifiedGames.includes(gameKey)) {
          // Cek kriteria popularitas jika mode "popular"
          if (settings.frequency === "popular") {
            const categories = game.category_list || [];
            const isPopular = categories.some(cat => 
              ["action", "rpg", "adventure", "open world", "fps", "battle royale"]
                .includes(cat.toLowerCase())
            );
            if (!isPopular) continue;
          }
          
          newGames.push({
            id: gameId,
            name: game.nama_game || game.ori_name || "Unknown Game",
            platform: platform,
            platform_name: getPlatformLabel(platform),
            thumbnail: game.thumbnail_url || null,
            timestamp: game.timestamp || new Date().toISOString(),
            categories: game.category_list || []
          });
          
          // Tandai sebagai sudah dinotifikasi
          await addToNotifiedGames(gameId, platform);
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
    console.log(`[SW] Found ${newGames.length} new games`);
    await sendNotifications(newGames);
  } else {
    console.log("[SW] No new games found");
  }
  
  return newGames;
}

// Kirim notifikasi
async function sendNotifications(games) {
  const settings = await getNotificationSettings();
  
  // Kirim notifikasi untuk setiap game baru
  for (const game of games) {
    try {
      const notificationOptions = {
        body: `${game.name}\n🎮 Platform: ${game.platform_name}`,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_ICON,
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
        requireInteraction: false
      };
      
      // Tambah image jika thumbnail tersedia
      if (game.thumbnail) {
        notificationOptions.image = game.thumbnail;
      }
      
      await self.registration.showNotification(NOTIFICATION_TITLE, notificationOptions);
      
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
  console.log(`[SW] Starting periodic game check (${CHECK_INTERVAL / 60000} minutes)`);
  
  // Cek langsung saat pertama kali
  checkForNewGames();
  
  // Set interval untuk pengecekan berkala
  setInterval(() => {
    checkForNewGames();
  }, CHECK_INTERVAL);
  
  return true;
}

// Handle klik notifikasi
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked:", event.notification.tag);
  event.notification.close();
  
  if (event.action === "open" || !event.action) {
    const url = event.notification.data?.url || "https://indapk.github.io";
    
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true })
        .then((clientList) => {
          // Cari tab yang sudah terbuka
          for (const client of clientList) {
            if (client.url.includes('indapk.github.io') && "focus" in client) {
              return client.focus();
            }
          }
          // Buka tab baru jika belum ada
          if (clients.openWindow) {
            return clients.openWindow(url);
          }
        })
    );
  } else if (event.action === "dismiss") {
    // Notifikasi ditutup, tidak perlu action
    console.log("[SW] Notification dismissed");
  }
});

// Handle pesan dari client
self.addEventListener("message", (event) => {
  console.log("[SW] Received message from client:", event.data);
  
  if (event.data && event.data.type) {
    const port = event.ports && event.ports[0];
    
    switch (event.data.type) {
      case "UPDATE_NOTIFICATION_SETTINGS":
        saveNotificationSettings(event.data.settings)
          .then(success => {
            if (port) {
              port.postMessage({ 
                status: success ? "success" : "error",
                message: success ? "Settings saved" : "Failed to save settings"
              });
            }
            // Cek langsung setelah update
            if (event.data.settings.enabled) {
              checkForNewGames();
            }
          })
          .catch(error => {
            if (port) {
              port.postMessage({ 
                status: "error", 
                error: error.message 
              });
            }
          });
        break;
        
      case "GET_NOTIFICATION_SETTINGS":
        getNotificationSettings()
          .then(settings => {
            if (port) {
              port.postMessage({ 
                status: "success", 
                settings 
              });
            }
          })
          .catch(error => {
            if (port) {
              port.postMessage({ 
                status: "error", 
                error: error.message 
              });
            }
          });
        break;
        
      case "TEST_NOTIFICATION":
        self.registration.showNotification("🎮 INDapk - Test Notification", {
          body: "Ini adalah notifikasi test dari INDapk!",
          icon: NOTIFICATION_ICON,
          badge: NOTIFICATION_ICON,
          tag: "test-notification",
          requireInteraction: true,
          data: {
            url: "https://indapk.github.io"
          }
        });
        if (port) {
          port.postMessage({ status: "success" });
        }
        break;
        
      case "CHECK_NEW_GAMES_NOW":
        checkForNewGames()
          .then(newGames => {
            if (port) {
              port.postMessage({ 
                status: "success", 
                newGames: newGames.length 
              });
            }
          })
          .catch(error => {
            if (port) {
              port.postMessage({ 
                status: "error", 
                error: error.message 
              });
            }
          });
        break;
        
      case "PING":
        if (port) {
          port.postMessage({ 
            status: "success", 
            message: "SW is alive",
            version: VERSION 
          });
        }
        break;
    }
  }
});

// Cache strategies - SIMPLIFIED VERSION
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") return;
  
  const url = new URL(event.request.url);
  
  // Skip API requests
  if (Object.values(GAME_API_URLS).some(apiUrl => url.href.includes(apiUrl))) {
    return;
  }
  
  // Skip chrome-extension requests
  if (url.protocol === "chrome-extension:") return;
  
  // For same-origin HTML requests, try network first
  if (event.request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the response for future use
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE)
            .then(cache => cache.put(event.request, responseToCache));
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request)
            .then(cachedResponse => {
              return cachedResponse || caches.match("/index.html");
            });
        })
    );
    return;
  }
  
  // For other requests, use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(event.request)
          .then(response => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200) {
              return response;
            }
            
            // Cache the successful response
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE)
              .then(cache => cache.put(event.request, responseToCache));
            
            return response;
          });
      })
  );
});

// Sync event untuk background sync (jika didukung)
self.addEventListener("sync", (event) => {
  if (event.tag === "check-new-games") {
    console.log("[SW] Background sync triggered");
    event.waitUntil(checkForNewGames());
  }
});

// Periodic sync registration (jika didukung)
if ("periodicSync" in self.registration) {
  try {
    self.registration.periodicSync.register("check-new-games", {
      minInterval: CHECK_INTERVAL
    }).then(() => {
      console.log("[SW] Periodic sync registered");
    }).catch(error => {
      console.log("[SW] Periodic sync registration failed:", error);
    });
  } catch (error) {
    console.log("[SW] Periodic sync not supported:", error);
  }
}

// Handle push notifications (jika diaktifkan nanti)
self.addEventListener("push", (event) => {
  console.log("[SW] Push notification received:", event);
  
  if (event.data) {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || NOTIFICATION_TITLE, {
        body: data.body,
        icon: data.icon || NOTIFICATION_ICON,
        data: data.data
      })
    );
  }
});
