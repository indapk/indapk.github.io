// sw.js - Service Worker untuk INDapk Game Library
const CACHE_NAME = 'indapk-game-cache-v5'; // Naikkan versi
const DYNAMIC_CACHE_NAME = 'indapk-dynamic-cache-v2';
const NOTIFICATION_ICON = '/icons/icon-192x192.png';
const VERSION = '5.0.0';

// API URLs untuk caching
const API_URLS = [
  "https://script.google.com/macros/s/AKfycbwvTmKNFx0rxWjAAlTpQk9h0hnFD-GcKZcUG4g3MtHFJLnw86lPGqgSoQuuVUJDe1xy/exec",
  "https://script.google.com/macros/s/AKfycbytk1iwBYb2xGF2j3fjTmTFBNzQ_ifXsxrddlDWuPPNdMjWbHvyiRppEcoq0V1BGjn-/exec",
  "https://script.google.com/macros/s/AKfycbxCg1_l60T858d14WKA3N8c23VJ_YYj_XxX2H4Rqad1tSwaolutSrksSw9ippHu1QOA/exec",
  "https://script.google.com/macros/s/AKfycbwjF-qp6zHQGiBchoReCX3xLpWSLJysoUsRDDiXbm3nZ51RdaLWrpCh5jqno5A-Rmn4/exec",
  "https://script.google.com/macros/s/AKfycbySh1tyONA4ib6wNwq6ZXoHKiMX1P4e0rZ-4IvMiZTEyjJ6XDm1hdPwakYcOeuWPE_IQg/exec",
  "https://script.google.com/macros/s/AKfycbz8uhfQtYxyUmZSVloZlY0UDxkQayeYAemS6zDXS4zDKKJ-DYuq16pqFJLkNCYXg18a/exec",
  "https://script.google.com/macros/s/AKfycbzN2P7leht4d5IM_zHmevEi4-jhqL_CjzHF31dlrSvR1osR1COe3oocfKR5PC86wE6Oig/exec",
  "https://script.google.com/macros/s/AKfycbwvTthKe_U-lCNxMu4c4WtuJbfp3Xzt8aWyAT10hFU1LXsKmsTidBoCnTQfShokliVq/exec",
  "https://script.google.com/macros/s/AKfycbxKEqdp8W2YOvP-s11-Py8mmt-qBStCFr6pdnV2kjTCX3tDI04xBtlfH5XDE3ldx2Kd3Q/exec"
];

// Assets yang akan di-cache saat instalasi
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/download.html',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Inter:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// ===== INSTALL EVENT =====
self.addEventListener('install', (event) => {
  console.log(`[SW ${VERSION}] Installing Service Worker...`);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[SW] Cache opened, adding static assets');
        
        // Cache assets satu per satu dengan error handling
        for (const asset of STATIC_ASSETS) {
          try {
            await cache.add(asset);
            console.log(`[SW] Cached: ${asset}`);
          } catch (error) {
            console.warn(`[SW] Failed to cache ${asset}:`, error);
          }
        }
        
        console.log('[SW] All assets cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Cache installation failed:', error);
        // Tetap skip waiting meski ada error
        return self.skipWaiting();
      })
  );
});

// ===== ACTIVATE EVENT =====
self.addEventListener('activate', (event) => {
  console.log(`[SW ${VERSION}] Activating Service Worker...`);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })
    .then(() => {
      console.log('[SW] Service Worker activated');
      
      // Kirim notifikasi ke semua clients bahwa SW aktif
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: VERSION,
            timestamp: Date.now()
          });
        });
      });
    })
    .catch((error) => {
      console.error('[SW] Activation error:', error);
    })
  );
});

// ===== FETCH EVENT (Cache Strategy) =====
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip Chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Skip Google Sheets API (cache dengan strategi khusus)
  if (API_URLS.some(apiUrl => url.href.includes(apiUrl))) {
    event.respondWith(cacheThenNetworkStrategy(event));
    return;
  }
  
  // Untuk assets static, gunakan Cache First
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStrategy(event));
    return;
  }
  
  // Untuk halaman HTML, gunakan Network First
  if (event.request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(networkFirstStrategy(event));
    return;
  }
  
  // Default: Cache First dengan fallback ke network
  event.respondWith(cacheFirstWithNetworkFallback(event));
});

// ===== STRATEGI CACHE =====

