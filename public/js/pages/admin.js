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
          <button class="btn btn-primary btn-full" onclick="createUser()">${t('admin_create_btn')} →</button>
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
            <th>${t('admin_tts_cache_default')}</th>
            <th>${t('admin_col_actions')}</th>
          </tr></thead>
          <tbody>
            ${users.map(u => `
              <tr id="urow-${u.id}">
                <td><strong>${esc(u.username)}</strong></td>
                <td><span class="role-badge role-${u.role}">${u.role}</span></td>
                <td style="color:var(--text-faint);font-size:.82rem">${new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <label class="admin-toggle" title="${t('admin_tts_cache_default_hint')}">
                    <div class="toggle-switch ${u.ttsCacheDefault ? 'active' : ''}"
                         id="ttsDef-${u.id}"
                         onclick="toggleTtsCacheDefault('${u.id}', this)"
                         style="position:relative;width:36px;height:20px;border-radius:10px;
                                background:${u.ttsCacheDefault ? 'var(--primary)' : 'var(--border)'};
                                transition:background .2s;cursor:pointer;display:inline-block">
                      <div id="ttsDef-knob-${u.id}"
                           style="position:absolute;top:2px;left:${u.ttsCacheDefault ? '18px' : '2px'};
                                  width:16px;height:16px;border-radius:50%;background:#fff;
                                  transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>
                    </div>
                  </label>
                </td>
                <td>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="btn btn-sm btn-secondary" onclick="resetPassword('${u.id}','${esc(u.username)}')">🔑 ${t('admin_reset_pw')}</button>
                    <button class="btn btn-sm btn-secondary" onclick="adminTtsCache('${u.id}','${esc(u.username)}')">🗄️ ${t('admin_tts_cache_btn')}</button>
                    ${u.id !== App.user.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser('${u.id}','${esc(u.username)}')">🗑️</button>` : ''}
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

window.toggleTtsCacheDefault = async function (userId, toggleEl) {
  const isActive = toggleEl.classList.contains('active');
  const newVal = !isActive;
  try {
    await api('PUT', `/admin/users/${userId}/tts-cache-default`, { enabled: newVal });
    toggleEl.classList.toggle('active', newVal);
    toggleEl.style.background = newVal ? 'var(--primary)' : 'var(--border)';
    const knob = document.getElementById('ttsDef-knob-' + userId);
    if (knob) knob.style.left = newVal ? '18px' : '2px';
  } catch (e) {
    toast(e.error || t('common_error'), 'danger');
  }
};

window.adminTtsCache = async function (userId, username) {
  // Load stats first
  let statsData = null;
  try {
    statsData = await api('GET', `/admin/users/${userId}/tts-cache/stats`);
  } catch { statsData = { langs: {}, totalFiles: 0, totalBytes: 0 }; }

  const fmtSize = (bytes) => {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' Mo';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' Ko';
    return bytes + ' o';
  };

  const langRows = Object.entries(statsData.langs || {}).map(([code, s]) => `
    <tr>
      <td>${s.flag || '🌐'} <strong>${esc(s.name || code)}</strong></td>
      <td style="color:var(--text-muted);font-size:.85rem">${s.files} ${t('admin_tts_files')}</td>
      <td style="color:var(--text-muted);font-size:.85rem">${fmtSize(s.sizeBytes)}</td>
    </tr>`).join('') || `<tr><td colspan="3" style="color:var(--text-faint)">${t('admin_tts_no_langs')}</td></tr>`;

  const totalStr = statsData.totalFiles
    ? `${statsData.totalFiles} ${t('admin_tts_files')} · ${fmtSize(statsData.totalBytes)}`
    : t('admin_tts_cache_empty');

  openModal(`🗄️ ${t('admin_tts_cache_title')} — ${username}`, `
    <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:12px">
      ${t('admin_tts_cache_total')} : <strong>${totalStr}</strong>
    </p>
    <table class="user-table" style="margin-bottom:16px;font-size:.88rem">
      <thead><tr>
        <th>${t('admin_tts_col_lang')}</th>
        <th>${t('admin_tts_col_files')}</th>
        <th>${t('admin_tts_col_size')}</th>
      </tr></thead>
      <tbody>${langRows}</tbody>
    </table>
    <div id="adminTtsCacheProgress" style="display:none;margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span id="adminTtsCacheLabel" style="font-size:.83rem;color:var(--text-muted)"></span>
        <button type="button" id="adminTtsCancelBtn" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:.82rem;padding:0">${t('common_cancel')}</button>
      </div>
      <div style="background:var(--surface-2);border-radius:6px;height:8px;overflow:hidden">
        <div id="adminTtsCacheBar" style="height:100%;background:var(--primary);width:0%;transition:width .2s;border-radius:6px"></div>
      </div>
      <div id="adminTtsCacheCount" style="font-size:.78rem;color:var(--text-faint);margin-top:4px;text-align:right"></div>
    </div>
    <div id="adminTtsCacheErr" class="alert alert-danger hidden" style="margin-top:8px"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common_cancel')}</button>
     <button class="btn btn-secondary" id="adminTtsPurgeBtn" onclick="adminTtsPurge('${userId}','${username}')" ${statsData.totalFiles === 0 ? 'disabled' : ''}>🗑️ ${t('admin_tts_purge_btn')}</button>
     <button class="btn btn-primary" id="adminTtsGenBtn" onclick="adminTtsGenerate('${userId}','${username}')">⚡ ${t('admin_tts_gen_btn')}</button>`
  );
};

window.adminTtsPurge = async function (userId, username) {
  // First show cache stats for confirmation
  let statsData = null;
  try {
    statsData = await api('GET', `/admin/users/${userId}/tts-cache/stats`);
  } catch { statsData = { totalFiles: 0, totalBytes: 0 }; }

  const fmtSize = (bytes) => {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' Mo';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' Ko';
    return bytes + ' o';
  };

  const totalStr = `${statsData.totalFiles} ${t('admin_tts_files')} · ${fmtSize(statsData.totalBytes)}`;
  if (!confirm(t('admin_tts_purge_confirm').replace('{user}', username).replace('{size}', totalStr))) return;

  const purgeBtn = document.getElementById('adminTtsPurgeBtn');
  if (purgeBtn) purgeBtn.disabled = true;

  try {
    const r = await api('DELETE', `/admin/users/${userId}/tts-cache`);
    toast(`🗑️ ${t('admin_tts_purged').replace('{n}', r.deleted)}`);
    closeModal();
  } catch (e) {
    const errEl = document.getElementById('adminTtsCacheErr');
    if (errEl) { errEl.textContent = e.error || t('common_error'); errEl.classList.remove('hidden'); }
    if (purgeBtn) purgeBtn.disabled = false;
  }
};

window.adminTtsGenerate = async function (userId, username) {
  // Get count first
  let countData = null;
  try {
    countData = await api('GET', `/admin/users/${userId}/tts-cache/count`);
  } catch { countData = { total: 0 }; }

  if (countData.total === 0) {
    toast(t('admin_tts_gen_empty'));
    return;
  }

  if (!confirm(t('admin_tts_gen_confirm').replace('{user}', username).replace('{n}', countData.total))) return;

  const genBtn = document.getElementById('adminTtsGenBtn');
  const purgeBtn = document.getElementById('adminTtsPurgeBtn');
  const cancelBtn = document.getElementById('adminTtsCancelBtn');
  const progressEl = document.getElementById('adminTtsCacheProgress');
  const barEl = document.getElementById('adminTtsCacheBar');
  const labelEl = document.getElementById('adminTtsCacheLabel');
  const countEl = document.getElementById('adminTtsCacheCount');

  if (!genBtn || !progressEl) return;

  genBtn.disabled = true;
  if (purgeBtn) purgeBtn.disabled = true;
  progressEl.style.display = '';
  barEl.style.width = '0%';
  labelEl.textContent = t('admin_tts_gen_running');
  countEl.textContent = `0 / ${countData.total}`;

  let abortCtrl = new AbortController();
  if (cancelBtn) {
    cancelBtn.disabled = false;
    cancelBtn.onclick = () => { abortCtrl.abort(); cancelBtn.disabled = true; };
  }

  let done = 0, total = countData.total;

  try {
    const resp = await fetch(`/admin/users/${userId}/tts-cache/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortCtrl.signal
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        try {
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === 'progress') {
            done = ev.done; total = ev.total;
            const pct = total > 0 ? (done / total * 100).toFixed(0) : 0;
            barEl.style.width = pct + '%';
            labelEl.textContent = `[${ev.lang || ''}] ${ev.mode === 'slow' ? '🐌' : '🔊'} ${ev.text || ''}`;
            countEl.textContent = `${done} / ${total}`;
          } else if (ev.type === 'done') {
            barEl.style.width = '100%';
            labelEl.textContent = t('admin_tts_gen_done').replace('{n}', ev.done);
            countEl.textContent = `${ev.done} / ${ev.total}`;
          } else if (ev.type === 'error') {
            throw new Error(ev.message);
          }
        } catch (parseErr) { /* ignore */ }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      const errEl = document.getElementById('adminTtsCacheErr');
      if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
    } else {
      labelEl.textContent = t('admin_tts_gen_cancelled').replace('{n}', done);
    }
  } finally {
    if (genBtn) genBtn.disabled = false;
    if (purgeBtn) purgeBtn.disabled = false;
  }
};

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
    toast(`🗑️ ${t('admin_deleted')}`);
  } catch (e) { toast(e.error || 'Failed.', 'danger'); }
};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
