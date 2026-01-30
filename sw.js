// sw.js - Service Worker untuk Notifikasi Game Baru
const CACHE_NAME = 'indapk-notification-v1';
const NOTIFICATION_ICON = '/icons/icon-192x192.png';

// URL API untuk berbagai platform
const PLATFORM_APIS = {
  'ps2': "https://script.google.com/macros/s/AKfycbwvTmKNFx0rxWjAAlTpQk9h0hnFD-GcKZcUG4g3MtHFJLnw86lPGqgSoQuuVUJDe1xy/exec",
  'switch': "https://script.google.com/macros/s/AKfycbytk1iwBYb2xGF2j3fjTmTFBNzQ_ifXsxrddlDWuPPNdMjWbHvyiRppEcoq0V1BGjn-/exec",
  'psp': "https://script.google.com/macros/s/AKfycbxCg1_l60T858d14WKA3N8c23VJ_YYj_XxX2H4Rqad1tSwaolutSrksSw9ippHu1QOA/exec",
  'android': "https://script.google.com/macros/s/AKfycbwjF-qp6zHQGiBchoReCX3xLpWSLJysoUsRDDiXbm3nZ51RdaLWrpCh5jqno5A-Rmn4/exec",
  'psvita': "https://script.google.com/macros/s/AKfycbySh1tyONA4ib6wNwq6ZXoHKiMX1P4e0rZ-4IvMiZTEyjJ6XDm1hdPwakYcOeuWPE_IQg/exec",
  'wii': "https://script.google.com/macros/s/AKfycbz8uhfQtYxyUmZSVloZlY0UDxkQayeYAemS6zDXS4zDKKJ-DYuq16pqFJLkNCYXg18a/exec",
  'gamecube': "https://script.google.com/macros/s/AKfycbzN2P7leht4d5IM_zHmevEi4-jhqL_CjzHF31dlrSvR1osR1COe3oocfKR5PC86wE6Oig/exec",
  '3ds': "https://script.google.com/macros/s/AKfycbwvTthKe_U-lCNxMu4c4WtuJbfp3Xzt8aWyAT10hFU1LXsKmsTidBoCnTQfShokliVq/exec",
  'pc': "https://script.google.com/macros/s/AKfycbxKEqdp8W2YOvP-s11-Py8mmt-qBStCFr6pdnV2kjTCX3tDI04xBtlfH5XDE3ldx2Kd3Q/exec"
};

// Cache untuk game yang sudah dinotifikasi
let NOTIFIED_GAMES = new Set();

// Install Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker: Installed');
  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker: Activated');
  event.waitUntil(self.clients.claim());
});

// Fetch event untuk menangani permintaan
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

// Push notification event
self.addEventListener('push', event => {
  console.log('Push Notification Received:', event);
  
  if (event.data) {
    const data = event.data.json();
    showNotification(data);
  }
});

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('Notification clicked:', event.notification.tag);
  
  event.notification.close();
  
  const gameId = event.notification.data?.gameId;
  const platform = event.notification.data?.platform;
  
  if (gameId && platform) {
    // Buka halaman detail game
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(windowClients => {
          const url = `/download.html?game=${gameId}&platform=${platform}`;
          
          for (let client of windowClients) {
            if (client.url.includes(url) && 'focus' in client) {
              return client.focus();
            }
          }
          
          if (clients.openWindow) {
            return clients.openWindow(url);
          }
        })
    );
  }
});

// Background sync untuk check game baru
self.addEventListener('sync', event => {
  if (event.tag === 'check-new-games') {
    console.log('Background sync: Checking for new games');
    event.waitUntil(checkForNewGames());
  }
});

// Fungsi untuk menampilkan notifikasi
function showNotification(data) {
  const options = {
    body: `${data.platform_name || data.platform} • ${data.category || ''}`,
    icon: data.thumbnail_url || NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    tag: `game-${data.download_id}-${data.platform}`,
    data: {
      gameId: data.download_id,
      platform: data.platform,
      url: `/download.html?game=${data.download_id}&platform=${data.platform}`
    },
    actions: [
      {
        action: 'open',
        title: 'Buka Game'
      },
      {
        action: 'dismiss',
        title: 'Tutup'
      }
    ],
    timestamp: Date.now()
  };

  return self.registration.showNotification(`🎮 ${data.nama_game || data.ori_name}`, options);
}

// Fungsi untuk mengecek game baru
async function checkForNewGames() {
  try {
    const settings = await getNotificationSettings();
    
    if (!settings.enabled) {
      console.log('Notifikasi dinonaktifkan oleh pengguna');
      return;
    }
    
    const platforms = settings.platforms || Object.keys(PLATFORM_APIS);
    
    for (const platform of platforms) {
      await checkPlatformForNewGames(platform, settings);
    }
    
    // Simpan cache yang sudah diperiksa
    await saveNotifiedGames();
    
  } catch (error) {
    console.error('Error checking new games:', error);
  }
}