// Cache First untuk static assets
async function cacheFirstStrategy(event) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    
    if (cachedResponse) {
      console.log('[SW] Serving from cache:', event.request.url);
      return cachedResponse;
    }
    
    // Jika tidak ada di cache, fetch dari network
    const networkResponse = await fetch(event.request);
    
    // Clone response untuk cache
    const responseToCache = networkResponse.clone();
    
    // Cache response untuk penggunaan selanjutnya
    event.waitUntil(
      cache.put(event.request, responseToCache)
        .catch(error => {
          console.warn('[SW] Failed to cache response:', error);
        })
    );
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Fetch failed:', error);
    
    // Fallback ke halaman offline jika tersedia
    const cache = await caches.open(CACHE_NAME);
    const offlineResponse = await cache.match('/offline.html');
    if (offlineResponse) {
      return offlineResponse;
    }
    
    // Fallback ke halaman error sederhana
    return new Response('Network error, anda sedang offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// Network First untuk halaman HTML
async function networkFirstStrategy(event) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    
    // Coba fetch dari network dulu
    const networkResponse = await fetch(event.request);
    
    // Clone response untuk cache
    const responseToCache = networkResponse.clone();
    
    // Update cache
    event.waitUntil(
      cache.put(event.request, responseToCache)
        .catch(error => {
          console.warn('[SW] Failed to cache network response:', error);
        })
    );
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', error);
    
    // Coba dari cache
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback ke halaman offline
    const offlineCache = await caches.open(CACHE_NAME);
    const offlineResponse = await offlineCache.match('/offline.html');
    if (offlineResponse) {
      return offlineResponse;
    }
    
    // Fallback terakhir
    return new Response(
      '<h1>Anda sedang offline</h1><p>Coba periksa koneksi internet Anda.</p>',
      {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }
}

// Cache First dengan Network Fallback
async function cacheFirstWithNetworkFallback(event) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    
    if (cachedResponse) {
      // Background refresh
      event.waitUntil(
        (async () => {
          try {
            const networkResponse = await fetch(event.request);
            if (networkResponse.ok) {
              const responseToCache = networkResponse.clone();
              await cache.put(event.request, responseToCache);
            }
          } catch (error) {
            // Gagal refresh, tetap gunakan cache
            console.log('[SW] Background refresh failed:', error);
          }
        })()
      );
      
      return cachedResponse;
    }
    
    // Jika tidak ada di cache, fetch dari network
    const networkResponse = await fetch(event.request);
    
    // Cache response untuk penggunaan selanjutnya
    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      event.waitUntil(
        cache.put(event.request, responseToCache)
          .catch(error => {
            console.warn('[SW] Failed to cache response:', error);
          })
      );
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Fetch failed:', error);
    
    // Return error response
    return new Response('Network error', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Cache Then Network untuk API calls
async function cacheThenNetworkStrategy(event) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    
    // Selalu return cache terlebih dahulu (jika ada)
    if (cachedResponse) {
      // Fetch baru di background untuk update
      event.waitUntil(
        (async () => {
          try {
            const networkResponse = await fetch(event.request);
            if (networkResponse.ok) {
              const responseToCache = networkResponse.clone();
              await cache.put(event.request, responseToCache);
              
              // Kirim notifikasi ke clients bahwa ada data baru
              const clients = await self.clients.matchAll();
              clients.forEach((client) => {
                client.postMessage({
                  type: 'DATA_UPDATED',
                  url: event.request.url,
                  timestamp: Date.now()
                });
              });
            }
          } catch (error) {
            console.log('[SW] Background API fetch failed:', error);
          }
        })()
      );
      
      return cachedResponse;
    }
    
    // Jika tidak ada cache, fetch dari network
    const networkResponse = await fetch(event.request);
    
    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      await cache.put(event.request, responseToCache);
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] API fetch failed:', error);
    
    return new Response(JSON.stringify({ 
      status: 'error', 
      message: 'Failed to fetch data' 
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ===== PUSH NOTIFICATIONS (Dengan Error Handling) =====
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  // Cek apakah notifikasi diizinkan
  if (!self.Notification || self.Notification.permission !== 'granted') {
    console.log('[SW] Push notification ignored - no permission');
    return;
  }
  
  let notificationData = {
    title: 'INDapk Game Library',
    body: 'Game baru tersedia!',
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    tag: 'indapk-game-notification',
    data: {
      url: '/',
      timestamp: Date.now()
    }
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (error) {
      console.log('[SW] Push data is not JSON, using text');
      try {
        notificationData.body = event.data.text() || notificationData.body;
      } catch (e) {
        console.log('[SW] Cannot read push data');
      }
    }
  }
  
  const showNotification = self.registration.showNotification(
    notificationData.title,
    {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      data: notificationData.data,
      actions: [
        {
          action: 'open',
          title: 'Buka',
          icon: '/icons/icon-72x72.png'
        },
        {
          action: 'dismiss',
          title: 'Tutup',
          icon: '/icons/icon-72x72.png'
        }
      ],
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: false
    }
  );
  
  event.waitUntil(
    showNotification.catch(error => {
      console.error('[SW] Failed to show notification:', error);
    })
  );
});

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  const openClient = async () => {
    try {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });
      
      // Cari tab/window yang sudah terbuka dengan URL yang sama
      for (const client of clients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          await client.focus();
          return;
        }
      }
      
      // Jika tidak ada, buka tab/window baru
      if (self.clients.openWindow) {
        await self.clients.openWindow(urlToOpen);
      }
    } catch (error) {
      console.error('[SW] Error opening window:', error);
    }
  };
  
  event.waitUntil(openClient());
});

