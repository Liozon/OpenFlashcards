// pages/settings.js
'use strict';

async function renderSettings(el) {
  const cfg = App.config;

  el.innerHTML = `
    <div class="page-title">${t('settings_title')}</div>

    <div class="card settings-section">
      <h2>${t('settings_languages')}</h2>
      <div id="langChips" class="lang-chips"></div>
      <div class="field-group" style="margin-top:12px">
        <label>${t('settings_add_lang')}</label>
        <input type="text" id="settingsLangSearch" placeholder="${t('settings_add_lang_ph')}" autocomplete="off">
        <div id="settingsLangResults" class="lang-results" style="display:none"></div>
      </div>
      <button class="btn btn-primary btn-sm" id="addLangBtn" disabled onclick="addLangFromSettings()">${t('settings_add_btn')}</button>
    </div>

    <div class="card settings-section">
      <h2>${t('settings_ui_lang')}</h2>
      <div class="field-group">
        <input type="text" id="uiLangSearch" placeholder="${t('settings_ui_lang_ph')}" autocomplete="off" value="${getUiLangName()}">
        <div id="uiLangResults" class="lang-results" style="display:none"></div>
      </div>
    </div>

    <div class="card settings-section">
      <h2>${t('settings_appearance')}</h2>
      <div class="toggle-row">
        <span>${t('settings_dark')}</span>
        <label class="toggle-switch">
          <input type="checkbox" id="darkModeToggle" ${cfg.darkMode ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="card settings-section">
      <h2>${t('settings_account')}</h2>
      <p style="color:var(--text-muted);margin-bottom:16px">${t('settings_logged_as')} <strong>${esc(App.user.username)}</strong></p>
      <button class="btn btn-secondary btn-sm" onclick="showChangePassword()">${t('settings_change_pw')}</button>
    </div>`;

  renderLangChips();

  // Dark mode
  document.getElementById('darkModeToggle').addEventListener('change', async function () {
    await saveConfig({ darkMode: this.checked });
    document.getElementById('darkToggle').textContent = this.checked ? '☀️' : '🌙';
  });

  // Add language
  let selectedNewLang = null;
  const searchEl = document.getElementById('settingsLangSearch');
  const resultsEl = document.getElementById('settingsLangResults');
  const addBtn = document.getElementById('addLangBtn');

  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim().toLowerCase();
    if (!q) { resultsEl.style.display = 'none'; return; }
    const list = (window.WORLD_LANGUAGES || []).filter(l =>
      l.name.toLowerCase().includes(q) || (l.native || '').toLowerCase().includes(q) || l.code.includes(q)
    ).slice(0, 40);
    resultsEl.style.display = list.length ? '' : 'none';
    resultsEl.innerHTML = list.map(l =>
      `<div class="lang-result-item" data-code="${l.code}" data-name="${l.name}" data-flag="${l.flag || '🌐'}" data-native="${l.native || l.name}">
        <span>${l.flag || '🌐'}</span><span>${l.name}</span><small style="color:var(--text-faint)">${l.code}</small>
      </div>`
    ).join('');
    resultsEl.querySelectorAll('.lang-result-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedNewLang = { isoCode: item.dataset.code, name: item.dataset.name, flag: item.dataset.flag, nativeName: item.dataset.native };
        searchEl.value = item.dataset.name;
        resultsEl.style.display = 'none';
        addBtn.disabled = false;
      });
    });
  });

  window.addLangFromSettings = async function () {
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
    } catch (e) {
      toast(e.error || t('common_error'), 'danger');
      addBtn.disabled = false;
    }
  };

  // UI language picker
  const uiSearchEl = document.getElementById('uiLangSearch');
  const uiResultsEl = document.getElementById('uiLangResults');

  uiSearchEl.addEventListener('input', () => {
    const q = uiSearchEl.value.trim().toLowerCase();
    if (!q) { uiResultsEl.style.display = 'none'; return; }
    const list = (window.WORLD_LANGUAGES || []).filter(l =>
      l.name.toLowerCase().includes(q) || (l.native || '').toLowerCase().includes(q) || l.code.includes(q)
    ).slice(0, 20);
    uiResultsEl.style.display = list.length ? '' : 'none';
    uiResultsEl.innerHTML = list.map(l =>
      `<div class="lang-result-item" data-code="${l.code}" data-name="${l.name}" data-flag="${l.flag || '🌐'}">
        <span>${l.flag || '🌐'}</span><span>${l.name}</span><small style="color:var(--text-faint)">${l.code}</small>
      </div>`
    ).join('');
    uiResultsEl.querySelectorAll('.lang-result-item').forEach(item => {
      item.addEventListener('click', async () => {
        uiResultsEl.style.display = 'none';
        uiSearchEl.value = item.dataset.flag + ' ' + item.dataset.name;
        const code = item.dataset.code;
        await window.setUiLang(code);
        await saveConfig({ uiLang: code });
        App.config.uiLang = code;
        toast(t('settings_ui_lang_saved'));
        // Re-render navbar and settings page in new language
        applyNavLabels();
        navigate('settings');
      });
    });
  });
}

