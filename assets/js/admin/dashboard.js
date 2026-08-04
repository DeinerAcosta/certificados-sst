/* ============================================================
   admin/dashboard.js — stats + recent activity
   ============================================================ */

async function loadDashboard() {
  try {
    const s = await api('/api/admin/stats');
    document.getElementById('statPersonas').textContent = s.totals.attendees;
    document.getElementById('statCertificados').textContent = s.totals.certificates;
    document.getElementById('statCertificadosDelta').textContent =
      s.totals.last_month > 0
        ? `+${s.totals.last_month} en los últimos 30 días`
        : 'Total histórico';
    document.getElementById('statCapacitaciones').textContent = s.totals.trainings;
    document.getElementById('statCursosNombres').textContent =
      s.active_trainings.length ? s.active_trainings.slice(0, 3).join(' · ') : 'Ninguna creada aún';
    document.getElementById('statUsuarios').textContent = s.totals.users;

    const tbody = document.getElementById('actividadRows');
    if (!s.recent_activity.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--ink-mute);">Sin actividad todavía</td></tr>`;
    } else {
      tbody.innerHTML = s.recent_activity.map(a => `
        <tr>
          <td class="mono">${formatDateTime(a.at)}</td>
          <td>${escapeHtml(a.action)}</td>
          <td>${escapeHtml(a.detail)}</td>
          <td>${escapeHtml(a.by_user)}</td>
        </tr>
      `).join('');
    }
  } catch (e) {
    toast('Error cargando dashboard: ' + e.message, 'err');
  }
}

window.loadDashboard = loadDashboard;