// ===== BACKGROUND SYNC (Dengan Compatibility Check) =====
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event:', event.tag);
  
  // Cek apakah background sync didukung
  if (!('sync' in self.registration)) {
    console.log('[SW] Background sync not supported');
    return;
  }
  
  if (event.tag === 'sync-games') {
    event.waitUntil(syncGamesData());
  }
  
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotificationSettings());
  }
});

// Sync games data
async function syncGamesData() {
  console.log('[SW] Syncing games data...');
  
  try {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    
    // Sync semua API
    for (const apiUrl of API_URLS) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'action=getAllGames'
        });
        
        if (response.ok) {
          const responseToCache = response.clone();
          await cache.put(apiUrl, responseToCache);
          console.log(`[SW] Synced: ${apiUrl}`);
        }
      } catch (error) {
        console.error(`[SW] Failed to sync ${apiUrl}:`, error);
      }
    }
    
    // Beritahu clients bahwa sync selesai
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      try {
        client.postMessage({
          type: 'SYNC_COMPLETED',
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('[SW] Failed to post sync message:', error);
      }
    });
    
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// Sync notification settings
async function syncNotificationSettings() {
  console.log('[SW] Syncing notification settings...');
  // Implementasi sync settings jika diperlukan
}

// ===== PERIODIC SYNC (Dengan Compatibility Check) =====
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync event:', event.tag);
  
  // Cek apakah periodic sync didukung
  if (!('periodicSync' in self.registration)) {
    console.log('[SW] Periodic sync not supported');
    return;
  }
  
  if (event.tag === 'periodic-games-sync') {
    event.waitUntil(syncGamesData());
  }
});

// ===== MESSAGE HANDLING =====
self.addEventListener('message', (event) => {
  if (!event.data || !event.data.type) return;
  
  const { type, data } = event.data;
  console.log(`[SW] Message received: ${type}`, data);
  
  switch (type) {
    case 'CACHE_GAMES':
      cacheGamesData(data, event);
      break;
      
    case 'GET_CACHED_GAMES':
      getCachedGames(event);
      break;
      
    case 'CLEAR_CACHE':
      clearCache(event);
      break;
      
    case 'UPDATE_SETTINGS':
      updateSettings(data);
      break;
      
    case 'CHECK_FOR_UPDATES':
      checkForUpdates();
      break;
      
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'REGISTER_BACKGROUND_SYNC':
      registerBackgroundSync(data);
      break;
      
    case 'TEST_NOTIFICATION':
      sendTestNotification(data);
      break;
      
    case 'LOAD_NOTIFIED_GAMES':
      loadNotifiedGames(event);
      break;
      
    case 'CLEAR_NOTIFICATIONS':
      clearNotifications();
      break;
  }
});

// Cache games data dari client
async function cacheGamesData(gamesData, event) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const response = new Response(JSON.stringify({
      data: gamesData,
      timestamp: Date.now(),
      version: VERSION
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    await cache.put('/cached-games-data', response);
    console.log('[SW] Games data cached successfully');
    
    // Konfirmasi ke client
    if (event && event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        status: 'success',
        message: 'Data cached successfully'
      });
    }
  } catch (error) {
    console.error('[SW] Error caching games:', error);
    
    if (event && event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        status: 'error',
        error: error.message
      });
    }
  }
}

