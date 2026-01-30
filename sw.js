// sw.js - INDapk PWA dengan Notifikasi Game Baru Cerdas
const VERSION = "v2.0.0";
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

// File yang akan di-cache
const PRECACHE = [
  "/",
  "/index.html"
];

// Ikon fallback
const NOTIFICATION_ICON = "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/bootstrap-icons.svg";
const NOTIFICATION_TITLE = "🎮 INDapk - Game Baru!";
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 menit

// Cache keys
const NOTIFIED_GAMES_CACHE = "indapk-notified-games";
const NOTIFICATION_SETTINGS = "indapk-notification-settings";
const ACTIVATION_TIMESTAMP = "indapk-activation-timestamp";
const LAST_GAME_CHECK = "indapk-last-game-check";

// ========== INSTALL SERVICE WORKER ==========
self.addEventListener("install", (event) => {
  console.log("[SW] 🔧 Installing service worker v2.0.0...");
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE)
        .then((cache) => {
          console.log("[SW] 📦 Caching essential files");
          return cache.addAll(PRECACHE).catch(err => {
            console.warn("[SW] ⚠️ Failed to cache some files:", err);
            return Promise.resolve();
          });
        }),
      initializeNotifiedGamesCache(),
      initializeNotificationSettings(),
      initializeActivationTimestamp(),
      initializeLastGameCheck()
    ]).then(() => {
      console.log("[SW] ✅ Installation complete");
      return self.skipWaiting();
    })
  );
});

// ========== ACTIVATE SERVICE WORKER ==========
self.addEventListener("activate", (event) => {
  console.log("[SW] 🚀 Activating service worker v2.0.0...");
  event.waitUntil(
    Promise.all([
      cleanupOldCaches(),
      self.clients.claim(),
      startPeriodicGameCheck()
    ]).then(() => {
      console.log("[SW] ✅ Activation complete");
      // Broadcast ke semua client
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ 
            type: "SW_ACTIVATED", 
            version: VERSION,
            message: "Service Worker ready for notifications" 
          });
        });
      });
    })
  );
});

// ========== INITIALIZATION FUNCTIONS ==========

// Bersihkan cache lama
async function cleanupOldCaches() {
  const cacheKeys = await caches.keys();
  const deletePromises = cacheKeys.map(key => {
    if (![STATIC_CACHE, RUNTIME_CACHE].includes(key)) {
      console.log("[SW] 🗑️ Deleting old cache:", key);
      return caches.delete(key);
    }
  });
  return Promise.all(deletePromises);
}

// Inisialisasi timestamp aktivasi
async function initializeActivationTimestamp() {
  const cache = await caches.open(NOTIFICATION_SETTINGS);
  const response = await cache.match(ACTIVATION_TIMESTAMP);
  if (!response) {
    // Default: 1 jam yang lalu, jadi hanya game dari 1 jam terakhir yang akan dinotifikasi saat pertama aktif
    const defaultTimestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await cache.put(ACTIVATION_TIMESTAMP, new Response(defaultTimestamp));
    console.log("[SW] ⏰ Activation timestamp initialized to:", defaultTimestamp);
  }
}

// Inisialisasi last game check
async function initializeLastGameCheck() {
  const cache = await caches.open(NOTIFICATION_SETTINGS);
  const response = await cache.match(LAST_GAME_CHECK);
  if (!response) {
    const defaultTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await cache.put(LAST_GAME_CHECK, new Response(defaultTimestamp));
    console.log("[SW] ⏱️ Last game check initialized to:", defaultTimestamp);
  }
}

// Inisialisasi cache untuk game yang sudah dinotifikasi
async function initializeNotifiedGamesCache() {
  const cache = await caches.open(NOTIFIED_GAMES_CACHE);
  const response = await cache.match("games");
  if (!response) {
    await cache.put("games", new Response(JSON.stringify([])));
    console.log("[SW] 🎮 Notified games cache initialized");
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
      lastDailyCheck: null
    };
    await cache.put("settings", new Response(JSON.stringify(defaultSettings)));
    console.log("[SW] ⚙️ Notification settings initialized");
  }
}

// ========== GETTER FUNCTIONS ==========

