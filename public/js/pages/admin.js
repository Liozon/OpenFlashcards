// pages/admin.js
'use strict';

async function renderAdmin(el) {
  if (App.user.role !== 'admin') {
    el.innerHTML = '<div class="card"><p>Access denied.</p></div>';
    return;
  }

  // Detect browser language for login screen before user logs in
  const browserLang = (navigator.language || navigator.userLanguage || 'en').split('-')[0];
  await window.setUiLang(browserLang);
  applyLoginLabels();

  el.innerHTML = `
    <div class="page-title">🔑 ${t('admin_title')}</div>
    <div class="card" style="margin-bottom:20px">
      <h2 style="font-size:1rem;font-weight:800;margin-bottom:16px">➕ ${t('admin_create')}</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px" id="createUserForm">
        <div class="field-group" style="margin:0">
          <label>${t('admin_username')}</label>
          <input type="text" id="nuUsername" autocomplete="off">
        </div>
        <div class="field-group" style="margin:0">
          <label>${t('admin_password')}</label>
          <input type="password" id="nuPassword" autocomplete="new-password">
        </div>
        <div class="field-group" style="margin:0">
          <label>${t('admin_role')}</label>
          <select id="nuRole">
            <option value="user">${t('admin_role_user')}</option>
            <option value="admin">${t('admin_role_admin')}</option>
          </select>
        </div>
        <div style="display:flex;align-items:flex-end">
          <button class="btn btn-primary btn-full" onclick="createUser()">${t('admin_create_btn')}</button>
        </div>
      </div>
      <div id="nuErr" class="alert alert-danger hidden" style="margin-top:12px"></div>
      <div id="nuOk"  class="alert alert-success hidden" style="margin-top:12px"></div>
    </div>

    <div class="card">
      <h2 style="font-size:1rem;font-weight:800;margin-bottom:16px">👥 ${t('admin_users')}</h2>
      <div id="userTableWrap"><div class="loading-state"><div class="spinner"></div></div></div>
    </div>`;

  loadUserTable();
}

async function loadUserTable() {
  const wrap = document.getElementById('userTableWrap');
  if (!wrap) return;
  try {
    const users = await api('GET', '/admin/users');
    if (!users.length) {
      wrap.innerHTML = '<p style="color:var(--text-muted)">No users.</p>';
      return;
    }
    wrap.innerHTML = `
      <div style="overflow-x:auto">
        <table class="user-table">
          <thead><tr>
            <th>${t('admin_col_user')}</th>
            <th>${t('admin_col_role')}</th>
            <th>${t('admin_col_created')}</th>
            <th>${t('admin_col_actions')}</th>
          </tr></thead>
          <tbody>
            ${users.map(u => `
              <tr id="urow-${u.id}">
                <td><strong>${esc(u.username)}</strong></td>
                <td><span class="role-badge role-${u.role}">${u.role}</span></td>
                <td style="color:var(--text-faint);font-size:.82rem">${new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-sm btn-secondary" onclick="resetPassword('${u.id}','${esc(u.username)}')">🔑 ${t('admin_reset_pw')}</button>
                    ${u.id !== App.user.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser('${u.id}','${esc(u.username)}')">🗑</button>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    wrap.innerHTML = `<p style="color:var(--danger)">${e.error || 'Failed to load users.'}</p>`;
  }
}

window.createUser = async function () {
  const username = document.getElementById('nuUsername').value.trim();
  const password = document.getElementById('nuPassword').value;
  const role = document.getElementById('nuRole').value;
  const errEl = document.getElementById('nuErr');
  const okEl = document.getElementById('nuOk');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  if (!username || !password) {
    errEl.textContent = 'Username and password required.';
    errEl.classList.remove('hidden');
    return;
  }
  try {
    await api('POST', '/admin/users', { username, password, role });
    okEl.textContent = `✓ "${username}" ${t('admin_created_ok')}`;
    okEl.classList.remove('hidden');
    document.getElementById('nuUsername').value = '';
    document.getElementById('nuPassword').value = '';
    setTimeout(() => okEl.classList.add('hidden'), 8000);
    loadUserTable();
  } catch (e) {
    errEl.textContent = e.error || 'Failed to create user.';
    errEl.classList.remove('hidden');
  }
};

window.resetPassword = function (id, username) {
  openModal(`Reset password – ${username}`, `
    <div class="field-group">
      <label>New password</label>
      <input type="password" id="rpNew" autocomplete="new-password">
    </div>
    <div id="rpErr" class="alert alert-danger hidden"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="submitResetPw('${id}')">Reset</button>`
  );
};

window.submitResetPw = async function (id) {
  const pw = document.getElementById('rpNew').value;
  const errEl = document.getElementById('rpErr');
  errEl.classList.add('hidden');
  if (!pw || pw.length < 4) {
    errEl.textContent = 'Password must be at least 4 characters.';
    errEl.classList.remove('hidden');
    return;
  }
  try {
    await api('PUT', `/admin/users/${id}`, { password: pw });
    closeModal();
    toast(`✓ ${t('admin_reset_ok')}`);
  } catch (e) {
    errEl.textContent = e.error || 'Failed.';
    errEl.classList.remove('hidden');
  }
};

window.deleteUser = async function (id, username) {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/admin/users/${id}`);
    document.getElementById(`urow-${id}`)?.remove();
    toast(`🗑 ${t('admin_deleted')}`);
  } catch (e) { toast(e.error || 'Failed.', 'danger'); }
};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