// Fungsi untuk mengecek game baru di platform tertentu
async function checkPlatformForNewGames(platform, settings) {
  try {
    const apiUrl = PLATFORM_APIS[platform];
    if (!apiUrl) return;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'action=getAllGames'
    });
    
    const result = await response.json();
    
    if (result.status === 'success' && Array.isArray(result.data)) {
      const games = result.data;
      
      // Filter berdasarkan pengaturan
      let filteredGames = games;
      
      if (settings.frequency === 'popular') {
        // Logika untuk hanya game populer (contoh: berdasarkan tanggal atau rating)
        filteredGames = games.filter(game => {
          const date = new Date(game.timestamp || game.created_at);
          const daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
          return daysAgo <= 7; // Game dalam 7 hari terakhir
        });
      }
      
      // Cek game baru
      for (const game of filteredGames) {
        const gameKey = `${platform}-${game.download_id || game.id}`;
        
        if (!NOTIFIED_GAMES.has(gameKey)) {
          // Game baru ditemukan
          NOTIFIED_GAMES.add(gameKey);
          
          // Kirim notifikasi
          const notificationData = {
            ...game,
            platform: platform,
            platform_name: getPlatformName(platform)
          };
          
          await showNotification(notificationData);
          
          // Kirim badge update ke client
          sendBadgeUpdate();
        }
      }
    }
  } catch (error) {
    console.error(`Error checking ${platform} games:`, error);
  }
}

// Fungsi untuk mendapatkan pengaturan notifikasi
async function getNotificationSettings() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match('/notification-settings');
    
    if (response) {
      return await response.json();
    }
  } catch (error) {
    console.error('Error getting notification settings:', error);
  }
  
  // Default settings
  return {
    enabled: false,
    platforms: [],
    frequency: 'all',
    lastCheck: 0
  };
}

// Fungsi untuk menyimpan game yang sudah dinotifikasi
async function saveNotifiedGames() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const data = {
      games: Array.from(NOTIFIED_GAMES),
      timestamp: Date.now()
    };
    
    await cache.put(
      '/notified-games',
      new Response(JSON.stringify(data))
    );
  } catch (error) {
    console.error('Error saving notified games:', error);
  }
}

// Fungsi untuk memuat game yang sudah dinotifikasi
async function loadNotifiedGames() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match('/notified-games');
    
    if (response) {
      const data = await response.json();
      NOTIFIED_GAMES = new Set(data.games || []);
    }
  } catch (error) {
    console.error('Error loading notified games:', error);
  }
}

// Fungsi untuk mendapatkan nama platform
function getPlatformName(platform) {
  const platformNames = {
    'ps2': 'PlayStation 2',
    'switch': 'Nintendo Switch',
    'psp': 'PSP',
    'android': 'Android',
    'psvita': 'PS Vita',
    'wii': 'Wii',
    'gamecube': 'Gamecube',
    '3ds': '3DS',
    'pc': 'PC'
  };
  
  return platformNames[platform] || platform;
}

// Fungsi untuk mengirim update badge ke client
function sendBadgeUpdate() {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'BADGE_UPDATE',
        count: NOTIFIED_GAMES.size
      });
    });
  });
}

// Message event untuk komunikasi dengan client
self.addEventListener('message', event => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'LOAD_NOTIFIED_GAMES':
      loadNotifiedGames();
      break;
      
    case 'UPDATE_SETTINGS':
      updateNotificationSettings(data);
      break;
      
    case 'CLEAR_NOTIFICATIONS':
      clearNotifiedGames();
      break;
      
    case 'TEST_NOTIFICATION':
      sendTestNotification(data);
      break;
  }
});

// Fungsi untuk mengupdate pengaturan
async function updateNotificationSettings(settings) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      '/notification-settings',
      new Response(JSON.stringify({
        ...settings,
        lastUpdate: Date.now()
      }))
    );
  } catch (error) {
    console.error('Error updating settings:', error);
  }
}

// Fungsi untuk menghapus game yang sudah dinotifikasi
async function clearNotifiedGames() {
  NOTIFIED_GAMES.clear();
  await saveNotifiedGames();
  sendBadgeUpdate();
}

// Fungsi untuk mengirim notifikasi tes
async function sendTestNotification(settings) {
  const testData = {
    download_id: 'test-123',
    platform: settings.testPlatform || 'switch',
    platform_name: getPlatformName(settings.testPlatform || 'switch'),
    nama_game: 'Game Test Notifikasi',
    ori_name: 'Game Test Notifikasi',
    thumbnail_url: NOTIFICATION_ICON,
    category: 'Test'
  };
  
  await showNotification(testData);
}

// Load notified games saat service worker aktif
loadNotifiedGames();

// Setup periodic background sync
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-new-games-periodic') {
    console.log('Periodic sync: Checking for new games');
    event.waitUntil(checkForNewGames());
  }
});

// Background sync registration
async function registerBackgroundSync() {
  if ('periodicSync' in self.registration) {
    try {
      await self.registration.periodicSync.register('check-new-games-periodic', {
        minInterval: 5 * 60 * 1000 // 5 menit
      });
      console.log('Periodic sync registered');
    } catch (error) {
      console.error('Periodic sync failed:', error);
    }
  }
}

// Register background sync
registerBackgroundSync();
