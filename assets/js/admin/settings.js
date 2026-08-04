/* ============================================================
   admin/settings.js — read + save system settings
   ============================================================ */

async function loadSettings() {
  try {
    const cfg = await api('/api/admin/settings');
    document.getElementById('cfgPortalUrl').value = cfg.portal_url || '';
    document.getElementById('cfgQrBase').value = cfg.qr_base_url || '';
  } catch (e) {
    toast('Error cargando configuración: ' + e.message, 'err');
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const body = {
    portal_url:  document.getElementById('cfgPortalUrl').value.trim(),
    qr_base_url: document.getElementById('cfgQrBase').value.trim(),
  };
  try {
    await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(body) });
    toast('Configuración guardada ✓');
  } catch (err) {
    toast(err.message, 'err');
  }
}

window.loadSettings = loadSettings;
window.saveSettings = saveSettings;
