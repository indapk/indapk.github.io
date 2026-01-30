// ====== FUNGSI NOTIFIKASI TAMBAHAN ======

// Reset notifikasi (mulai dari sekarang)
async function resetNotifications() {
  if (!confirm('Reset notifikasi akan membuat sistem hanya menerima game baru dari sekarang. Game lama tidak akan dinotifikasi. Lanjutkan?')) {
    return;
  }
  
  try {
    const response = await sendMessageToSW({
      type: 'RESET_NOTIFICATIONS'
    });
    
    if (response.status === 'success') {
      showNotificationStatus('✅ Notifikasi direset. Hanya game baru dari sekarang yang akan muncul.', 'success');
      
      // Clear local cache
      localStorage.removeItem('indapk_notified_games');
      
      // Test notifikasi
      setTimeout(() => {
        sendTestNotification();
      }, 1000);
    }
  } catch (error) {
    console.error('Error resetting notifications:', error);
    showNotificationStatus('❌ Gagal reset notifikasi', 'danger');
  }
}

// Dapatkan info aktivasi notifikasi
async function getNotificationActivationInfo() {
  try {
    const response = await sendMessageToSW({
      type: 'GET_ACTIVATION_TIMESTAMP'
    });
    
    if (response.status === 'success') {
      const timestamp = response.timestamp ? new Date(response.timestamp) : null;
      return {
        activated: !!timestamp,
        timestamp: timestamp,
        humanReadable: timestamp ? formatDate(timestamp.toISOString()) + ' ' + timestamp.toLocaleTimeString() : 'Belum aktif'
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting activation info:', error);
    return null;
  }
}

// Cek status notifikasi lengkap
async function checkNotificationStatus() {
  const info = await getNotificationActivationInfo();
  const settings = window.notificationSettings;
  
  if (!info || !info.activated) {
    return {
      enabled: false,
      message: 'Notifikasi belum diaktifkan'
    };
  }
  
  const now = new Date();
  const activatedTime = info.timestamp;
  const hoursSinceActivation = Math.round((now - activatedTime) / (1000 * 60 * 60));
  
  return {
    enabled: true,
    activatedAt: info.humanReadable,
    hoursActive: hoursSinceActivation,
    platforms: settings?.platforms?.length || 0,
    frequency: settings?.frequency || 'all',
    message: `Aktif sejak ${info.humanReadable} (${hoursSinceActivation} jam yang lalu)`
  };
}

// Update modal pengaturan notifikasi - tambah reset button
function updateNotificationSettingsModal() {
  const modalBody = document.querySelector('#notificationSettingsModal .modal-body');
  if (!modalBody) return;
  
  // Cari atau buat section info
  let infoSection = modalBody.querySelector('.notification-info-section');
  if (!infoSection) {
    infoSection = document.createElement('div');
    infoSection.className = 'notification-info-section mb-4';
    modalBody.insertBefore(infoSection, modalBody.firstChild);
  }
  
  // Update info secara berkala
  updateNotificationInfo();
  setInterval(updateNotificationInfo, 30000);
}

// Update info notifikasi
async function updateNotificationInfo() {
  const infoSection = document.querySelector('.notification-info-section');
  if (!infoSection) return;
  
  const status = await checkNotificationStatus();
  
  if (status.enabled) {
    infoSection.innerHTML = `
      <div class="alert alert-info">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <i class="bi bi-info-circle me-2"></i>
            <strong>Status Notifikasi:</strong><br>
            <small>${status.message}</small><br>
            <small>Platform: ${status.platforms} terpilih | Frekuensi: ${status.frequency === 'all' ? 'Semua game' : status.frequency === 'popular' ? 'Hanya populer' : 'Sekali sehari'}</small>
          </div>
          <button class="btn btn-sm btn-warning" onclick="resetNotifications()" title="Reset notifikasi">
            <i class="bi bi-arrow-counterclockwise"></i>
          </button>
        </div>
      </div>
    `;
  } else {
    infoSection.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-bell-slash me-2"></i>
        <strong>Notifikasi belum diaktifkan</strong><br>
        <small>Aktifkan notifikasi untuk mendapatkan pemberitahuan game baru</small>
      </div>
    `;
  }
}

// Update fungsi requestNotificationPermission untuk update timestamp
async function requestNotificationPermission() {
  const btn = document.getElementById('btnEnableNotifications');
  if (btn.dataset.loading === '1') return;
  
  setButtonLoading(btn, true, 'Meminta izin...');
  
  try {
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('Notification permission granted');
      
      // Aktifkan notifikasi
      window.notificationSettings = window.notificationSettings || {};
      window.notificationSettings.enabled = true;
      
      try {
        // Simpan pengaturan ke SW (akan trigger updateActivationTimestamp)
        await saveNotificationSettingsToSW();
        
        // Tunggu sebentar untuk pastikan SW update timestamp
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        showNotificationStatus('✅ Notifikasi berhasil diaktifkan! Hanya game baru dari sekarang yang akan muncul.', 'success');
        
        // Test notifikasi
        setTimeout(() => {
          sendTestNotification();
        }, 1500);
        
      } catch (swError) {
        // Fallback ke localStorage
        localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(window.notificationSettings));
        localStorage.setItem('indapk_activation_timestamp', new Date().toISOString());
        showNotificationStatus('✅ Notifikasi diaktifkan (mode fallback)', 'success');
      }
      
      // Tutup modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('notificationPermissionModal'));
      if (modal) modal.hide();
      
      // Update UI
      updateNotificationUI();
      updateNotificationInfo();
      
    } else {
      showNotificationStatus('❌ Izin notifikasi ditolak', 'warning');
    }
    
    // Simpan preferensi "jangan tampilkan lagi"
    const dontShowAgain = document.getElementById('dontShowAgainCheck').checked;
    if (dontShowAgain) {
      localStorage.setItem(NOTIFICATION_DONT_SHOW_KEY, 'true');
    }
    
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    handleNotificationError(error);
  } finally {
    setButtonLoading(btn, false);
  }
}
