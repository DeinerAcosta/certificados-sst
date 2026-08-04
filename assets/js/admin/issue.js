/* ============================================================
   admin/issue.js — bulk issuance of certificates (Excel + form)
   ============================================================ */

async function loadIssueForm() {
  try {
    const [trainingsData, statsData] = await Promise.all([
      api('/api/admin/trainings'),
      api('/api/admin/stats').catch(() => ({ cities: [] })),
    ]);

    const sel = document.getElementById('emitCap');
    sel.innerHTML = '<option value="">Seleccione una capacitación</option>' +
      trainingsData.trainings.filter(t => t.active).map(t =>
        `<option value="${t.id}">${escapeHtml(t.name)} · ${escapeHtml(t.hours)}</option>`
      ).join('');

    const dl = document.getElementById('ciudadesList');
    if (dl) {
      dl.innerHTML = (statsData.cities || []).map(c => `<option value="${escapeHtml(c)}">`).join('');
    }

    if (!document.getElementById('emitFecha').value) {
      document.getElementById('emitFecha').value = new Date().toISOString().slice(0, 10);
    }

    const ta = document.getElementById('emitAsistentes');
    if (ta && !ta.value) updateAttendeeCount();
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
}

function updateAttendeeCount() {
  const ta = document.getElementById('emitAsistentes');
  if (!ta) return;
  const n = ta.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).length;
  const hidden = document.getElementById('emitAsistentesHidden');
  if (hidden) hidden.value = ta.value;
  const badge = document.getElementById('emitCount');
  if (badge) {
    if (n > 0) {
      badge.textContent = `${n} ${n === 1 ? 'cargado' : 'cargados'}`;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
  const summary = document.getElementById('asistentesSummary');
  if (summary) {
    summary.textContent = n > 0
      ? `✓ ${n} ${n === 1 ? 'persona lista para certificar' : 'personas listas para certificar'}`
      : 'Sin asistentes cargados';
  }
  const preview = document.getElementById('asistentesPreview');
  if (preview) preview.style.display = n > 0 ? 'block' : 'none';
}

function toggleManualEdit() {
  const ed = document.getElementById('manualEditor');
  const btn = document.getElementById('toggleEditText');
  const isOpen = ed.style.display === 'block';
  ed.style.display = isOpen ? 'none' : 'block';
  btn.textContent = isOpen ? 'Editar manualmente' : 'Ocultar editor';
}

function normalizeKey(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

function detectColumns(headers) {
  const aliases = {
    documentId: ['cedula', 'documento', 'numerodocumento', 'nrodocumento', 'noidentificacion', 'identificacion', 'cc', 'dni', 'documentid'],
    name:       ['nombre', 'nombres', 'nombrecompleto', 'apellidosnombres', 'apellidosynombres', 'nombreyapellido', 'name'],
    role:       ['cargo', 'puesto', 'rol', 'ocupacion', 'profesion', 'role'],
    company:    ['empresa', 'compania', 'razonsocial', 'entidad', 'company'],
  };
  const map = {};
  headers.forEach((h, i) => {
    const k = normalizeKey(h);
    for (const [field, list] of Object.entries(aliases)) {
      if (list.includes(k) && !(field in map)) map[field] = i;
    }
  });
  return map;
}

async function loadAttendeesFromExcel(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    return toast('Librería Excel no cargó, revisá tu conexión', 'err');
  }

  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rows.length < 2) return toast('El Excel está vacío o solo tiene encabezados', 'err');

    const headers = rows[0].map(h => String(h || '').trim());
    const map = detectColumns(headers);

    if (!('documentId' in map) || !('name' in map)) {
      return toast('No encontré columnas de "Cédula" y "Nombre". Revisá los encabezados.', 'err');
    }

    const lines = [];
    let skipped = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const documentId = String(r[map.documentId] ?? '').replace(/\D/g, '');
      const name = String(r[map.name] ?? '').trim();
      const role = map.role !== undefined ? String(r[map.role] ?? '').trim() : '';
      let company = map.company !== undefined ? String(r[map.company] ?? '').trim().toUpperCase() : 'FOCA';
      if (!['FOCA', 'VIU'].includes(company)) company = 'FOCA';
      if (!documentId || !name) { skipped++; continue; }
      lines.push(`${documentId}, ${name}, ${role}, ${company}`);
    }

    document.getElementById('emitAsistentes').value = lines.join('\n');
    updateAttendeeCount();

    toast(`${lines.length} asistentes cargados del Excel${skipped > 0 ? ` (${skipped} filas omitidas)` : ''} ✓`);
    e.target.value = '';
  } catch (err) {
    toast('Error leyendo Excel: ' + err.message, 'err');
  }
}

