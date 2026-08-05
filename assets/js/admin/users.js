/* ============================================================
   admin/users.js — admin user management
   ============================================================ */

async function loadUsers() {
  try {
    const { users } = await api('/api/admin/users');
    const tbody = document.getElementById('usuariosRows');
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--ink-mute);">Sin usuarios creados</td></tr>`;
      return;
    }
    // Build rows safely — data comes back to us via dataset (no inline onclick with string interpolation)
    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${escapeHtml(u.name)}</strong></td>
        <td class="mono">${escapeHtml(u.email)}</td>
        <td><span class="pill ${u.role === 'admin' ? 'pill-foca' : 'pill-viu'}">${escapeHtml(u.role)}</span></td>
        <td class="mono">${formatDateTime(u.last_login_at)}</td>
        <td>
          <button class="btn btn-sm btn-danger" data-action="delete-user" data-id="${u.id}" data-name="${escapeHtml(u.name)}">
            Desactivar
          </button>
        </td>
      </tr>
    `).join('');

    // Wire up delete buttons via event delegation — safe from XSS
    tbody.querySelectorAll('[data-action="delete-user"]').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteUser(parseInt(btn.dataset.id, 10), btn.dataset.name);
      });
    });
  } catch (e) {
    toast('Error cargando usuarios: ' + e.message, 'err');
  }
}

async function createUser(e) {
  e.preventDefault();
  const body = {
    name:     document.getElementById('userNombre').value.trim(),
    email:    document.getElementById('userEmail').value.trim().toLowerCase(),
    password: document.getElementById('userPassword').value,
    role:     document.getElementById('userRol').value,
  };
  try {
    await api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) });
    closeModal('modalUser');
    document.querySelector('#modalUser form').reset();
    await loadUsers();
    toast('Usuario creado ✓');
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function deleteUser(id, name) {
  if (!confirm(`¿Desactivar el usuario "${name}"? Ya no podrá iniciar sesión.`)) return;
  try {
    await api(`/api/admin/users?id=${id}`, { method: 'DELETE' });
    await loadUsers();
    toast('Usuario desactivado');
  } catch (err) {
    toast(err.message, 'err');
  }
}

window.loadUsers = loadUsers;
window.createUser = createUser;
window.deleteUser = deleteUser;
