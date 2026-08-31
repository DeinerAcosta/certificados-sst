/* ============================================================
   admin/history.js — history table + search / city filter + pagination
   ============================================================ */

let historyCache = [];
let historyFiltered = [];
let historyPage = 1;
const HISTORY_PAGE_SIZE = 10;

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
    historyFiltered = historyCache;
    historyPage = 1;
    renderHistoryPage();
  } catch (e) {
    toast('Error cargando historial: ' + e.message, 'err');
  }
}

function renderHistoryPage() {
  const tbody = document.getElementById('historialRows');
  const total = historyFiltered.length;

  if (!total) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--ink-mute);">No hay registros que coincidan con la búsqueda</td></tr>`;
    renderPagination(0, 0);
    return;
  }

  const totalPages = Math.ceil(total / HISTORY_PAGE_SIZE);
  if (historyPage > totalPages) historyPage = totalPages;
  if (historyPage < 1) historyPage = 1;

  const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
  const end = start + HISTORY_PAGE_SIZE;
  const pageRows = historyFiltered.slice(start, end);

  tbody.innerHTML = pageRows.map(c => `
    <tr>
      <td class="mono">${c.id}</td>
      <td>${formatDate(c.issue_date)}</td>
      <td>${escapeHtml(c.training_name)}</td>
      <td><strong>${escapeHtml(c.attendee_name)}</strong></td>
      <td class="mono">${escapeHtml(c.document_id)}</td>
      <td>${escapeHtml(c.city || '—')}</td>
      <td style="text-align:right;">
        <button class="btn btn-sm" data-action="view-pdf" data-url="${escapeHtml(c.pdf_url)}">Ver PDF</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action="view-pdf"]').forEach(btn => {
    btn.addEventListener('click', () => openPdfSafe(btn.dataset.url));
  });

  renderPagination(total, totalPages);
}

function renderPagination(total, totalPages) {
  let bar = document.getElementById('historyPagination');
  if (!bar) {
    const table = document.querySelector('#page-historial .card');
    bar = document.createElement('div');
    bar.id = 'historyPagination';
    bar.className = 'pagination-bar';
    table.appendChild(bar);
  }
  if (!total) { bar.innerHTML = ''; return; }

  const start = (historyPage - 1) * HISTORY_PAGE_SIZE + 1;
  const end = Math.min(historyPage * HISTORY_PAGE_SIZE, total);

  const pageBtns = [];
  const maxPageBtns = 7;
  let from = Math.max(1, historyPage - 3);
  let to = Math.min(totalPages, from + maxPageBtns - 1);
  from = Math.max(1, to - maxPageBtns + 1);

  for (let p = from; p <= to; p++) {
    pageBtns.push(`<button class="page-num ${p === historyPage ? 'active' : ''}" data-page="${p}">${p}</button>`);
  }

  bar.innerHTML = `
    <span class="page-info">Mostrando ${start}–${end} de ${total} registros</span>
    <div class="page-controls">
      <button class="page-nav" data-page="prev" ${historyPage === 1 ? 'disabled' : ''}>← Anterior</button>
      ${pageBtns.join('')}
      <button class="page-nav" data-page="next" ${historyPage === totalPages ? 'disabled' : ''}>Siguiente →</button>
    </div>
  `;

  bar.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.page;
      if (p === 'prev') historyPage--;
      else if (p === 'next') historyPage++;
      else historyPage = parseInt(p, 10);
      renderHistoryPage();
    });
  });
}

function filterHistory() {
  const q = document.getElementById('histSearch').value.trim().toLowerCase();
  const city = document.getElementById('histCiudad').value;
  historyFiltered = historyCache.filter(c => {
    if (city && c.city !== city) return false;
    if (q) {
      const hit = (c.attendee_name || '').toLowerCase().includes(q)
               || (c.document_id || '').toLowerCase().includes(q)
               || (c.training_name || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
  historyPage = 1;
  renderHistoryPage();
}

/** Verifies the PDF exists before opening it — shows a friendly toast
 *  when the file has not been generated yet (issuance creates DB records
 *  but PDFs are produced by the local Python batch script). */
async function openPdfSafe(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (r.ok) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (r.status === 404) {
      toast('El PDF aún no ha sido generado. Corré el script Python para generarlo.', 'err');
    } else {
      toast(`No se pudo abrir el PDF (${r.status})`, 'err');
    }
  } catch (e) {
    toast('Error de red al verificar el PDF', 'err');
  }
}

window.loadHistory = loadHistory;
window.filterHistory = filterHistory;
window.openPdfSafe = openPdfSafe;
