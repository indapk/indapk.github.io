// sw.js - INDapk PWA dengan Notifikasi Game Baru (FIXED)
const VERSION = "v1.2.0";
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

// ===== NOTIFICATION CONFIGURATION =====
const NOTIFICATION_ICON = "/icons/icon-192x192.png";
const NOTIFICATION_BADGE = "/icons/icon-192x192.png";

// ===== SHARED GAMES API =====
// GANTI DENGAN URL SHARED GAMES API ANDA
const SHARED_GAMES_API_URL = "https://script.google.com/macros/s/AKfycbzyKOC3Km01_rrCefuF0VX9foplZnmBGrwnozQrd_FIvOgwZ5bkYpfFoxFVmVO8li_juw/exec";

// Shared Games Storage Key
const SHARED_GAMES_KEY = 'indapk_shared_games';

// ===== NOTIFICATION CONFIGURATION =====
const NOTIFICATION_TITLE = "INDapk - Game Baru!";
const NOTIFICATION_OPTIONS = {
  body: "Ada game baru tersedia di INDapk!",
  icon: "/icons/icon-192x192.png",
  badge: "/icons/icon-192x192.png",
  vibrate: [200, 100, 200],
  tag: "new-game",
  renotify: true,
  requireInteraction: false,
  actions: [
    {
      action: "open",
      title: "Buka Game"
    }
  ]
};

// ===== INSTALL =====
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...");
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ===== ACTIVATE =====
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...");
  
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(
        keys.map((key) => {
          if (![STATIC_CACHE, RUNTIME_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      )),
      self.clients.claim()
    ])
  );
});

// ===== FETCH =====
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
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

// ===== CACHE STRATEGIES =====
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  
  try {
    const res = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, res.clone());
    return res;
  } catch (e) {
    return caches.match(OFFLINE_URL);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  
  const fetchPromise = fetch(request)
    .then((res) => {
      cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  
  return cached || (await fetchPromise) || caches.match(OFFLINE_URL);
}

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await caches.match(request);
    return cached || (await caches.match(OFFLINE_URL));
  }
}

// ===== PUSH NOTIFICATION =====
self.addEventListener("push", (event) => {
  console.log("Push received:", event.data?.text());
  
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    showGameNotification(data);
  } catch (e) {
    // Not JSON, treat as simple message
    showSimpleNotification(event.data.text());
  }
});

// ===== NOTIFICATION CLICK =====
self.addEventListener("notificationclick", (event) => {
  console.log("Notification clicked:", event.notification.tag);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || "/";
  const gameId = event.notification.data?.gameId;
  const platform = event.notification.data?.platform;
  
  let targetUrl = urlToOpen;
  if (gameId && platform) {
    targetUrl = `/download.html?game=${gameId}&platform=${platform}`;
  }
  
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// ===== BACKGROUND SYNC =====
self.addEventListener("sync", (event) => {
  if (event.tag === "check-new-games") {
    console.log("Background sync: Checking for new games");
    event.waitUntil(checkForNewGames());
  }
});
// Tambahkan di awal sw.js
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()) // Langsung activate
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(
        keys.map((key) => {
          if (![STATIC_CACHE, RUNTIME_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      )),
      self.clients.claim() // Langsung control clients
    ])
  );
});

// ===== PERIODIC SYNC =====
self.addEventListener("sync", (event) => {
  if (event.tag === "check-new-games") {
    event.waitUntil(checkForNewGames());
  }
});

// ===== MESSAGE FROM CLIENT =====
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CHECK_NEW_GAMES") {
    event.waitUntil(checkForNewGames());
  }
  
  if (event.data && event.data.type === "TEST_NOTIFICATION") {
    const game = event.data.game;
    event.waitUntil(showDetailedGameNotification(game));
  }
});

// ===== CHECK FOR NEW GAMES =====
async function checkForNewGames() {
  try {
    console.log("Checking for new games...");
    
    // Get user notification preference
    const userPrefs = await getUserNotificationPrefs();
    if (!userPrefs.enabled) {
      console.log("Notifications are disabled");
      return 0;
    }
    
    // Get current games from Shared Games API
    const sharedGames = await getSharedGamesFromAPI();
    
    // Fetch current games from all APIs via your main site
    const currentGames = await fetchCurrentGamesFromSite();
    
    // Find new games
    const newGames = findNewGames(currentGames, sharedGames);
    
    if (newGames.length > 0) {
      console.log(`Found ${newGames.length} new games:`, newGames);
      
      // Mark as shared
      await markGamesAsShared(newGames);
      
      // Show detailed notifications for each new game
      for (const gameId of newGames) {
        await showNewGameDetailNotification(gameId);
      }
    }
    
    return newGames.length;
  } catch (error) {
    console.error("Error checking new games:", error);
    return 0;
  }
}

// ===== GET SHARED GAMES FROM API =====
async function getSharedGamesFromAPI() {
  try {
    const response = await fetch(SHARED_GAMES_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ action: 'getSharedGames' })
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.status === 'success' && result.data.shared_games) {
        return result.data.shared_games;
      }
    }
  } catch (e) {
    console.error("Error fetching shared games from API:", e);
  }
  
  return [];
}

