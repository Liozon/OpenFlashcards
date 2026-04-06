// pages/settings.js
'use strict';

async function renderSettings(el) {
  const cfg = App.config;

  el.innerHTML = `
    <div class="page-title">⚙️ Settings</div>

    <!-- Languages to learn -->
    <div class="card settings-section">
      <h2>🌍 Languages to learn</h2>
      <div id="langChips" class="lang-chips"></div>
      <div class="field-group" style="margin-top:12px">
        <label>Add a language</label>
        <input type="text" id="settingsLangSearch" placeholder="Search languages…" autocomplete="off">
        <div id="settingsLangResults" class="lang-results" style="display:none"></div>
      </div>
      <button class="btn btn-primary btn-sm" id="addLangBtn" disabled onclick="addLangFromSettings()">Add selected →</button>
    </div>

    <!-- Appearance -->
    <div class="card settings-section">
      <h2>🎨 Appearance</h2>
      <div class="toggle-row">
        <span>Dark mode</span>
        <label class="toggle-switch">
          <input type="checkbox" id="darkModeToggle" ${cfg.darkMode ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- Account -->
    <div class="card settings-section">
      <h2>🔐 Account</h2>
      <p style="color:var(--text-muted);margin-bottom:16px">Logged in as <strong>${esc(App.user.username)}</strong></p>
      <button class="btn btn-secondary btn-sm" onclick="showChangePassword()">Change password</button>
    </div>`;

  renderLangChips();

  // Dark mode toggle
  document.getElementById('darkModeToggle').addEventListener('change', async function() {
    await saveConfig({ darkMode: this.checked });
    document.getElementById('darkToggle').textContent = this.checked ? '☀️' : '🌙';
  });

  // Lang search
  let selectedNewLang = null;
  const searchEl  = document.getElementById('settingsLangSearch');
  const resultsEl = document.getElementById('settingsLangResults');
  const addBtn    = document.getElementById('addLangBtn');

  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim().toLowerCase();
    if (!q) { resultsEl.style.display = 'none'; return; }
    const list = (window.WORLD_LANGUAGES || []).filter(l =>
      l.name.toLowerCase().includes(q) || (l.native||'').toLowerCase().includes(q) || l.code.includes(q)
    ).slice(0, 40);
    resultsEl.style.display = list.length ? '' : 'none';
    resultsEl.innerHTML = list.map(l =>
      `<div class="lang-result-item" data-code="${l.code}" data-name="${l.name}" data-flag="${l.flag||'🌐'}" data-native="${l.native||l.name}">
        <span>${l.flag||'🌐'}</span><span>${l.name}</span><small style="color:var(--text-faint)">${l.code}</small>
      </div>`
    ).join('');
    resultsEl.querySelectorAll('.lang-result-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedNewLang = { isoCode: item.dataset.code, name: item.dataset.name, flag: item.dataset.flag, nativeName: item.dataset.native };
        searchEl.value = item.dataset.name;
        resultsEl.style.display = 'none';
        resultsEl.querySelectorAll('.lang-result-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        addBtn.disabled = false;
      });
    });
  });

  window.addLangFromSettings = async function() {
    const lang = selectedNewLang;
    if (!lang) return;
    addBtn.disabled = true;
    try {
      await api('POST', '/api/languages', lang);
      await loadConfig();
      renderLangChips();
      searchEl.value = '';
      selectedNewLang = null;
      toast(t('settings_lang_added'));
    } catch(e) {
      toast(e.error||'Failed.','danger');
      addBtn.disabled = false;
    }
  };
}

function renderLangChips() {
  const el = document.getElementById('langChips');
  if (!el) return;
  const langs = App.config.targetLangs || [];
  if (!langs.length) {
    el.innerHTML = '<p style="color:var(--text-faint);font-size:.88rem">No languages yet.</p>';
    return;
  }
  el.innerHTML = langs.map(l =>
    `<div class="lang-chip">
      ${l.flag||'🌐'} ${l.name}
      <button class="btn btn-sm btn-secondary" style="margin-left:6px;padding:2px 8px;font-size:.78rem" onclick="openLangConfig('${l.isoCode}')">⚙️ Configure</button>
      <span class="remove-lang" onclick="removeLang('${l.isoCode}')" title="Remove">✕</span>
    </div>`
  ).join('');
}

window.removeLang = async function(code) {
  if (!confirm(`Remove "${code}" language? Your words for this language won't be deleted.`)) return;
  try {
    await api('DELETE', '/api/languages/' + encodeURIComponent(code));
    await loadConfig();
    updateNavLangBadge();
    renderLangChips();
    toast(t('settings_lang_removed'));
  } catch(e) { toast(e.error||'Failed.','danger'); }
};

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE CONFIG (declensions + verb groups)
// ─────────────────────────────────────────────────────────────────────────────