// Get cached games untuk client
async function getCachedGames(event) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const response = await cache.match('/cached-games-data');
    
    if (response) {
      const data = await response.json();
      
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          status: 'success',
          data: data.data,
          timestamp: data.timestamp,
          version: data.version
        });
      }
    } else {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          status: 'empty',
          message: 'No cached data found'
        });
      }
    }
  } catch (error) {
    console.error('[SW] Error getting cached games:', error);
    
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        status: 'error',
        error: error.message
      });
    }
  }
}

// Clear cache
async function clearCache(event) {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
    console.log('[SW] All caches cleared');
    
    // Re-cache static assets
    const cache = await caches.open(CACHE_NAME);
    
    for (const asset of STATIC_ASSETS) {
      try {
        await cache.add(asset);
      } catch (error) {
        console.warn(`[SW] Failed to recache ${asset}:`, error);
      }
    }
    
    // Beritahu clients
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      try {
        client.postMessage({
          type: 'CACHE_CLEARED',
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('[SW] Failed to post cache cleared message:', error);
      }
    });
  } catch (error) {
    console.error('[SW] Error clearing cache:', error);
  }
}

// Update settings
async function updateSettings(settings) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = new Response(JSON.stringify({
      settings,
      timestamp: Date.now()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    await cache.put('/user-settings', response);
    console.log('[SW] Settings updated');
  } catch (error) {
    console.error('[SW] Error updating settings:', error);
  }
}

// Check for updates
async function checkForUpdates() {
  console.log('[SW] Checking for updates...');
  
  try {
    // Cek update untuk static assets
    const cache = await caches.open(CACHE_NAME);
    
    for (const asset of STATIC_ASSETS) {
      try {
        const networkResponse = await fetch(asset, { 
          cache: 'reload',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        if (networkResponse.status === 200) {
          const cachedResponse = await cache.match(asset);
          
          if (!cachedResponse || 
              networkResponse.headers.get('etag') !== cachedResponse.headers.get('etag') ||
              networkResponse.headers.get('last-modified') !== cachedResponse.headers.get('last-modified')) {
            
            console.log(`[SW] Update found for: ${asset}`);
            await cache.put(asset, networkResponse.clone());
            
            // Beritahu client ada update
            const clients = await self.clients.matchAll();
            clients.forEach((client) => {
              try {
                client.postMessage({
                  type: 'ASSET_UPDATED',
                  asset: asset,
                  timestamp: Date.now()
                });
              } catch (error) {
                console.error('[SW] Failed to post asset update message:', error);
              }
            });
          }
        }
      } catch (error) {
        console.error(`[SW] Failed to check update for ${asset}:`, error);
      }
    }
    
    console.log('[SW] Update check completed');
    
  } catch (error) {
    console.error('[SW] Update check failed:', error);
  }
}

// Register background sync
async function registerBackgroundSync(tag) {
  try {
    const registration = await self.registration;
    
    if ('periodicSync' in registration) {
      try {
        const status = await registration.periodicSync.getTags();
        console.log('[SW] Current periodic sync tags:', status);
        
        if (!status.includes(tag)) {
          await registration.periodicSync.register(tag, {
            minInterval: 24 * 60 * 60 * 1000 // 24 jam
          });
          console.log(`[SW] Periodic sync registered: ${tag}`);
        }
      } catch (periodicError) {
        console.log('[SW] Periodic sync not available:', periodicError);
      }
    } else {
      console.log('[SW] Periodic sync not supported');
    }
    
    if ('sync' in registration) {
      try {
        await registration.sync.register(tag);
        console.log(`[SW] Background sync registered: ${tag}`);
      } catch (syncError) {
        console.log('[SW] Background sync not available:', syncError);
      }
    } else {
      console.log('[SW] Background sync not supported');
    }
  } catch (error) {
    console.error('[SW] Failed to register sync:', error);
  }
}

// Send test notification
async function sendTestNotification(data) {
  try {
    const notificationData = {
      title: data.title || 'Test Notification',
      body: data.body || 'This is a test notification from INDapk',
      icon: NOTIFICATION_ICON,
      tag: 'test-notification',
      data: {
        url: '/',
        test: true
      }
    };
    
    await self.registration.showNotification(
      notificationData.title,
      {
        body: notificationData.body,
        icon: notificationData.icon,
        tag: notificationData.tag,
        data: notificationData.data
      }
    );
  } catch (error) {
    console.error('[SW] Failed to send test notification:', error);
  }
}

// Load notified games
async function loadNotifiedGames(event) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const response = await cache.match('/notified-games');
    
    if (response) {
      const data = await response.json();
      
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          status: 'success',
          data: data.games || []
        });
      }
    } else {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          status: 'empty',
          games: []
        });
      }
    }
  } catch (error) {
    console.error('[SW] Error loading notified games:', error);
    
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        status: 'error',
        error: error.message,
        games: []
      });
    }
  }
}

