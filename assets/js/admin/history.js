/* ============================================================
   admin/history.js — history table: search, city filter, pagination,
   per-row download and bulk ZIP download.

   PDFs are rendered on demand by /api/certificate/:id, so every row in the
   table is downloadable — there is no longer such a thing as a certificate
   whose file "has not been generated yet".
   ============================================================ */

let historyCache = [];
let historyFiltered = [];
let historyPage = 1;
const HISTORY_PAGE_SIZE = 10;

/** Certificate ids ticked by the user. Survives paging and re-filtering. */
const historySelection = new Set();

/** Parallel fetches while zipping. Enough to be quick, low enough that a
 *  few hundred certificates do not hammer the function concurrency limit. */
const DOWNLOAD_CONCURRENCY = 5;

let activeDownload = null;

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
    historySelection.clear();
    renderHistoryPage();
  } catch (e) {
    toast('Error cargando historial: ' + e.message, 'err');
  }
}

function currentPageRows() {
  const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
  return historyFiltered.slice(start, start + HISTORY_PAGE_SIZE);
}

/** Ticked rows, resolved against everything loaded rather than the current
 *  filter — a row stays selected, and acted on, after the filter changes. */
function selectedRows() {
  return historyCache.filter(c => historySelection.has(c.id));
}

function renderHistoryPage() {
  const tbody = document.getElementById('historialRows');
  const total = historyFiltered.length;

  if (!total) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--ink-mute);">No hay registros que coincidan con la búsqueda</td></tr>`;
    renderPagination(0, 0);
    renderHistoryActions();
    return;
  }

  const totalPages = Math.ceil(total / HISTORY_PAGE_SIZE);
  if (historyPage > totalPages) historyPage = totalPages;
  if (historyPage < 1) historyPage = 1;

  tbody.innerHTML = currentPageRows().map(c => `
    <tr>
      <td><input type="checkbox" class="row-check" data-id="${c.id}" ${historySelection.has(c.id) ? 'checked' : ''} aria-label="Seleccionar certificado ${c.id}" /></td>
      <td class="mono">${c.id}</td>
      <td>${formatDate(c.issue_date)}</td>
      <td>${escapeHtml(c.training_name)}</td>
      <td><strong>${escapeHtml(c.attendee_name)}</strong></td>
      <td class="mono">${escapeHtml(c.document_id)}</td>
      <td>${escapeHtml(c.city || '—')}</td>
      <td style="text-align:right; white-space:nowrap;">
        <button class="btn btn-sm" data-action="view" data-id="${c.id}">Ver</button>
        <button class="btn btn-sm" data-action="download" data-id="${c.id}">Descargar</button>
        <button class="btn btn-sm btn-danger" data-action="delete" data-id="${c.id}">Eliminar</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.open(`/api/certificate/${btn.dataset.id}`, '_blank', 'noopener,noreferrer');
    });
  });
  tbody.querySelectorAll('[data-action="download"]').forEach(btn => {
    btn.addEventListener('click', () => downloadOne(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteOne(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll('.row-check').forEach(box => {
    box.addEventListener('change', () => {
      const id = Number(box.dataset.id);
      if (box.checked) historySelection.add(id); else historySelection.delete(id);
      syncSelectAll();
      renderHistoryActions();
    });
  });

  syncSelectAll();
  renderPagination(total, totalPages);
  renderHistoryActions();
}

/** Header checkbox reflects the current page: checked when every visible row
 *  is selected, indeterminate when only some are. */
function syncSelectAll() {
  const master = document.getElementById('histSelectAll');
  if (!master) return;
  const rows = currentPageRows();
  const picked = rows.filter(c => historySelection.has(c.id)).length;
  master.checked = rows.length > 0 && picked === rows.length;
  master.indeterminate = picked > 0 && picked < rows.length;
}

function toggleSelectAllPage(checked) {
  for (const c of currentPageRows()) {
    if (checked) historySelection.add(c.id); else historySelection.delete(c.id);
  }
  renderHistoryPage();
}

function renderHistoryActions() {
  const bar = document.getElementById('historyActions');
  if (!bar) return;

  const total = historyFiltered.length;
  const pageCount = currentPageRows().length;
  const picked = historySelection.size;
  const filtered = total !== historyCache.length;

  bar.innerHTML = `
    <span class="page-info">
      ${picked ? `<strong>${picked}</strong> seleccionado${picked === 1 ? '' : 's'}` : `${total} certificado${total === 1 ? '' : 's'}${filtered ? ' (filtrados)' : ''}`}
    </span>
    <div class="page-controls">
      ${picked ? `<button class="btn btn-sm" data-bulk="clear">Quitar selección</button>` : ''}
      ${picked ? `<button class="btn btn-sm btn-primary" data-bulk="selected">Descargar selección (${picked})</button>` : ''}
      <button class="btn btn-sm" data-bulk="page" ${pageCount ? '' : 'disabled'}>Descargar página (${pageCount})</button>
      <button class="btn btn-sm" data-bulk="all" ${total ? '' : 'disabled'}>Descargar todo (${total})</button>
      ${picked ? `<button class="btn btn-sm btn-danger" data-bulk="delete">Eliminar selección (${picked})</button>` : ''}
    </div>
  `;

  bar.querySelector('[data-bulk="clear"]')?.addEventListener('click', () => {
    historySelection.clear();
    renderHistoryPage();
  });
  bar.querySelector('[data-bulk="selected"]')?.addEventListener('click', () => {
    downloadZip(selectedRows(), 'seleccion');
  });
  bar.querySelector('[data-bulk="page"]')?.addEventListener('click', () => {
    downloadZip(currentPageRows(), `pagina-${historyPage}`);
  });
  bar.querySelector('[data-bulk="all"]')?.addEventListener('click', () => {
    downloadZip(historyFiltered, 'certificados');
  });
  bar.querySelector('[data-bulk="delete"]')?.addEventListener('click', () => {
    deleteSelected();
  });
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

// -------------------------------------------------------------- downloads --

/** Strip accents and punctuation so the name is safe on every filesystem. */
function safeName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

function certFilename(c) {
  const parts = [c.document_id, safeName(c.attendee_name), safeName(c.training_name)]
    .filter(Boolean);
  return `${parts.join(' - ')}.pdf`;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function downloadOne(id) {
  const cert = historyCache.find(c => c.id === id);
  try {
    const r = await fetch(`/api/certificate/${id}?download=1`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    saveBlob(await r.blob(), cert ? certFilename(cert) : `certificado-${id}.pdf`);
  } catch (e) {
    toast('No se pudo descargar el certificado: ' + e.message, 'err');
  }
}

/**
 * Fetch every certificate in `rows` and hand the user one ZIP.
 *
 * Zipping in the browser rather than on the server is deliberate: rendering a
 * few hundred PDFs inside one request would blow the serverless time limit,
 * and this way the user sees progress and can cancel.
 */
async function downloadZip(rows, label) {
  if (activeDownload) { toast('Ya hay una descarga en curso', 'err'); return; }
  if (!rows.length) { toast('No hay certificados para descargar', 'err'); return; }

  const controller = new AbortController();
  activeDownload = controller;
  const progress = showProgress(rows.length, () => controller.abort());

  const folder = `certificados-${label}-${new Date().toISOString().slice(0, 10)}`;
  const entries = new Array(rows.length);
  const used = new Set();
  const failures = [];
  let done = 0;
  let cursor = 0;

  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= rows.length) return;
      const cert = rows[index];
      try {
        const r = await fetch(`/api/certificate/${cert.id}?download=1`, { signal: controller.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        entries[index] = {
          name: `${folder}/${certFilename(cert)}`,
          data: new Uint8Array(await r.arrayBuffer()),
        };
      } catch (e) {
        if (e.name === 'AbortError') return;
        failures.push(`${cert.document_id} (${e.message})`);
      }
      progress.update(++done);
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, rows.length) }, worker)
    );

    if (controller.signal.aborted) { toast('Descarga cancelada', 'err'); return; }

    // Same person + same course twice would collide; keep both.
    const packed = entries.filter(Boolean).map(entry => {
      let name = entry.name;
      for (let n = 2; used.has(name); n++) name = entry.name.replace(/\.pdf$/, ` (${n}).pdf`);
      used.add(name);
      return { name, data: entry.data };
    });

    if (!packed.length) { toast('No se pudo descargar ningún certificado', 'err'); return; }

    saveBlob(buildZip(packed), `${folder}.zip`);
    if (failures.length) {
      toast(`${packed.length} descargados · ${failures.length} fallaron`, 'err');
      console.warn('[certificados] fallaron:', failures);
    } else {
      toast(`${packed.length} certificado${packed.length === 1 ? '' : 's'} descargado${packed.length === 1 ? '' : 's'}`);
    }
  } finally {
    progress.close();
    activeDownload = null;
  }
}

// --------------------------------------------------------------- deleting --

/** Certificates deleted in one request. Matches MAX_BATCH in the API. */
const DELETE_BATCH = 500;

/** Reports what the server actually removed and refreshes the table. */
async function applyDelete(ids) {
  const batches = [];
  for (let i = 0; i < ids.length; i += DELETE_BATCH) {
    batches.push(ids.slice(i, i + DELETE_BATCH));
  }

  let certs = 0;
  let people = 0;
  try {
    for (const batch of batches) {
      const r = await api('/api/admin/certificates', {
        method: 'DELETE',
        body: JSON.stringify({ ids: batch }),
      });
      certs += r.deleted_certificates || 0;
      people += r.deleted_attendees || 0;
    }
  } catch (e) {
    toast('Error al eliminar: ' + e.message, 'err');
    await loadHistory();
    return;
  }

  const peopleNote = people
    ? ` · ${people} persona${people === 1 ? '' : 's'} sin certificados eliminada${people === 1 ? '' : 's'}`
    : '';
  toast(`${certs} certificado${certs === 1 ? '' : 's'} eliminado${certs === 1 ? '' : 's'}${peopleNote}`);
  await loadHistory();
}

async function deleteOne(id) {
  const cert = historyCache.find(c => c.id === id);
  const who = cert ? `${cert.attendee_name} (${cert.document_id})` : `#${id}`;
  const what = cert ? `\nCurso: ${cert.training_name} · ${cert.city || 'sin ciudad'}` : '';
  const ok = confirm(
    `¿Eliminar el certificado de ${who}?${what}\n\n`
    + 'Si la persona no queda con ningún otro certificado, también se elimina '
    + 'del sistema.\n\nEsta acción no se puede deshacer.'
  );
  if (!ok) return;
  historySelection.delete(id);
  await applyDelete([id]);
}