window.openLangConfig = function(isoCode) {
  const lang = (App.config.targetLangs || []).find(l => l.isoCode === isoCode);
  if (!lang) return;

  let declensions = (lang.declensions || []).map(d => ({ ...d }));
  let verbGroups  = (lang.verbGroups  || []).map(g => ({ ...g }));

  function renderDeclensionRows() {
    const container = document.getElementById('declContainer');
    if (!container) return;
    if (!declensions.length) {
      container.innerHTML = '<p style="color:var(--text-faint);font-size:.85rem;margin:4px 0">No extra cases added. (Nominative is always the default.)</p>';
      return;
    }
    container.innerHTML = declensions.map((d, i) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input type="text" class="decl-native" data-i="${i}" value="${esc(d.nativeName)}" placeholder="Your language (e.g. Génitif)"
          style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)">
        <input type="text" class="decl-target" data-i="${i}" value="${esc(d.targetName)}" placeholder="Target language (e.g. Родовий)"
          style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)">
        <button onclick="removeDeclension(${i})" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--danger);padding:4px">✕</button>
      </div>`).join('');
    container.querySelectorAll('.decl-native').forEach(inp => {
      inp.addEventListener('input', () => { declensions[+inp.dataset.i].nativeName = inp.value; });
    });
    container.querySelectorAll('.decl-target').forEach(inp => {
      inp.addEventListener('input', () => { declensions[+inp.dataset.i].targetName = inp.value; });
    });
  }

  function renderVerbGroupRows() {
    const container = document.getElementById('vgContainer');
    if (!container) return;
    if (!verbGroups.length) {
      container.innerHTML = '<p style="color:var(--text-faint);font-size:.85rem;margin:4px 0">No verb groups added.</p>';
      return;
    }
    container.innerHTML = verbGroups.map((g, i) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input type="text" class="vg-name" data-i="${i}" value="${esc(g.name)}" placeholder="e.g. 1st group, Exception…"
          style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)">
        <button onclick="removeVerbGroup(${i})" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--danger);padding:4px">✕</button>
      </div>`).join('');
    container.querySelectorAll('.vg-name').forEach(inp => {
      inp.addEventListener('input', () => { verbGroups[+inp.dataset.i].name = inp.value; });
    });
  }

  openModal(`⚙️ Configure: ${lang.flag||'🌐'} ${lang.name}`, `
    <div style="margin-bottom:20px">
      <h3 style="font-size:1rem;margin-bottom:4px">📐 Declension cases</h3>
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:10px">
        The <strong>Nominative</strong> (base form) is always required. Add extra cases below.
        Enter the name in your language and in the target language.
      </p>
      <div id="declContainer"></div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="addDeclension()">+ Add case</button>
    </div>
    <div>
      <h3 style="font-size:1rem;margin-bottom:4px">📚 Verb groups</h3>
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:10px">
        Define verb groups/classes (e.g. 1st group, irregular, perfective, etc.)
      </p>
      <div id="vgContainer"></div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="addVerbGroup()">+ Add group</button>
    </div>
    <div id="lcErr" class="alert alert-danger hidden" style="margin-top:12px"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveLangConfig('${isoCode}')">Save</button>`
  );

  renderDeclensionRows();
  renderVerbGroupRows();

  window.addDeclension = function() {
    declensions.push({ nativeName: '', targetName: '' });
    renderDeclensionRows();
  };
  window.removeDeclension = function(i) {
    declensions.splice(i, 1);
    renderDeclensionRows();
  };
  window.addVerbGroup = function() {
    verbGroups.push({ name: '' });
    renderVerbGroupRows();
  };
  window.removeVerbGroup = function(i) {
    verbGroups.splice(i, 1);
    renderVerbGroupRows();
  };
  window.saveLangConfig = async function(code) {
    const errEl = document.getElementById('lcErr');
    errEl.classList.add('hidden');
    const emptyDecl = declensions.some(d => !d.nativeName.trim());
    const emptyVG   = verbGroups.some(g => !g.name.trim());
    if (emptyDecl) { errEl.textContent = 'All declension names must be filled in.'; errEl.classList.remove('hidden'); return; }
    if (emptyVG)   { errEl.textContent = 'All verb group names must be filled in.';  errEl.classList.remove('hidden'); return; }
    try {
      await api('PUT', '/api/languages/' + encodeURIComponent(code), { declensions, verbGroups });
      await loadConfig();
      closeModal();
      renderLangChips();
      toast('✓ Language configuration saved!');
    } catch(e) {
      errEl.textContent = e.error || 'Failed to save.';
      errEl.classList.remove('hidden');
    }
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE PASSWORD
// ─────────────────────────────────────────────────────────────────────────────

window.showChangePassword = function() {
  openModal(t('settings_change_pw'), `
    <div class="field-group">
      <label>Current password</label>
      <input type="password" id="cpCurrent" autocomplete="current-password">
    </div>
    <div class="field-group">
      <label>New password</label>
      <input type="password" id="cpNew" autocomplete="new-password">
    </div>
    <div class="field-group">
      <label>Confirm new password</label>
      <input type="password" id="cpConfirm" autocomplete="new-password">
    </div>
    <div id="cpErr" class="alert alert-danger hidden"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="submitChangePassword()">Save</button>`
  );
};

window.submitChangePassword = async function() {
  const current = document.getElementById('cpCurrent').value;
  const newPass = document.getElementById('cpNew').value;
  const confirm = document.getElementById('cpConfirm').value;
  const errEl   = document.getElementById('cpErr');
  errEl.classList.add('hidden');
  if (!current || !newPass || !confirm) { errEl.textContent = t('vocab_required'); errEl.classList.remove('hidden'); return; }
  if (newPass !== confirm) { errEl.textContent = 'New passwords do not match.'; errEl.classList.remove('hidden'); return; }
  if (newPass.length < 4) { errEl.textContent = 'Password must be at least 4 characters.'; errEl.classList.remove('hidden'); return; }
  try {
    await api('POST', '/auth/change-password', { currentPassword: current, newPassword: newPass });
    closeModal();
    toast(t('settings_pw_ok'));
  } catch(e) {
    errEl.textContent = e.error||'Failed.';
    errEl.classList.remove('hidden');
  }
};

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window._applySettingsLang = function() {
  if (App.config && App.config.nativeLang) {
    window.setUiLang(App.config.nativeLang);
  }
};