// Dapatkan timestamp aktivasi
async function getActivationTimestamp() {
  try {
    const cache = await caches.open(NOTIFICATION_SETTINGS);
    const response = await cache.match(ACTIVATION_TIMESTAMP);
    if (!response) return null;
    const timestamp = await response.text();
    return new Date(timestamp);
  } catch (error) {
    console.error("[SW] ❌ Error getting activation timestamp:", error);
    return null;
  }
}

// Dapatkan timestamp terakhir cek game
async function getLastGameCheckTimestamp() {
  try {
    const cache = await caches.open(NOTIFICATION_SETTINGS);
    const response = await cache.match(LAST_GAME_CHECK);
    if (!response) return null;
    const timestamp = await response.text();
    return new Date(timestamp);
  } catch (error) {
    console.error("[SW] ❌ Error getting last game check:", error);
    return null;
  }
}

// Update timestamp terakhir cek game
async function updateLastGameCheckTimestamp() {
  try {
    const now = new Date().toISOString();
    const cache = await caches.open(NOTIFICATION_SETTINGS);
    await cache.put(LAST_GAME_CHECK, new Response(now));
    console.log("[SW] 🔄 Last game check updated to:", now);
    return true;
  } catch (error) {
    console.error("[SW] ❌ Error updating last game check:", error);
    return false;
  }
}

// Update timestamp aktivasi (saat user aktifkan notifikasi)
async function updateActivationTimestamp() {
  try {
    const now = new Date().toISOString();
    const cache = await caches.open(NOTIFICATION_SETTINGS);
    await cache.put(ACTIVATION_TIMESTAMP, new Response(now));
    console.log("[SW] 🔔 Activation timestamp updated to:", now);
    return true;
  } catch (error) {
    console.error("[SW] ❌ Error updating activation timestamp:", error);
    return false;
  }
}

// Dapatkan pengaturan notifikasi
async function getNotificationSettings() {
  try {
    const cache = await caches.open(NOTIFICATION_SETTINGS);
    const response = await cache.match("settings");
    if (!response) return null;
    const settings = await response.json();
    return settings;
  } catch (error) {
    console.error("[SW] ❌ Error getting notification settings:", error);
    return null;
  }
}

// Simpan pengaturan notifikasi
async function saveNotificationSettings(settings) {
  try {
    const cache = await caches.open(NOTIFICATION_SETTINGS);
    await cache.put("settings", new Response(JSON.stringify(settings)));
    console.log("[SW] 💾 Saved notification settings");
    return true;
  } catch (error) {
    console.error("[SW] ❌ Error saving notification settings:", error);
    return false;
  }
}

// ========== GAME NOTIFICATION FUNCTIONS ==========

// Parse tanggal dari string game
function parseGameDate(dateString) {
  if (!dateString) return new Date(0);
  
  // Coba parse langsung
  const date = new Date(dateString);
  if (!isNaN(date.getTime())) return date;
  
  // Format DD/MM/YYYY atau DD-MM-YYYY
  const match = dateString.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (match) {
    let day = parseInt(match[1], 10);
    let month = parseInt(match[2], 10) - 1;
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }
  
  // Format YYYY-MM-DD
  const match2 = dateString.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (match2) {
    const year = parseInt(match2[1], 10);
    const month = parseInt(match2[2], 10) - 1;
    const day = parseInt(match2[3], 10);
    return new Date(year, month, day);
  }
  
  // Fallback: date far in past
  return new Date(0);
}

// Cek apakah game baru berdasarkan timestamp
function isGameNew(gameTimestamp, activationTime, lastCheckTime) {
  if (!gameTimestamp) return false;
  
  const gameDate = parseGameDate(gameTimestamp);
  
  // Debug info
  console.log(`[SW] 📅 Game date: ${gameDate.toISOString()}, Activation: ${activationTime.toISOString()}, Last check: ${lastCheckTime ? lastCheckTime.toISOString() : 'none'}`);
  
  // 1. Game harus lebih baru dari waktu aktivasi user
  if (gameDate <= activationTime) {
    console.log(`[SW] ⏳ Game too old (older than activation time)`);
    return false;
  }
  
  // 2. Game harus lebih baru dari waktu terakhir cek (jika ada)
  if (lastCheckTime && gameDate <= lastCheckTime) {
    console.log(`[SW] ⏳ Game already checked before`);
    return false;
  }
  
  // 3. Game tidak boleh lebih dari 30 hari di masa depan (error data)
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  if (gameDate > thirtyDaysFromNow) {
    console.log(`[SW] ⚠️ Game date in far future, ignoring`);
    return false;
  }
  
  console.log(`[SW] ✅ Game is NEW!`);
  return true;
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
    console.error("[SW] ❌ Error getting notified games:", error);
    return [];
  }
}

