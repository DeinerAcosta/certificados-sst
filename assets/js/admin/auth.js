/* ============================================================
   admin/auth.js — login / logout / session check
   ============================================================ */

async function login(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const errBox = document.getElementById('loginError');
  const errMsg = document.getElementById('loginErrorMsg');

  errBox.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    await enterAdminPanel();
  } catch (err) {
    errMsg.textContent = err.message;
    errBox.style.display = 'flex';
    btn.disabled = false;
    btn.textContent = 'Ingresar al panel';
    document.getElementById('loginPassword').select();
  }
}

async function enterAdminPanel() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').classList.add('show');
  await loadDashboard();
}

async function checkAuth() {
  try {
    const data = await api('/api/auth/me');
    if (data.authenticated) await enterAdminPanel();
  } catch { /* stay on login */ }
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  location.reload();
}

window.login = login;
window.enterAdminPanel = enterAdminPanel;
window.checkAuth = checkAuth;
window.logout = logout;
