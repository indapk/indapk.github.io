// sw.js - INDapk PWA dengan Notifikasi Game Baru
const VERSION = "v1.1.0";
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
  
  // Request notification permission on install
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE)
        .then((cache) => cache.addAll(PRECACHE))
        .then(() => self.skipWaiting()),
      
      // Request notification permission
      self.registration.pushManager?.getSubscription()
        .then(subscription => {
          if (!subscription) {
            // No subscription yet
            console.log("No push subscription yet");
          }
        })
        .catch(err => console.log("Push error:", err))
    ])
  );
});

// ===== ACTIVATE =====
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...");
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((keys) => Promise.all(
        keys.map((key) => {
          if (![STATIC_CACHE, RUNTIME_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      )),
      
      // Check for new games immediately
      checkForNewGames()
    ]).then(() => self.clients.claim())
  );
});

// ===== FETCH =====
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Navigation requests
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

  // Same-origin assets
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

// ===== PUSH NOTIFICATION =====
self.addEventListener("push", (event) => {
  console.log("Service Worker: Push received");
  
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || NOTIFICATION_TITLE;
      const options = {
        ...NOTIFICATION_OPTIONS,
        body: data.body || NOTIFICATION_OPTIONS.body,
        data: data.data || {}
      };
      
      event.waitUntil(
        self.registration.showNotification(title, options)
      );
    } catch (e) {
      // If not JSON, show default notification
      const text = event.data.text();
      event.waitUntil(
        self.registration.showNotification(NOTIFICATION_TITLE, {
          ...NOTIFICATION_OPTIONS,
          body: text || "Ada game baru tersedia!"
        })
      );
    }
  }
});

// ===== NOTIFICATION CLICK =====
self.addEventListener("notificationclick", (event) => {
  console.log("Notification clicked:", event.notification.tag);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || "/";
  
  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }
      
      // Open a new window if none exists
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
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

// ===== HELPER FUNCTIONS =====
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

// ===== CHECK FOR NEW GAMES =====
async function checkForNewGames() {
  try {
    console.log("Checking for new games...");
    
    // Get current shared games from storage
    const sharedGames = await getSharedGames();
    
    // Fetch current games from all APIs
    const currentGames = await fetchCurrentGames();
    
    // Find new games
    const newGames = findNewGames(currentGames, sharedGames);
    
    // Show notifications for new games
    if (newGames.length > 0) {
      console.log(`Found ${newGames.length} new games`);
      
      // Update shared games list
      await updateSharedGames(newGames);
      
      // Show notifications
      await showNewGameNotifications(newGames);
      
      // Trigger sync with background
      await syncWithBackground(newGames);
    }
    
    return newGames.length;
  } catch (error) {
    console.error("Error checking new games:", error);
    return 0;
  }
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

function findNewGames(currentGames, sharedGames) {
  return currentGames.filter(gameId => !sharedGames.includes(gameId));
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
