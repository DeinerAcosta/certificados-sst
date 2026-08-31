/* ============================================================
   utils.js — small helpers
   Exposes: formatDate, formatDateTime, escapeHtml, toast
   ============================================================ */

/** Formats a calendar date (an issue or expiry date — not an instant).
 *
 *  These arrive as 'YYYY-MM-DD' or as a UTC-midnight ISO string, and both parse
 *  to midnight UTC. Rendering that in local time moves it to the previous day
 *  anywhere west of Greenwich: in Colombia (UTC-5) a certificate issued on
 *  2026-01-02 showed as 01/01/2026, disagreeing with its own PDF. Parsing and
 *  formatting are pinned to UTC so the calendar date survives the round trip. */
function formatDate(iso) {
  if (!iso) return '—';
  const value = (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso))
    ? `${iso}T00:00:00Z`
    : iso;
  const d = new Date(value);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  });
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
