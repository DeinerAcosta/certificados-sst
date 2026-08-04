/* ============================================================
   utils.js — small helpers
   Exposes: formatDate, formatDateTime, escapeHtml, toast
   ============================================================ */

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 1000;
    padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 500;
    background: ${kind === 'ok' ? 'var(--success)' : 'var(--danger)'};
    color: white; box-shadow: var(--shadow-lg);
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.escapeHtml = escapeHtml;
window.toast = toast;