/**
 * Bulk delete. Typing the exact count is deliberate friction: the selection
 * can span pages and reach several hundred rows, and there is no undo.
 */
async function deleteSelected() {
  const rows = selectedRows();
  if (!rows.length) { toast('No hay certificados seleccionados', 'err'); return; }

  const cities = Array.from(new Set(rows.map(c => c.city).filter(Boolean)));
  const scope = cities.length === 1 ? ` de ${cities[0]}` : '';

  const answer = prompt(
    `Vas a eliminar ${rows.length} certificado${rows.length === 1 ? '' : 's'}${scope}.\n\n`
    + 'Las personas que queden sin ningún certificado también se eliminarán.\n'
    + 'Esta acción no se puede deshacer.\n\n'
    + `Escribí ${rows.length} para confirmar:`
  );
  if (answer === null) return;
  if (answer.trim() !== String(rows.length)) {
    toast('Cancelado: el número no coincide', 'err');
    return;
  }

  const ids = rows.map(c => c.id);
  ids.forEach(id => historySelection.delete(id));
  await applyDelete(ids);
}

/** Fixed progress card with a cancel button; returns update/close handles. */
function showProgress(total, onCancel) {
  const el = document.createElement('div');
  el.className = 'download-progress';
  el.innerHTML = `
    <div class="download-progress-head">
      <strong>Preparando ZIP…</strong>
      <button type="button" class="btn btn-sm" data-cancel>Cancelar</button>
    </div>
    <div class="download-progress-track"><div class="download-progress-fill"></div></div>
    <span class="download-progress-count">0 de ${total}</span>
  `;
  el.querySelector('[data-cancel]').addEventListener('click', onCancel);
  document.body.appendChild(el);

  const fill = el.querySelector('.download-progress-fill');
  const count = el.querySelector('.download-progress-count');
  return {
    update(done) {
      fill.style.width = `${Math.round((done / total) * 100)}%`;
      count.textContent = `${done} de ${total}`;
    },
    close() { el.remove(); },
  };
}

window.loadHistory = loadHistory;
window.filterHistory = filterHistory;
window.toggleSelectAllPage = toggleSelectAllPage;