// Clear notifications
async function clearNotifications() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    await cache.delete('/notified-games');
    console.log('[SW] Notifications cleared');
  } catch (error) {
    console.error('[SW] Error clearing notifications:', error);
  }
}

// ===== HELPER FUNCTIONS =====

// Cek apakah URL adalah static asset
function isStaticAsset(url) {
  return STATIC_ASSETS.some(asset => {
    try {
      const assetUrl = new URL(asset, self.location.origin);
      return assetUrl.href === url.href;
    } catch {
      return asset === url.href || url.href.includes(asset);
    }
  });
}

// Cek apakah URL adalah API URL
function isApiUrl(url) {
  return API_URLS.some(apiUrl => url.href.includes(apiUrl));
}

// Precache API data saat idle
if (self.requestIdleCallback) {
  self.requestIdleCallback(() => {
    precacheApiData();
  });
} else {
  setTimeout(precacheApiData, 5000);
}

// Precache API data
async function precacheApiData() {
  console.log('[SW] Pre-caching API data...');
  
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  
  for (const apiUrl of API_URLS) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'action=getAllGames'
      });
      
      if (response.ok) {
        await cache.put(apiUrl, response.clone());
        console.log(`[SW] Pre-cached: ${apiUrl}`);
      }
    } catch (error) {
      console.error(`[SW] Failed to pre-cache ${apiUrl}:`, error);
    }
  }
}

// ===== OFFLINE SUPPORT =====
// Create offline page jika tidak ada
async function createOfflinePage() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const offlinePage = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>INDapk - Offline</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #0a0e1a, #1a1f2e);
            color: white;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 20px;
          }
          .container {
            max-width: 500px;
          }
          h1 {
            color: #00f0ff;
            margin-bottom: 20px;
          }
          p {
            opacity: 0.8;
            margin-bottom: 30px;
          }
          .offline-icon {
            font-size: 4rem;
            margin-bottom: 20px;
            color: #ff4757;
          }
          button {
            background: linear-gradient(135deg, #00f0ff, #b537f2);
            border: none;
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            font-weight: bold;
            cursor: pointer;
            transition: transform 0.3s;
          }
          button:hover {
            transform: translateY(-2px);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="offline-icon">📶</div>
          <h1>Anda sedang offline</h1>
          <p>Koneksi internet Anda terputus. Silakan periksa koneksi dan coba lagi.</p>
          <button onclick="location.reload()">Coba Lagi</button>
        </div>
      </body>
      </html>
    `;
    
    const response = new Response(offlinePage, {
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'max-age=86400'
      }
    });
    
    await cache.put('/offline.html', response);
    console.log('[SW] Offline page created');
  } catch (error) {
    console.error('[SW] Error creating offline page:', error);
  }
}

// Cek dan buat offline page saat SW aktif
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const offlinePage = await cache.match('/offline.html');
        
        if (!offlinePage) {
          await createOfflinePage();
        }
      } catch (error) {
        console.error('[SW] Error checking offline page:', error);
      }
    })()
  );
});

// ===== ERROR HANDLING =====
self.addEventListener('error', (event) => {
  console.error('[SW] Error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Unhandled rejection:', event.reason);
});

// ===== INITIALIZATION =====
console.log(`[SW ${VERSION}] Service Worker loaded successfully`);

// Self-check saat load
(async function selfCheck() {
  try {
    console.log('[SW] Performing self-check...');
    
    // Cek cache storage availability
    if (!caches) {
      console.warn('[SW] Cache API not available');
    }
    
    // Cek notification permission
    if (!self.Notification) {
      console.warn('[SW] Notification API not available');
    }
    
    // Cek background sync
    if (!('sync' in self.registration)) {
      console.warn('[SW] Background Sync API not available');
    }
    
    console.log('[SW] Self-check completed');
  } catch (error) {
    console.error('[SW] Self-check failed:', error);
  }
})();