function getUiLangName() {
  const code = (App.config && App.config.uiLang) || 'en';
  const lang = (window.WORLD_LANGUAGES || []).find(l => l.code === code);
  return lang ? (lang.flag || '') + ' ' + lang.name : code.toUpperCase();
}

function renderLangChips() {
  const el = document.getElementById('langChips');
  if (!el) return;
  const langs = App.config.targetLangs || [];
  if (!langs.length) {
    el.innerHTML = `<p style="color:var(--text-faint);font-size:.88rem">${t('settings_no_langs')}</p>`;
    return;
  }
  el.innerHTML = langs.map(l =>
    `<div class="lang-chip">
      ${l.flag || '🌐'} ${l.name}
      <button class="btn btn-sm btn-secondary" style="margin-left:6px;padding:2px 8px;font-size:.78rem" onclick="openLangConfig('${l.isoCode}')">${t('settings_configure')}</button>
      <span class="remove-lang" onclick="removeLang('${l.isoCode}')" title="${t('common_delete')}">✕</span>
    </div>`
  ).join('');
}

window.removeLang = async function (code) {
  if (!confirm(t('settings_remove_confirm'))) return;
  try {
    await api('DELETE', '/api/languages/' + encodeURIComponent(code));
    await loadConfig();
    updateNavLangBadge();
    renderLangChips();
    toast(t('settings_lang_removed'));
  } catch (e) { toast(e.error || t('common_error'), 'danger'); }
};

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE CONFIG MODAL (declensions + verb groups + labels)
// ─────────────────────────────────────────────────────────────────────────────