// Tambah game ke daftar yang sudah dinotifikasi
async function addToNotifiedGames(gameId, platform, timestamp) {
  try {
    const games = await getNotifiedGames();
    const gameKey = `${platform}_${gameId}`;
    
    // Cek apakah sudah ada
    const existingIndex = games.findIndex(g => g.key === gameKey);
    if (existingIndex === -1) {
      games.push({
        key: gameKey,
        id: gameId,
        platform: platform,
        timestamp: timestamp || new Date().toISOString(),
        notifiedAt: new Date().toISOString()
      });
      
      // Hapus game tertua jika lebih dari 300
      if (games.length > 300) {
        games.sort((a, b) => new Date(a.notifiedAt) - new Date(b.notifiedAt));
        games.splice(0, games.length - 300);
      }
      
      const cache = await caches.open(NOTIFIED_GAMES_CACHE);
      await cache.put("games", new Response(JSON.stringify(games)));
      console.log(`[SW] 📝 Added to notified games: ${gameKey}`);
    } else {
      console.log(`[SW] 🔄 Game already notified: ${gameKey}`);
    }
    return true;
  } catch (error) {
    console.error("[SW] ❌ Error adding to notified games:", error);
    return false;
  }
}

// Cek apakah game sudah dinotifikasi
async function isGameNotified(gameId, platform) {
  const games = await getNotifiedGames();
  const gameKey = `${platform}_${gameId}`;
  return games.some(g => g.key === gameKey);
}

// Fetch game dari API
async function fetchGamesFromAPI(apiUrl, platform) {
  try {
    console.log(`[SW] 📡 Fetching games from ${platform} API`);
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
      console.log(`[SW] 📊 Found ${data.data.length} games for ${platform}`);
      
      // Parse tanggal untuk setiap game
      return data.data.map(game => {
        const parsedDate = parseGameDate(game.timestamp);
        return {
          ...game,
          platform: platform,
          parsedDate: parsedDate,
          isDateValid: !isNaN(parsedDate.getTime())
        };
      }).filter(game => game.isDateValid); // Filter hanya game dengan tanggal valid
    }
    return [];
  } catch (error) {
    console.error(`[SW] ❌ Error fetching ${platform} games:`, error);
    return [];
  }
}

