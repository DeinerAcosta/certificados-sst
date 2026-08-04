/* ============================================================
   admin/history.js — history table + search / city filter
   ============================================================ */

let historyCache = [];

async function loadHistory() {
  try {
    const { certificates } = await api('/api/admin/certificates');
    historyCache = certificates || [];
    const cities = Array.from(new Set(historyCache.map(c => c.city).filter(Boolean))).sort();
    const cityFilter = document.getElementById('histCiudad');
    if (cityFilter) {
      cityFilter.innerHTML = '<option value="">Todas las ciudades</option>' +
        cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    }
    renderHistory(historyCache);
  } catch (e) {
    toast('Error cargando historial: ' + e.message, 'err');
  }
}

function renderHistory(rows) {
  const tbody = document.getElementById('historialRows');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--ink-mute);">No hay registros que coincidan con la búsqueda</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(c => `
    <tr>
      <td class="mono">${c.id}</td>
      <td>${formatDate(c.issue_date)}</td>
      <td>${escapeHtml(c.training_name)}</td>
      <td><strong>${escapeHtml(c.attendee_name)}</strong></td>
      <td class="mono">${escapeHtml(c.document_id)}</td>
      <td>${escapeHtml(c.city || '—')}</td>
      <td style="text-align:right;"><a href="${c.pdf_url}" target="_blank" class="btn btn-sm" style="text-decoration:none;">Ver PDF</a></td>
    </tr>
  `).join('');
}

function filterHistory() {
  const q = document.getElementById('histSearch').value.trim().toLowerCase();
  const city = document.getElementById('histCiudad').value;
  const filtered = historyCache.filter(c => {
    if (city && c.city !== city) return false;
    if (q) {
      const hit = (c.attendee_name || '').toLowerCase().includes(q)
               || (c.document_id || '').toLowerCase().includes(q)
               || (c.training_name || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
  renderHistory(filtered);
}

window.loadHistory = loadHistory;
window.filterHistory = filterHistory;
