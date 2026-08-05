/* ============================================================
   portal.js — public verification portal
   ============================================================ */

async function fetchAttendee(documentId) {
  try {
    const data = await api(`/api/lookup?document=${encodeURIComponent(documentId)}`);
    if (!data.found) return null;
    return { ...data.attendee, certificates: data.certificates };
  } catch (err) {
    console.error('[lookup failed]', err.message);
    return null;
  }
}

async function search(e) {
  e.preventDefault();
  const documentId = document.getElementById('cedula').value.trim().replace(/\D/g, '');
  const errorBox = document.getElementById('error');
  errorBox.classList.remove('show');
  if (!documentId) return;

  const btn = e.target.querySelector('button.primary');
  const btnText = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Consultando...'; }

  const attendee = await fetchAttendee(documentId);

  if (btn) { btn.disabled = false; btn.textContent = btnText; }

  if (!attendee) {
    errorBox.classList.add('show');
    return;
  }

  document.getElementById('pName').textContent = attendee.name;
  document.getElementById('pDoc').textContent = attendee.documentLabel;

  const rows = document.getElementById('certRows');
  rows.innerHTML = attendee.certificates.map(c => `
    <tr>
      <td class="curso">${escapeHtml(c.title)}</td>
      <td class="fecha">${escapeHtml(c.issueDate)}</td>
      <td class="fecha">${escapeHtml(c.expiresAt || '—')}</td>
      <td class="horas">${escapeHtml(c.hours)}</td>
      <td class="center">
        <a href="${c.pdf}" target="_blank" class="btn-cert" download title="Descargar certificado">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </a>
      </td>
    </tr>
  `).join('');

  const n = attendee.certificates.length;
  document.getElementById('totalMsg').textContent =
    `Mostrando registros del 1 al ${n} de un total de ${n} registro${n === 1 ? '' : 's'}`;

  document.getElementById('landing').style.display = 'none';
  document.getElementById('result').classList.add('show');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack() {
  document.getElementById('result').classList.remove('show');
  document.getElementById('landing').style.display = 'block';
  document.getElementById('cedula').value = '';
  document.getElementById('error').classList.remove('show');
  document.getElementById('cedula').focus();
}

function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme')
    || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
}

// Only digits in the input
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('cedula');
  if (input) {
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
    });
  }

  // Auto-load from QR: if URL has ?cc=XXXXXX (or ?document=), search automatically
  const params = new URLSearchParams(window.location.search);
  const cc = params.get('cc') || params.get('document');
  if (cc && /^\d+$/.test(cc)) {
    document.getElementById('cedula').value = cc;
    setTimeout(() => {
      document.querySelector('form.search').dispatchEvent(new Event('submit', { cancelable: true }));
    }, 100);
  }
});

window.search = search;
window.goBack = goBack;
window.toggleTheme = toggleTheme;