// Cek game baru dengan logika cerdas
async function checkForNewGames() {
  console.log("[SW] 🔍 Checking for new games (smart filter)...");
  const settings = await getNotificationSettings();
  
  if (!settings || !settings.enabled) {
    console.log("[SW] ⏸️ Notifications disabled, skipping check");
    return [];
  }
  
  // Dapatkan timestamp penting
  const activationTime = await getActivationTimestamp();
  const lastCheckTime = await getLastGameCheckTimestamp();
  
  if (!activationTime) {
    console.log("[SW] ⚠️ No activation time found");
    return [];
  }
  
  console.log(`[SW] ⏰ Activation time: ${activationTime.toISOString()}`);
  console.log(`[SW] ⏱️ Last check time: ${lastCheckTime ? lastCheckTime.toISOString() : 'Never'}`);
  
  // Cek frekuensi daily
  if (settings.frequency === "daily") {
    const now = new Date();
    if (lastCheckTime && 
        lastCheckTime.getDate() === now.getDate() &&
        lastCheckTime.getMonth() === now.getMonth() &&
        lastCheckTime.getFullYear() === now.getFullYear()) {
      console.log("[SW] 📅 Already checked for new games today");
      return [];
    }
  }
  
  const newGames = [];
  let totalGamesChecked = 0;
  let totalGamesFiltered = 0;
  
  // Fetch games dari setiap platform yang diaktifkan
  for (const platform of settings.platforms) {
    const apiUrl = GAME_API_URLS[platform];
    if (!apiUrl) {
      console.warn(`[SW] ⚠️ No API URL for platform: ${platform}`);
      continue;
    }
    
    try {
      const games = await fetchGamesFromAPI(apiUrl, platform);
      totalGamesChecked += games.length;
      
      // Filter game baru
      for (const game of games) {
        const gameId = game.download_id || game.ori_name;
        if (!gameId) continue;
        
        // Cek apakah game sudah dinotifikasi
        if (await isGameNotified(gameId, platform)) {
          totalGamesFiltered++;
          continue;
        }
        
        // Cek apakah game baru (dibandingkan dengan activationTime dan lastCheckTime)
        if (isGameNew(game.timestamp, activationTime, lastCheckTime)) {
          // Cek kriteria popularitas jika mode "popular"
          if (settings.frequency === "popular") {
            const categories = game.category_list || [];
            const popularKeywords = [
              "action", "rpg", "adventure", "open world", "fps", 
              "battle royale", "multiplayer", "online", "trending",
              "shooter", "racing", "sports", "horror", "strategy"
            ];
            const isPopular = categories.some(cat => 
              popularKeywords.some(keyword => 
                cat.toLowerCase().includes(keyword.toLowerCase())
              )
            );
            if (!isPopular) {
              totalGamesFiltered++;
              continue;
            }
          }
          
          newGames.push({
            id: gameId,
            name: game.nama_game || game.ori_name || "Unknown Game",
            platform: platform,
            platform_name: getPlatformLabel(platform),
            thumbnail: game.thumbnail_url || null,
            timestamp: game.timestamp || new Date().toISOString(),
            categories: game.category_list || [],
            parsedDate: game.parsedDate,
            isNew: true
          });
          
          // Tandai sebagai sudah dinotifikasi
          await addToNotifiedGames(gameId, platform, game.timestamp);
        } else {
          totalGamesFiltered++;
        }
      }
    } catch (error) {
      console.error(`[SW] ❌ Error processing ${platform} games:`, error);
    }
  }
  
  // Update timestamp terakhir cek
  await updateLastGameCheckTimestamp();
  
  // Update daily check timestamp jika mode daily
  if (settings.frequency === "daily") {
    settings.lastDailyCheck = new Date().toISOString();
    await saveNotificationSettings(settings);
  }
  
  console.log(`[SW] 📊 Check results: ${totalGamesChecked} total, ${totalGamesFiltered} filtered, ${newGames.length} new`);
  
  // Kirim notifikasi jika ada game baru
  if (newGames.length > 0) {
    console.log(`[SW] 🎉 Found ${newGames.length} new games!`);
    
    // Sort by date (newest first)
    newGames.sort((a, b) => (b.parsedDate || new Date(0)) - (a.parsedDate || new Date(0)));
    
    // Batasi maksimal 5 notifikasi sekaligus
    const gamesToNotify = newGames.slice(0, 5);
    await sendNotifications(gamesToNotify);
    
    return gamesToNotify;
  } else {
    console.log("[SW] ℹ️ No new games found");
    return [];
  }
}

// Helper untuk label platform
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

// Kirim notifikasi
async function sendNotifications(games) {
  console.log(`[SW] 📤 Sending ${games.length} notifications`);
  
  for (const [index, game] of games.entries()) {
    try {
      // Delay antara notifikasi
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      const notificationOptions = {
        body: `${game.name}\n🎮 ${game.platform_name}\n📅 ${formatDateForNotification(game.timestamp)}`,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_ICON,
        tag: `new-game-${Date.now()}-${game.id}-${index}`, // Unique tag
        data: {
          url: `https://indapk.github.io/download.html?game=${game.id}&platform=${game.platform}`,
          gameId: game.id,
          platform: game.platform,
          timestamp: game.timestamp,
          name: game.name
        },
        actions: [
          {
            action: "open",
            title: "🔍 Lihat Game"
          }
        ],
        vibrate: [200, 100, 200],
        requireInteraction: false,
        timestamp: game.parsedDate ? game.parsedDate.getTime() : Date.now()
      };
      
      // Tambah image jika thumbnail valid
      if (game.thumbnail && isValidImageUrl(game.thumbnail)) {
        notificationOptions.image = game.thumbnail;
      }
      
      await self.registration.showNotification(NOTIFICATION_TITLE, notificationOptions);
      console.log(`[SW] ✅ Notification sent: ${game.name} (${game.platform})`);
      
    } catch (error) {
      console.error("[SW] ❌ Error sending notification:", error);
    }
  }
}

