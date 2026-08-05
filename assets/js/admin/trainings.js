/* ============================================================
   admin/trainings.js — training CRUD + template upload (base64)
   ============================================================ */

let editingTrainingId = null;
let templateBuffer = { foca: null, viu: null };

// Cache the current list so click handlers can access typed training data without
// serializing it into HTML attributes (which is the XSS vector).
let trainingsCache = [];

async function loadTrainings() {
  try {
    const { trainings } = await api('/api/admin/trainings');
    trainingsCache = trainings;
    const grid = document.getElementById('capacitacionesGrid');
    const cards = trainings.map(t => {
      const badges = [];
      if (t.has_template_foca) badges.push('<span class="pill pill-foca" title="Plantilla FOCA cargada">📄 FOCA</span>');
      if (t.has_template_viu)  badges.push('<span class="pill pill-viu"  title="Plantilla VIU cargada">📄 VIU</span>');
      const badgesHTML = badges.length
        ? `<div style="display:flex; gap:6px; margin-top:6px;">${badges.join('')}</div>`
        : `<div style="font-size:11px; color:var(--warn); margin-top:6px;">⚠ Sin plantillas — click Editar para cargar</div>`;
      return `
        <div class="course-card">
          <div class="course-preview"><div class="doc-icon"></div></div>
          <div class="course-info">
            <h3 class="course-name">${escapeHtml(t.name)}</h3>
            <div class="course-meta">${escapeHtml(t.hours)} · ${t.issued_count} emitidos · <span class="pill pill-active" style="margin-left:4px;">${escapeHtml(t.company)}</span></div>
            ${badgesHTML}
          </div>
          <div class="course-actions">
            <span style="font-size:11px; color:var(--ink-mute);">Vigencia: ${t.validity_years} años</span>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-sm" data-action="edit-training" data-id="${t.id}">Editar</button>
              <button class="btn btn-sm btn-danger" data-action="delete-training" data-id="${t.id}">Borrar</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    const newBtn = `
      <div class="course-card" style="border-style: dashed; background: transparent; cursor:pointer;" data-action="new-training">
        <div class="course-preview" style="background: transparent;">
          <div style="font-size:40px; color: var(--ink-mute);">+</div>
        </div>
        <div class="course-info" style="text-align:center;">
          <h3 class="course-name" style="color: var(--ink-mute);">Nueva capacitación</h3>
          <div class="course-meta">Configurar</div>
        </div>
      </div>`;
    grid.innerHTML = cards + newBtn;

    // Wire up buttons — pull the object from the cache by id (no HTML string injection)
    grid.querySelectorAll('[data-action="edit-training"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = trainingsCache.find(x => x.id === parseInt(btn.dataset.id, 10));
        if (t) editTraining(t);
      });
    });
    grid.querySelectorAll('[data-action="delete-training"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = trainingsCache.find(x => x.id === parseInt(btn.dataset.id, 10));
        if (t) deleteTraining(t.id, t.name, t.issued_count);
      });
    });
    grid.querySelectorAll('[data-action="new-training"]').forEach(el => {
      el.addEventListener('click', () => openModal('modalCourse'));
    });
  } catch (e) {
    toast('Error cargando capacitaciones: ' + e.message, 'err');
  }
}

async function handleTemplateFile(e, company) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1024 * 1024) {
    toast('El archivo es muy grande (máx 1 MB). Comprimí el .docx.', 'err');
    e.target.value = '';
    return;
  }
  try {
    const b64 = await fileToBase64(file);
    templateBuffer[company] = { name: file.name, data: b64, size: file.size };
    const suffix = company === 'foca' ? 'Foca' : 'Viu';
    document.getElementById(`tpl${suffix}Name`).textContent = file.name;
    document.getElementById(`tpl${suffix}Meta`).textContent =
      `${(file.size / 1024).toFixed(1)} KB · lista para guardar`;
    document.getElementById(`tpl${suffix}Preview`).style.display = 'flex';
  } catch (err) {
    toast('Error leyendo el archivo: ' + err.message, 'err');
  }
}

function clearTemplate(company) {
  templateBuffer[company] = { name: '', data: '' };
  const suffix = company === 'foca' ? 'Foca' : 'Viu';
  document.getElementById(`tpl${suffix}Preview`).style.display = 'none';
  document.getElementById(`tpl${suffix}File`).value = '';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result;
      const idx = s.indexOf(',');
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    reader.onerror = () => reject(new Error('No se pudo leer'));
    reader.readAsDataURL(file);
  });
}

function resetTemplateBuffer() {
  templateBuffer = { foca: null, viu: null };
  document.getElementById('tplFocaPreview').style.display = 'none';
  document.getElementById('tplViuPreview').style.display = 'none';
  document.getElementById('tplFocaFile').value = '';
  document.getElementById('tplViuFile').value = '';
}

async function saveTraining(e) {
  e.preventDefault();
  const body = {
    name:           document.getElementById('capNombre').value.trim(),
    hours:          document.getElementById('capHoras').value.trim(),
    validity_years: parseInt(document.getElementById('capVigencia').value, 10) || 2,
    company:        document.getElementById('capEmpresa').value,
    category:       document.getElementById('capCategoria').value,
    description:    document.getElementById('capDescripcion').value.trim(),
  };
  if (templateBuffer.foca) {
    body.template_foca_name = templateBuffer.foca.name;
    body.template_foca_data = templateBuffer.foca.data;
  }
  if (templateBuffer.viu) {
    body.template_viu_name = templateBuffer.viu.name;
    body.template_viu_data = templateBuffer.viu.data;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    if (editingTrainingId) {
      await api(`/api/admin/trainings?id=${editingTrainingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('Capacitación actualizada ✓');
    } else {
      await api('/api/admin/trainings', { method: 'POST', body: JSON.stringify(body) });
      toast('Capacitación creada ✓');
    }
    closeModal('modalCourse');
    document.querySelector('#modalCourse form').reset();
    resetTemplateBuffer();
    editingTrainingId = null;
    document.querySelector('#modalCourse .modal-title').textContent = 'Nueva capacitación';
    await loadTrainings();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Crear capacitación'; }
  }
}

function editTraining(t) {
  editingTrainingId = t.id;
  document.querySelector('#modalCourse .modal-title').textContent = 'Editar capacitación';
  document.getElementById('capNombre').value = t.name || '';
  document.getElementById('capHoras').value = t.hours || '';
  document.getElementById('capVigencia').value = t.validity_years || 2;
  document.getElementById('capEmpresa').value = t.company || 'AMBAS';
  document.getElementById('capCategoria').value = t.category || 'SST';
  document.getElementById('capDescripcion').value = t.description || '';

  resetTemplateBuffer();
  if (t.has_template_foca) {
    document.getElementById('tplFocaName').textContent = t.template_foca_name || 'plantilla-foca.docx';
    document.getElementById('tplFocaMeta').textContent = 'Guardada · subí otra para reemplazar';
    document.getElementById('tplFocaPreview').style.display = 'flex';
  }
  if (t.has_template_viu) {
    document.getElementById('tplViuName').textContent = t.template_viu_name || 'plantilla-viu.docx';
    document.getElementById('tplViuMeta').textContent = 'Guardada · subí otra para reemplazar';
    document.getElementById('tplViuPreview').style.display = 'flex';
  }
  openModal('modalCourse');
}

async function deleteTraining(id, name, issuedCount) {
  const msg = issuedCount > 0
    ? `"${name}" tiene ${issuedCount} certificado(s) emitido(s). Se desactivará (no se borra para preservar historial). ¿Continuar?`
    : `¿Borrar "${name}"? Esta capacitación no tiene certificados emitidos.`;
  if (!confirm(msg)) return;
  try {
    const r = await api(`/api/admin/trainings?id=${id}`, { method: 'DELETE' });
    toast(r.action === 'deleted' ? 'Capacitación eliminada' : 'Capacitación desactivada');
    await loadTrainings();
  } catch (err) {
    toast(err.message, 'err');
  }
}

window.loadTrainings = loadTrainings;
window.handleTemplateFile = handleTemplateFile;
window.clearTemplate = clearTemplate;
window.saveTraining = saveTraining;
window.editTraining = editTraining;
window.deleteTraining = deleteTraining;