// ===== FETCH CURRENT GAMES FROM YOUR SITE =====
async function fetchCurrentGamesFromSite() {
  try {
    // Try to get from cache first (from main page)
    const cache = await caches.open(RUNTIME_CACHE);
    const cachedResponse = await cache.match('/current-games');
    
    if (cachedResponse) {
      const data = await cachedResponse.json();
      return data.games || [];
    }
  } catch (e) {
    console.error("Error reading current games cache:", e);
  }
  
  return [];
}

// ===== GET USER NOTIFICATION PREFERENCES =====
async function getUserNotificationPrefs() {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const response = await cache.match('/notification-prefs');
    
    if (response) {
      const data = await response.json();
      return data;
    }
  } catch (e) {
    console.error("Error reading notification prefs:", e);
  }
  
  return { enabled: false }; // Default disabled
}

// ===== MARK GAMES AS SHARED =====
async function markGamesAsShared(gameIds) {
  if (!gameIds || gameIds.length === 0) return;
  
  try {
    const response = await fetch(SHARED_GAMES_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'addSharedGames',
        gameIds: JSON.stringify(gameIds)
      })
    });
    
    const result = await response.json();
    console.log(`Marked ${result.data?.added_count || 0} games as shared`);
  } catch (e) {
    console.error("Error marking games as shared:", e);
  }
}

// ===== FIND NEW GAMES =====
function findNewGames(currentGames, sharedGames) {
  const sharedSet = new Set(sharedGames);
  return currentGames.filter(gameId => !sharedSet.has(gameId));
}

// ===== SHOW DETAILED GAME NOTIFICATION =====
async function showNewGameDetailNotification(gameId) {
  try {
    // Try to get game details from cache
    const gameDetails = await getGameDetails(gameId);
    
    if (gameDetails) {
      await showDetailedGameNotification(gameDetails);
    } else {
      // Fallback to simple notification
      await showSimpleNotification(`Game baru: ${gameId}`);
    }
  } catch (e) {
    console.error("Error showing detailed notification:", e);
  }
}

// ===== GET GAME DETAILS =====
async function getGameDetails(gameId) {
  try {
    // Try to get from cache (from main page)
    const cache = await caches.open(RUNTIME_CACHE);
    const response = await cache.match('/games-details');
    
    if (response) {
      const data = await response.json();
      return data[gameId] || null;
    }
  } catch (e) {
    console.error("Error getting game details:", e);
  }
  
  // Parse gameId to extract platform and id
  const [platform, id] = gameId.split('_');
  
  return {
    id: gameId,
    download_id: id,
    platform: platform,
    nama_game: `Game ${platform} #${id}`,
    thumbnail_url: null
  };
}

// ===== SHOW DETAILED NOTIFICATION =====
async function showDetailedGameNotification(game) {
  const title = `🎮 Game Baru: ${game.nama_game || 'INDapk Game'}`;
  
  const options = {
    body: `Platform: ${getPlatformName(game.platform)}\nKlik untuk download!`,
    icon: game.thumbnail_url || NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    vibrate: [200, 100, 200],
    tag: `new-game-${game.id || game.download_id}`,
    renotify: true,
    requireInteraction: false,
    silent: false,
    data: {
      url: "/",
      gameId: game.download_id,
      platform: game.platform,
      gameName: game.nama_game,
      timestamp: Date.now()
    },
    actions: [
      {
        action: "open",
        title: "🔍 Lihat Game"
      },
      {
        action: "dismiss",
        title: "✕ Tutup"
      }
    ]
  };
  
  await self.registration.showNotification(title, options);
}

// ===== SHOW SIMPLE NOTIFICATION =====
async function showSimpleNotification(message) {
  await self.registration.showNotification("INDapk - Game Baru!", {
    body: message,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    vibrate: [200, 100, 200],
    tag: "new-game",
    renotify: true,
    data: { url: "/" }
  });
}

// ===== SHOW GAME NOTIFICATION FROM PUSH =====
async function showGameNotification(data) {
  const title = data.title || "🎮 Game Baru di INDapk!";
  
  const options = {
    body: data.body || "Ada game baru tersedia!",
    icon: data.icon || NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    vibrate: [200, 100, 200],
    tag: data.tag || "new-game",
    renotify: true,
    data: data.data || { url: "/" },
    actions: data.actions || [
      { action: "open", title: "🔍 Lihat" }
    ]
  };
  
  await self.registration.showNotification(title, options);
}

// ===== GET PLATFORM NAME =====
function getPlatformName(platform) {
  const names = {
    'ps1': 'PlayStation 1',
    'ps2': 'PlayStation 2',
    'ps3': 'PlayStation 3',
    'ps4': 'PlayStation 4',
    'switch': 'Nintendo Switch',
    'psp': 'PSP',
    'psvita': 'PS Vita',
    'wii': 'Nintendo Wii',
    'gamecube': 'GameCube',
    '3ds': '3DS',
    'android': 'Android',
    'ios': 'iOS',
    'pc': 'PC',
    'java': 'Java',
    'apksgi': 'APKsgi 18+'
  };
  
  return names[platform] || platform.toUpperCase();
}