// Format tanggal untuk notifikasi
function formatDateForNotification(dateString) {
  if (!dateString) return "";
  
  const date = parseGameDate(dateString);
  if (isNaN(date.getTime())) return "";
  
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Hari ini";
  if (diffDays === 1) return "Kemarin";
  if (diffDays < 7) return `${diffDays} hari yang lalu`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} minggu yang lalu`;
  
  return date.toLocaleDateString('id-ID', { 
    day: 'numeric', 
    month: 'short',
    year: 'numeric'
  });
}

// Cek URL gambar valid
function isValidImageUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

// ========== PERIODIC CHECK ==========

// Mulai pengecekan berkala
function startPeriodicGameCheck() {
  console.log(`[SW] ⏲️ Starting periodic game check (every ${CHECK_INTERVAL / 60000} minutes)`);
  
  // Cek langsung setelah delay
  setTimeout(() => {
    console.log("[SW] 🔍 Initial game check starting...");
    checkForNewGames().then(result => {
      console.log(`[SW] ✅ Initial check complete: ${result.length} new games`);
    });
  }, 10000); // Delay 10 detik setelah activate
  
  // Set interval untuk pengecekan berkala
  setInterval(() => {
    console.log("[SW] 🔄 Periodic game check running...");
    checkForNewGames();
  }, CHECK_INTERVAL);
  
  return true;
}

// ========== EVENT HANDLERS ==========

// Handle klik notifikasi
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] 👆 Notification clicked:", event.notification.tag);
  event.notification.close();
  
  const url = event.notification.data?.url || "https://indapk.github.io";
  const gameName = event.notification.data?.name || "Game";
  
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Cari tab INDapk yang sudah terbuka
        for (const client of clientList) {
          if (client.url.includes('indapk.github.io')) {
            console.log("[SW] 📂 Focusing existing tab");
            // Kirim pesan ke tab untuk navigasi ke game
            client.postMessage({
              type: "OPEN_GAME_FROM_NOTIFICATION",
              url: url,
              gameName: gameName
            });
            return client.focus();
          }
        }
        // Buka tab baru jika belum ada
        console.log("[SW] 📂 Opening new tab");
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Handle pesan dari client
self.addEventListener("message", (event) => {
  console.log("[SW] 📩 Received message from client:", event.data?.type);
  
  if (event.data && event.data.type) {
    const port = event.ports && event.ports[0];
    
    const respond = (response) => {
      if (port) {
        port.postMessage(response);
      }
    };
    
    switch (event.data.type) {
      case "UPDATE_NOTIFICATION_SETTINGS":
        saveNotificationSettings(event.data.settings)
          .then(async (success) => {
            // Jika mengaktifkan notifikasi, update activation timestamp
            if (event.data.settings.enabled) {
              const updated = await updateActivationTimestamp();
              console.log("[SW] 🔔 Activation timestamp updated:", updated);
            }
            
            respond({ 
              status: success ? "success" : "error",
              message: success ? "Settings saved successfully" : "Failed to save settings",
              timestamp: new Date().toISOString()
            });
            
            // Cek game baru setelah update settings
            if (event.data.settings.enabled) {
              setTimeout(() => {
                checkForNewGames();
              }, 3000);
            }
          })
          .catch(error => {
            console.error("[SW] ❌ Error updating settings:", error);
            respond({ 
              status: "error", 
              error: error.message,
              code: "SETTINGS_SAVE_ERROR"
            });
          });
        break;
        
      case "GET_NOTIFICATION_SETTINGS":
        getNotificationSettings()
          .then(settings => {
            respond({ 
              status: "success", 
              settings,
              timestamp: new Date().toISOString()
            });
          })
          .catch(error => {
            console.error("[SW] ❌ Error getting settings:", error);
            respond({ 
              status: "error", 
              error: error.message,
              code: "SETTINGS_GET_ERROR"
            });
          });
        break;
        
      case "GET_ACTIVATION_TIMESTAMP":
        getActivationTimestamp()
          .then(timestamp => {
            respond({ 
              status: "success", 
              timestamp: timestamp ? timestamp.toISOString() : null,
              humanReadable: timestamp ? formatDateForNotification(timestamp.toISOString()) : null
            });
          })
          .catch(error => {
            console.error("[SW] ❌ Error getting activation timestamp:", error);
            respond({ 
              status: "error", 
              error: error.message,
              code: "TIMESTAMP_GET_ERROR"
            });
          });
        break;
        
      case "RESET_NOTIFICATIONS":
        updateActivationTimestamp()
          .then(async (success) => {
            if (success) {
              // Clear notified games cache juga
              const cache = await caches.open(NOTIFIED_GAMES_CACHE);
              await cache.put("games", new Response(JSON.stringify([])));
              console.log("[SW] 🔄 Notifications completely reset");
            }
            
            respond({ 
              status: success ? "success" : "error",
              message: success ? "Notifications reset successfully. Only games from now will be notified." : "Failed to reset notifications",
              newActivationTime: new Date().toISOString()
            });
          })
          .catch(error => {
            console.error("[SW] ❌ Error resetting notifications:", error);
            respond({ 
              status: "error", 
              error: error.message,
              code: "RESET_ERROR"
            });
          });
        break;
        
      case "CLEAR_NOTIFIED_GAMES":
        (async () => {
          try {
            const cache = await caches.open(NOTIFIED_GAMES_CACHE);
            await cache.put("games", new Response(JSON.stringify([])));
            respond({ 
              status: "success",
              message: "Notified games cache cleared"
            });
          } catch (error) {
            console.error("[SW] ❌ Error clearing notified games:", error);
            respond({ 
              status: "error", 
              error: error.message
            });
          }
        })();
        break;
        
      case "TEST_NOTIFICATION":
        const testGame = {
          id: "test-" + Date.now(),
          name: "Game Test Notifikasi",
          platform: "switch",
          platform_name: "Nintendo Switch",
          timestamp: new Date().toISOString(),
          categories: ["Action", "Test"]
        };
        
        self.registration.showNotification("🎮 INDapk - Test Notification", {
          body: `${testGame.name}\n🎮 ${testGame.platform_name}\n✅ Ini hanya test`,
          icon: NOTIFICATION_ICON,
          badge: NOTIFICATION_ICON,
          tag: "test-notification-" + Date.now(),
          data: {
            url: "https://indapk.github.io",
            gameId: testGame.id,
            platform: testGame.platform
          },
          requireInteraction: true
        });
        
        respond({ 
          status: "success",
          message: "Test notification sent",
          timestamp: new Date().toISOString()
        });
        break;
        
      case "CHECK_NEW_GAMES_NOW":
        checkForNewGames()
          .then(newGames => {
            respond({ 
              status: "success", 
              newGamesCount: newGames.length,
              games: newGames.map(g => ({
                name: g.name, 
                platform: g.platform,
                timestamp: g.timestamp
              })),
              checkedAt: new Date().toISOString()
            });
          })
          .catch(error => {
            console.error("[SW] ❌ Error checking games:", error);
            respond({ 
              status: "error", 
              error: error.message,
              code: "CHECK_ERROR"
            });
          });
        break;
        
      case "GET_SW_STATUS":
        getNotificationSettings()
          .then(settings => {
            return Promise.all([
              getActivationTimestamp(),
              getLastGameCheckTimestamp(),
              getNotifiedGames()
            ]).then(([activationTime, lastCheckTime, notifiedGames]) => {
              respond({
                status: "success",
                version: VERSION,
                settings: settings,
                activationTime: activationTime ? activationTime.toISOString() : null,
                lastCheckTime: lastCheckTime ? lastCheckTime.toISOString() : null,
                notifiedGamesCount: notifiedGames.length,
                uptime: Date.now() - self.registration.installTime,
                timestamp: new Date().toISOString()
              });
            });
          })
          .catch(error => {
            respond({
              status: "error",
              error: error.message,
              version: VERSION
            });
          });
        break;
        
      case "PING":
        respond({ 
          status: "success", 
          message: "Service Worker is alive and ready",
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        break;
        
      default:
        console.warn("[SW] ⚠️ Unknown message type:", event.data.type);
        respond({
          status: "error",
          message: "Unknown message type",
          type: event.data.type
        });
    }
  }
});

// ========== FETCH HANDLER ==========

self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") return;
  
  const url = new URL(event.request.url);
  
  // Skip API requests (biarkan langsung ke network)
  if (Object.values(GAME_API_URLS).some(apiUrl => 
    url.href.includes(new URL(apiUrl).hostname))) {
    return;
  }
  
  // Skip chrome-extension requests
  if (url.protocol === "chrome-extension:") return;
  
  // Untuk navigasi (halaman HTML), network first
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache response untuk offline
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE)
            .then(cache => cache.put(event.request, responseToCache));
          return response;
        })
        .catch(() => {
          // Fallback ke cache
          return caches.match(event.request)
            .then(cachedResponse => {
              return cachedResponse || caches.match("/index.html");
            });
        })
    );
    return;
  }
  
  // Untuk static assets, cache first
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(event.request)
          .then(response => {
            // Cache jika response valid
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(RUNTIME_CACHE)
                .then(cache => cache.put(event.request, responseToCache));
            }
            return response;
          })
          .catch(() => {
            // Fallback untuk gambar
            if (event.request.destination === "image") {
              return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#0a0e1a"/><text x="50%" y="50%" font-family="Arial" font-size="14" fill="#00f0ff" text-anchor="middle" dy=".3em">INDapk Game</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
            }
            return new Response("Offline", { 
              status: 503, 
              statusText: "Service Unavailable" 
            });
          });
      })
  );
});

// ========== BACKGROUND SYNC ==========

// Register background sync jika didukung
if ("sync" in self.registration) {
  self.addEventListener("sync", (event) => {
    if (event.tag === "sync-new-games") {
      console.log("[SW] 🔄 Background sync triggered");
      event.waitUntil(
        checkForNewGames()
          .then(result => {
            console.log(`[SW] ✅ Background sync complete: ${result.length} new games`);
          })
          .catch(error => {
            console.error("[SW] ❌ Background sync error:", error);
          })
      );
    }
  });
}

// Periodic sync (jika didukung)
if ("periodicSync" in self.registration) {
  try {
    self.registration.periodicSync.register("check-new-games", {
      minInterval: CHECK_INTERVAL
    }).then(() => {
      console.log("[SW] 🔄 Periodic sync registered");
    }).catch(error => {
      console.log("[SW] ⚠️ Periodic sync not available:", error);
    });
  } catch (error) {
    console.log("[SW] ⚠️ Periodic sync not supported:", error);
  }
}

// Handle push notifications (untuk future use)
self.addEventListener("push", (event) => {
  console.log("[SW] 📲 Push notification received");
  
  if (event.data) {
    try {
      const data = event.data.json();
      event.waitUntil(
        self.registration.showNotification(data.title || NOTIFICATION_TITLE, {
          body: data.body,
          icon: data.icon || NOTIFICATION_ICON,
          data: data.data
        })
      );
    } catch (error) {
      console.error("[SW] ❌ Push notification error:", error);
      
      // Fallback push notification
      event.waitUntil(
        self.registration.showNotification(NOTIFICATION_TITLE, {
          body: "Ada game baru di INDapk!",
          icon: NOTIFICATION_ICON
        })
      );
    }
  }
});

// ========== LOG UTILITY ==========

// Store install time for uptime tracking
self.registration.installTime = Date.now();

// Periodic status log
setInterval(() => {
  getNotificationSettings().then(settings => {
    if (settings && settings.enabled) {
      console.log(`[SW] 🟢 Status: Active | Version: ${VERSION} | Uptime: ${Math.round((Date.now() - self.registration.installTime) / 60000)}m`);
    }
  });
}, 5 * 60 * 1000); // Log setiap 5 menit

console.log(`[SW] 🎮 INDapk Notification Service Worker v${VERSION} loaded successfully!`);