async function issueCertificates(e) {
  e.preventDefault();
  const trainingId = parseInt(document.getElementById('emitCap').value, 10);
  const city = document.getElementById('emitCiudad').value;
  const issueDate = document.getElementById('emitFecha').value;
  const expiresAt = document.getElementById('emitVence').value || null;
  const raw = document.getElementById('emitAsistentes').value.trim();

  if (!trainingId) return toast('Seleccione una capacitación', 'err');
  if (!city) return toast('Ingrese la ciudad', 'err');
  if (!issueDate) return toast('Seleccione la fecha de realización', 'err');
  if (!raw) return toast('Cargue la lista de asistentes', 'err');

  const attendees = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split(',').map(p => p.trim());
    return {
      document_id: parts[0] || '',
      name:        parts[1] || '',
      role:        parts[2] || '',
      company:     (parts[3] || 'FOCA').toUpperCase(),
    };
  });

  const btn = document.getElementById('emitBtn');
  btn.disabled = true;
  btn.textContent = 'Emitiendo…';
  const result = document.getElementById('emitResult');
  result.style.display = 'none';

  try {
    const res = await api('/api/admin/issue', {
      method: 'POST',
      body: JSON.stringify({
        training_id: trainingId,
        city,
        issue_date: issueDate,
        expires_at: expiresAt,
        attendees,
      }),
    });

    result.innerHTML = `
      <div style="padding:16px 20px; background:var(--success-bg); border:1px solid color-mix(in srgb, var(--success) 30%, transparent); border-radius:6px;">
        <div style="font-size:16px; font-weight:600; color:var(--success); margin-bottom:8px;">
          ✓ Emisión completada
        </div>
        <div style="font-size:14px; color:var(--ink);">
          <div><strong>${res.issued_certificates}</strong> certificados emitidos</div>
          ${res.by_company ? `
            <div style="display:flex; gap:16px; margin:6px 0; font-size:13px;">
              ${res.by_company.FOCA > 0 ? `<span class="pill pill-foca">FOCA: ${res.by_company.FOCA}</span>` : ''}
              ${res.by_company.VIU  > 0 ? `<span class="pill pill-viu">VIU: ${res.by_company.VIU}</span>` : ''}
            </div>
          ` : ''}
          <div><strong>${res.created_attendees}</strong> personas nuevas creadas</div>
          ${res.skipped > 0 ? `<div style="color:var(--warn);"><strong>${res.skipped}</strong> omitidos (ver detalles)</div>` : ''}
        </div>
        ${res.errors.length ? `
          <details style="margin-top:12px;">
            <summary style="cursor:pointer; font-size:13px; color:var(--ink-soft);">Ver detalles de omitidos</summary>
            <ul style="margin:8px 0 0; padding-left:20px; font-size:12.5px;">
              ${res.errors.map(x => `<li><code>${escapeHtml(x.document_id)}</code>: ${escapeHtml(x.reason)}</li>`).join('')}
            </ul>
          </details>
        ` : ''}
      </div>
    `;
    result.style.display = 'block';
    document.getElementById('emitAsistentes').value = '';
    toast(`${res.issued_certificates} certificados emitidos`);
  } catch (err) {
    toast('Error: ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Emitir certificados';
  }
}

window.loadIssueForm = loadIssueForm;
window.updateAttendeeCount = updateAttendeeCount;
window.toggleManualEdit = toggleManualEdit;
window.loadAttendeesFromExcel = loadAttendeesFromExcel;
window.issueCertificates = issueCertificates;