async function getSharedGames() {
  // Get from cache first
  const cache = await caches.open(RUNTIME_CACHE);
  const response = await cache.match('/shared-games');
  
  if (response) {
    try {
      const data = await response.json();
      return data.shared_games || [];
    } catch (e) {
      console.error("Error parsing shared games:", e);
    }
  }
  
  // Fallback to default list from your data
  return [
    "psp_47974", "psp_33467", "android_23221", "android_48909", "android_10860",
    // ... (semua ID yang sudah Anda share)
    "android_11167"
  ];
}

async function fetchCurrentGames() {
  const gameApis = [
    GAMEPS1_API_URL = "https://script.google.com/macros/s/AKfycbxExg-rUr-CcJUYZ786k57e5E7JO2mSrGdRppr6JWbb7fHoTTAJs7x7AnYEmcOOK-49/exec",
    GAMEPS2_API_URL = "https://script.google.com/macros/s/AKfycbwvTmKNFx0rxWjAAlTpQk9h0hnFD-GcKZcUG4g3MtHFJLnw86lPGqgSoQuuVUJDe1xy/exec",
    // ... (tambahkan semua API URL lainnya)
  ];
  
  let allGames = [];
  
  // Fetch from each API
  for (const apiUrl of gameApis) {
    try {
      const response = await fetch(`${apiUrl}?action=getAllGames`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && Array.isArray(data.data)) {
          // Extract game IDs based on platform
          const platform = getPlatformFromUrl(apiUrl);
          const gameIds = data.data.map(game => 
            `${platform}_${game.download_id || game.id}`
          );
          allGames = [...allGames, ...gameIds];
        }
      }
    } catch (error) {
      console.error(`Error fetching from ${apiUrl}:`, error);
    }
  }
  
  return [...new Set(allGames)]; // Remove duplicates
}

function getPlatformFromUrl(apiUrl) {
  if (apiUrl.includes('gameps1')) return 'ps1';
  if (apiUrl.includes('gameps2')) return 'ps2';
  if (apiUrl.includes('gameps3')) return 'ps3';
  if (apiUrl.includes('gameps4')) return 'ps4';
  if (apiUrl.includes('gameswitch')) return 'switch';
  if (apiUrl.includes('gamepsp')) return 'psp';
  if (apiUrl.includes('gamepsvita')) return 'psvita';
  if (apiUrl.includes('gameandroid')) return 'android';
  if (apiUrl.includes('pc_api')) return 'pc';
  if (apiUrl.includes('gamewii')) return 'wii';
  if (apiUrl.includes('gamecube')) return 'gamecube';
  if (apiUrl.includes('game3ds')) return '3ds';
  if (apiUrl.includes('gamejava')) return 'java';
  if (apiUrl.includes('gameios')) return 'ios';
  if (apiUrl.includes('apksgi')) return 'apksgi';
  return 'unknown';
}

async function updateSharedGames(newGames) {
  try {
    // Get current shared games
    const currentShared = await getSharedGames();
    
    // Add new games
    const updatedShared = [...new Set([...currentShared, ...newGames])];
    
    // Store in cache
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put('/shared-games', 
      new Response(JSON.stringify({ shared_games: updatedShared }))
    );
    
    // Also sync with background script
    await syncSharedGamesWithBackground(updatedShared);
    
    return updatedShared;
  } catch (error) {
    console.error("Error updating shared games:", error);
    throw error;
  }
}

async function syncSharedGamesWithBackground(sharedGames) {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'UPDATE_SHARED_GAMES',
        data: { shared_games: sharedGames }
      });
    });
  } catch (error) {
    console.error("Error syncing with clients:", error);
  }
}

async function showNewGameNotifications(newGames) {
  if (newGames.length === 0) return;
  
  const notificationTitle = newGames.length === 1 
    ? "1 Game Baru Tersedia!" 
    : `${newGames.length} Game Baru Tersedia!`;
  
  const notificationBody = newGames.length === 1
    ? "Ada game baru di INDapk. Klik untuk melihat!"
    : `Ada ${newGames.length} game baru di INDapk. Klik untuk melihat!`;
  
  await self.registration.showNotification(notificationTitle, {
    ...NOTIFICATION_OPTIONS,
    body: notificationBody,
    data: {
      url: "/",
      type: "new-games",
      count: newGames.length
    }
  });
}

async function syncWithBackground(newGames) {
  // Send message to all clients
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'NEW_GAMES_FOUND',
      data: {
        count: newGames.length,
        games: newGames
      }
    });
  });
}

// ===== PERIODIC SYNC =====
// This will run periodically in the background
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-games-periodic') {
    event.waitUntil(checkForNewGames());
  }
});
