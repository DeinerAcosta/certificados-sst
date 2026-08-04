/* ============================================================
   admin/main.js — entry point: navigation + modal utilities
   Runs after all other admin modules are loaded.
   ============================================================ */

// --- Navigation between pages ---
document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageId = 'page-' + btn.dataset.page;
    document.getElementById(pageId)?.classList.add('active');

    const loaders = {
      'page-dashboard':      loadDashboard,
      'page-usuarios':       loadUsers,
      'page-capacitaciones': loadTrainings,
      'page-emitir':         loadIssueForm,
      'page-historial':      loadHistory,
      'page-config':         loadSettings,
    };
    if (loaders[pageId]) await loaders[pageId]();
  });
});

// --- Modal open / close ---
function openModal(id)  { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('.modal-bg').forEach(m => {
  m.addEventListener('click', (e) => {
    if (e.target === m) m.classList.remove('show');
  });
});

window.openModal = openModal;
window.closeModal = closeModal;

// --- Check auth on page load ---
checkAuth();