window.openLangConfig = function (isoCode) {
  const lang = (App.config.targetLangs || []).find(l => l.isoCode === isoCode);
  if (!lang) return;

  let declensions = (lang.declensions || []).map(d => ({ ...d }));
  let verbGroups = (lang.verbGroups || []).map(g => ({ ...g }));
  let labels = (lang.labels || []).map(lb => ({ ...lb }));

  const LABEL_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e91e63', '#607d8b', '#795548'];

  function renderDeclensionRows() {
    const container = document.getElementById('declContainer');
    if (!container) return;
    if (!declensions.length) {
      container.innerHTML = `<p style="color:var(--text-faint);font-size:.85rem;margin:4px 0">${t('settings_decl_empty')}</p>`;
      return;
    }
    container.innerHTML = declensions.map((d, i) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input type="text" class="decl-native" data-i="${i}" value="${esc(d.nativeName)}" placeholder="${t('settings_decl_ph_native')}"
          style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)">
        <input type="text" class="decl-target" data-i="${i}" value="${esc(d.targetName)}" placeholder="${t('settings_decl_ph_target')}"
          style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)">
        <button onclick="removeDeclension(${i})" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--danger);padding:4px">✕</button>
      </div>`).join('');
    container.querySelectorAll('.decl-native').forEach(inp =>
      inp.addEventListener('input', () => { declensions[+inp.dataset.i].nativeName = inp.value; }));
    container.querySelectorAll('.decl-target').forEach(inp =>
      inp.addEventListener('input', () => { declensions[+inp.dataset.i].targetName = inp.value; }));
  }

  function renderVerbGroupRows() {
    const container = document.getElementById('vgContainer');
    if (!container) return;
    if (!verbGroups.length) {
      container.innerHTML = `<p style="color:var(--text-faint);font-size:.85rem;margin:4px 0">${t('settings_vg_empty')}</p>`;
      return;
    }
    container.innerHTML = verbGroups.map((g, i) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input type="text" class="vg-name" data-i="${i}" value="${esc(g.name)}" placeholder="${t('settings_vg_ph')}"
          style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)">
        <button onclick="removeVerbGroup(${i})" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--danger);padding:4px">✕</button>
      </div>`).join('');
    container.querySelectorAll('.vg-name').forEach(inp =>
      inp.addEventListener('input', () => { verbGroups[+inp.dataset.i].name = inp.value; }));
  }

  function renderLabelRows() {
    const container = document.getElementById('labelsContainer');
    if (!container) return;
    if (!labels.length) {
      container.innerHTML = `<p style="color:var(--text-faint);font-size:.85rem;margin:4px 0">${t('labels_empty')}</p>`;
      return;
    }
    container.innerHTML = labels.map((lb, i) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <span style="width:22px;height:22px;border-radius:50%;background:${esc(lb.color)};display:inline-block;flex-shrink:0;border:2px solid var(--border)"></span>
        <input type="text" class="lb-name" data-i="${i}" value="${esc(lb.name)}" placeholder="${t('labels_name')}"
          style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)">
        <select class="lb-color" data-i="${i}" style="padding:6px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)">
          ${LABEL_COLORS.map(c => `<option value="${c}" ${lb.color === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <button onclick="removeLabelCfg(${i})" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--danger);padding:4px">✕</button>
      </div>`).join('');
    container.querySelectorAll('.lb-name').forEach(inp =>
      inp.addEventListener('input', () => { labels[+inp.dataset.i].name = inp.value; }));
    container.querySelectorAll('.lb-color').forEach(sel =>
      sel.addEventListener('change', () => { labels[+sel.dataset.i].color = sel.value; }));
  }

  openModal(`${t('settings_lang_config_title')}: ${lang.flag || '🌐'} ${lang.name}`, `
    <div style="margin-bottom:20px">
      <h3 style="font-size:1rem;margin-bottom:4px">${t('settings_declensions_title')}</h3>
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:10px">${t('settings_declensions_desc')}</p>
      <div id="declContainer"></div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="addDeclension()">${t('settings_decl_add')}</button>
    </div>
    <div style="margin-bottom:20px">
      <h3 style="font-size:1rem;margin-bottom:4px">${t('settings_vg_title')}</h3>
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:10px">${t('settings_vg_desc')}</p>
      <div id="vgContainer"></div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="addVerbGroup()">${t('settings_vg_add')}</button>
    </div>
    <div>
      <h3 style="font-size:1rem;margin-bottom:4px">${t('labels_title')}</h3>
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:10px">${t('labels_manage')}</p>
      <div id="labelsContainer"></div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="addLabelCfg()">${t('labels_add_btn')}</button>
    </div>
    <div id="lcErr" class="alert alert-danger hidden" style="margin-top:12px"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common_cancel')}</button>
     <button class="btn btn-primary" onclick="saveLangConfig('${isoCode}')">${t('common_save')}</button>`
  );

  renderDeclensionRows();
  renderVerbGroupRows();
  renderLabelRows();

  let colorIdx = 0;
  window.addDeclension = () => { declensions.push({ nativeName: '', targetName: '' }); renderDeclensionRows(); };
  window.removeDeclension = (i) => { declensions.splice(i, 1); renderDeclensionRows(); };
  window.addVerbGroup = () => { verbGroups.push({ name: '' }); renderVerbGroupRows(); };
  window.removeVerbGroup = (i) => { verbGroups.splice(i, 1); renderVerbGroupRows(); };
  window.addLabelCfg = () => {
    const color = LABEL_COLORS[colorIdx % LABEL_COLORS.length];
    colorIdx++;
    labels.push({ id: 'new-' + Date.now(), name: '', color });
    renderLabelRows();
  };
  window.removeLabelCfg = (i) => { labels.splice(i, 1); renderLabelRows(); };

  window.saveLangConfig = async function (code) {
    const errEl = document.getElementById('lcErr');
    errEl.classList.add('hidden');
    if (declensions.some(d => !d.nativeName.trim())) {
      errEl.textContent = t('settings_decl_err_empty'); errEl.classList.remove('hidden'); return;
    }
    if (verbGroups.some(g => !g.name.trim())) {
      errEl.textContent = t('settings_vg_err_empty'); errEl.classList.remove('hidden'); return;
    }
    if (labels.some(lb => !lb.name.trim())) {
      errEl.textContent = t('labels_add_ph'); errEl.classList.remove('hidden'); return;
    }
    try {
      await api('PUT', '/api/languages/' + encodeURIComponent(code), { declensions, verbGroups, labels });
      await loadConfig();
      closeModal();
      renderLangChips();
      toast(t('settings_config_saved'));
    } catch (e) {
      errEl.textContent = e.error || t('common_error');
      errEl.classList.remove('hidden');
    }
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE PASSWORD
// ─────────────────────────────────────────────────────────────────────────────

window.showChangePassword = function () {
  openModal(t('settings_change_pw'), `
    <div class="field-group">
      <label>${t('settings_pw_current')}</label>
      <input type="password" id="cpCurrent" autocomplete="current-password">
    </div>
    <div class="field-group">
      <label>${t('settings_pw_new')}</label>
      <input type="password" id="cpNew" autocomplete="new-password">
    </div>
    <div class="field-group">
      <label>${t('settings_pw_confirm')}</label>
      <input type="password" id="cpConfirm" autocomplete="new-password">
    </div>
    <div id="cpErr" class="alert alert-danger hidden"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common_cancel')}</button>
     <button class="btn btn-primary" onclick="submitChangePassword()">${t('common_save')}</button>`
  );
};

window.submitChangePassword = async function () {
  const current = document.getElementById('cpCurrent').value;
  const newPass = document.getElementById('cpNew').value;
  const confirm = document.getElementById('cpConfirm').value;
  const errEl = document.getElementById('cpErr');
  errEl.classList.add('hidden');
  if (!current || !newPass || !confirm) {
    errEl.textContent = t('vocab_required'); errEl.classList.remove('hidden'); return;
  }
  if (newPass !== confirm) {
    errEl.textContent = t('settings_pw_mismatch'); errEl.classList.remove('hidden'); return;
  }
  if (newPass.length < 4) {
    errEl.textContent = t('settings_pw_tooshort'); errEl.classList.remove('hidden'); return;
  }
  try {
    await api('POST', '/auth/change-password', { currentPassword: current, newPassword: newPass });
    closeModal();
    toast(t('settings_pw_ok'));
  } catch (e) {
    errEl.textContent = e.error || t('common_error');
    errEl.classList.remove('hidden');
  }
};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window._applySettingsLang = function () {
  if (App.config && App.config.uiLang) {
    window.setUiLang(App.config.uiLang);
  } else if (App.config && App.config.nativeLang) {
    window.setUiLang(App.config.nativeLang);
  }
};
