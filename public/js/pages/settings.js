// pages/settings.js
'use strict';

async function renderSettings(el) {
  const cfg = App.config;

  el.innerHTML = `
    <div class="page-title">⚙️ ${t('settings_title')}</div>

    <div class="card settings-section">
      <h2>🌍 ${t('settings_languages')}</h2>
      <div id="langChips" class="lang-chips"></div>
      <div class="field-group" style="margin-top:12px">
        <label>${t('settings_add_lang')}</label>
        <input type="text" id="settingsLangSearch" placeholder="${t('settings_add_lang_ph')}" autocomplete="off">
        <div id="settingsLangResults" class="lang-results" style="display:none"></div>
      </div>
      <button class="btn btn-primary btn-sm" id="addLangBtn" disabled onclick="addLangFromSettings()">${t('settings_add_btn')} →</button>
    </div>

    <div class="card settings-section">
      <h2>🌐 ${t('settings_ui_lang')}</h2>
      <div class="field-group">
        <input type="text" id="uiLangSearch" placeholder="${t('settings_ui_lang_ph')}" autocomplete="off" value="${getUiLangName()}">
        <div id="uiLangResults" class="lang-results" style="display:none"></div>
      </div>
    </div>

    <div class="card settings-section">
      <h2>🎨 ${t('settings_appearance')}</h2>
      <div class="toggle-row">
        <span>${t('settings_dark')}</span>
        <label class="toggle-switch">
          <input type="checkbox" id="darkModeToggle" ${cfg.darkMode ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="card settings-section">
      <h2>🔐 ${t('settings_account')}</h2>
      <p style="color:var(--text-muted);margin-bottom:16px">${t('settings_logged_as')} <strong>${esc(App.user.username)}</strong></p>
      <button class="btn btn-secondary btn-sm" onclick="showChangePassword()">${t('settings_change_pw')}</button>
    </div>

    <div class="card settings-section" id="offlineSection">
      <h2>📴 ${t('offline_title')}</h2>
      <p style="color:var(--text-muted);margin-bottom:12px;font-size:.9rem">${t('offline_desc')}</p>

      <div class="toggle-row" style="margin-bottom:16px">
        <span>${t('offline_enable')}</span>
        <label class="toggle-switch">
          <input type="checkbox" id="offlineModeToggle" ${cfg.offlineMode ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div id="offlineControls" style="display:${cfg.offlineMode ? '' : 'none'}">
        <div id="offlineStatus" class="offline-status-box" style="margin-bottom:14px"></div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="offlineSyncNowBtn" onclick="window._triggerOfflineSync && window._triggerOfflineSync()">
            🔄 ${t('offline_sync_now')}
          </button>
          <button class="btn btn-secondary btn-sm" id="offlineClearBtn">
            🗑️ ${t('offline_clear')}
          </button>
        </div>

        <div id="offlineSyncProgress" style="display:none;margin-top:12px">
          <div class="offline-progress-bar-wrap">
            <div class="offline-progress-bar" id="offlineProgressBar" style="width:0%"></div>
          </div>
          <p id="offlineProgressText" style="font-size:.82rem;color:var(--text-muted);margin-top:6px"></p>
        </div>
      </div>
    </div>`;

  renderLangChips();

  // Dark mode
  document.getElementById('darkModeToggle').addEventListener('change', async function () {
    await saveConfig({ darkMode: this.checked });
    document.getElementById('darkToggle').textContent = this.checked ? '☀️' : '🌙';
  });

  // ── Offline mode toggle ────────────────────────────────────────────────────
  const offlineToggle = document.getElementById('offlineModeToggle');
  const offlineControls = document.getElementById('offlineControls');
  const offlineStatus = document.getElementById('offlineStatus');

  async function refreshOfflineStatus() {
    if (!offlineStatus) return;
    const meta = await OfflineDB.getBundleMeta();
    const ttsCount = await OfflineDB.countTTS();
    if (!meta) {
      offlineStatus.innerHTML = `<span style="color:var(--text-muted)">⚠️ ${t('offline_not_synced')}</span>`;
    } else {
      const d = new Date(meta.syncedAt);
      const fmt = d.toLocaleString();
      offlineStatus.innerHTML =
        `<span style="color:var(--success,#4caf50)">✓ ${t('offline_last_sync')}: <strong>${fmt}</strong></span><br>` +
        `<small style="color:var(--text-muted)">${t('offline_langs')}: ${(meta.langs || []).join(', ')} · ${t('offline_tts_files')}: ${ttsCount}</small>`;
    }
  }

  offlineToggle.addEventListener('change', async function () {
    const enabled = this.checked;
    await saveConfig({ offlineMode: enabled });
    offlineControls.style.display = enabled ? '' : 'none';
    if (enabled) {
      await refreshOfflineStatus();
      toast(t('offline_enabled_toast'));
    } else {
      toast(t('offline_disabled_toast'));
    }
  });

  if (cfg.offlineMode) refreshOfflineStatus();

  // Clear offline data
  document.getElementById('offlineClearBtn') && document.getElementById('offlineClearBtn').addEventListener('click', async () => {
    if (!confirm(t('offline_clear_confirm'))) return;
    await OfflineDB.clearAll();
    await refreshOfflineStatus();
    toast(t('offline_cleared'));
  });

  // Hook sync progress into the in-page progress bar
  const _origSync = window._triggerOfflineSync;
  window._triggerOfflineSync = async function () {
    const btn = document.getElementById('syncOfflineBtn');
    const syncNowBtn = document.getElementById('offlineSyncNowBtn');
    const progressWrap = document.getElementById('offlineSyncProgress');
    const progressBar = document.getElementById('offlineProgressBar');
    const progressText = document.getElementById('offlineProgressText');

    if (!navigator.onLine) {
      toast(t('offline_no_connection'), 'danger'); return;
    }

    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
    if (syncNowBtn) { syncNowBtn.disabled = true; }
    if (progressWrap) { progressWrap.style.display = ''; }

    function setProgress(pct, label) {
      if (progressBar) progressBar.style.width = pct + '%';
      if (progressText) progressText.textContent = label;
    }

    try {
      const targetLangs = App.config && App.config.targetLangs || [];
      const langs = targetLangs.map(l => l.isoCode);
      // Build speed lookup { isoCode: { ttsSpeedNormal, ttsSpeedSlow } }
      const configByLang = {};
      targetLangs.forEach(l => { configByLang[l.isoCode] = l; });

      // Each lang takes roughly equal share of the 30–100% range.
      // Structure per lang: 50% gen, 50% download
      const langShare = langs.length > 0 ? 70 / langs.length : 70;

      await OfflineSync.fullSync(langs, configByLang, prog => {
        if (prog.phase === 'data') {
          setProgress(Math.round(prog.pct * 0.3), t('offline_progress_data'));
          if (btn) btn.textContent = '📦';

        } else if (prog.phase === 'tts_gen') {
          const langIdx = langs.indexOf(prog.lang);
          const base = 30 + langIdx * langShare;
          const pct = Math.round(base + (prog.pct / 100) * langShare * 0.5);
          const label = prog.total > 0
            ? `🎙️ ${t('offline_progress_tts_gen')} ${prog.lang.toUpperCase()} (${prog.done}/${prog.total})`
            : `🎙️ ${t('offline_progress_tts_gen')} ${prog.lang.toUpperCase()}…`;
          setProgress(pct, label);
          if (btn) btn.textContent = '🎙️';

        } else if (prog.phase === 'tts_dl') {
          const langIdx = langs.indexOf(prog.lang);
          const base = 30 + langIdx * langShare + langShare * 0.5;
          const pct = Math.round(base + (prog.pct / 100) * langShare * 0.5);
          const label = prog.total > 0
            ? `📥 ${t('offline_progress_tts_dl')} ${prog.lang.toUpperCase()} (${prog.done || 0}/${prog.total})`
            : `📥 ${t('offline_progress_tts_dl')} ${prog.lang.toUpperCase()}…`;
          setProgress(pct, label);
          if (btn) btn.textContent = '📥';
        }
      });
      setProgress(100, t('offline_sync_done'));
      toast(t('offline_sync_done'));
      await refreshOfflineStatus();
      if (btn) { btn.textContent = '✅'; setTimeout(() => { btn.textContent = '🔄'; btn.disabled = false; }, 2000); }
      if (syncNowBtn) { syncNowBtn.disabled = false; }
      setTimeout(() => { if (progressWrap) progressWrap.style.display = 'none'; }, 3000);
    } catch (err) {
      console.error('[offline sync]', err);
      toast(t('offline_sync_error'), 'danger');
      if (btn) { btn.textContent = '❌'; setTimeout(() => { btn.textContent = '🔄'; btn.disabled = false; }, 2000); }
      if (syncNowBtn) syncNowBtn.disabled = false;
    }
  };

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
      toast(`✓ ${t('settings_lang_added')}`);
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
        toast(`✓ ${t('settings_ui_lang_saved')}`);
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
      <button class="btn btn-sm btn-secondary" style="margin-left:6px;padding:2px 8px;font-size:.78rem" onclick="openLangConfig('${l.isoCode}')">⚙️ ${t('settings_configure')}</button>
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
  let ttsSpeedNormal = lang.ttsSpeedNormal != null ? lang.ttsSpeedNormal : 1.0;
  let ttsSpeedSlow = lang.ttsSpeedSlow != null ? lang.ttsSpeedSlow : 0.24;
  let ttsCacheEnabled = lang.ttsCache !== false; // default true if not set

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
      <div style="margin-bottom:12px">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <span class="lb-dot" data-i="${i}" style="width:22px;height:22px;border-radius:50%;background:${esc(lb.color)};display:inline-block;flex-shrink:0;border:2px solid var(--border)"></span>
          <input type="text" class="lb-name" data-i="${i}" value="${esc(lb.name)}" placeholder="${t('labels_name')}"
            style="flex:1;padding:8px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)">
          <button onclick="removeLabelCfg(${i})" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--danger);padding:4px">✕</button>
        </div>
        <div class="lb-swatches" data-i="${i}" style="display:flex;flex-wrap:wrap;gap:6px;padding-left:30px;align-items:center">
          ${LABEL_COLORS.map(c => `
            <button type="button" data-color="${c}" data-i="${i}"
              style="width:28px;height:28px;border-radius:50%;background:${c};border:${lb.color === c ? '3px solid var(--text)' : '2px solid transparent'};cursor:pointer;padding:0;outline:${lb.color === c ? '2px solid var(--surface-1)' : 'none'};outline-offset:1px;transition:transform .1s"
              title="${c}"
              onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
            </button>`).join('')}
          <label class="lb-custom-wrap" data-i="${i}" title="Couleur personnalisée"
            style="width:28px;height:28px;border-radius:50%;border:2px dashed var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;transition:transform .1s;background:${!LABEL_COLORS.includes(lb.color) ? lb.color : 'transparent'};position:relative"
            onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
            <input type="color" class="lb-custom-color" data-i="${i}" value="${lb.color}"
              style="opacity:0;position:absolute;width:100%;height:100%;cursor:pointer;border:none;padding:0">
            <span style="pointer-events:none;color:${!LABEL_COLORS.includes(lb.color) ? 'transparent' : 'var(--text-muted)'}">＋</span>
          </label>
        </div>
      </div>`).join('');
    container.querySelectorAll('.lb-name').forEach(inp =>
      inp.addEventListener('input', () => { labels[+inp.dataset.i].name = inp.value; }));

    function applyColor(i, color) {
      labels[i].color = color;
      const dot = container.querySelector(`.lb-dot[data-i="${i}"]`);
      if (dot) dot.style.background = color;
      // Update preset swatch borders
      container.querySelectorAll(`.lb-swatches[data-i="${i}"] button`).forEach(b => {
        const selected = b.dataset.color === color;
        b.style.border = selected ? '3px solid var(--text)' : '2px solid transparent';
        b.style.outline = selected ? '2px solid var(--surface-1)' : 'none';
      });
      // Update custom picker appearance
      const wrap = container.querySelector(`.lb-custom-wrap[data-i="${i}"]`);
      const inp = container.querySelector(`.lb-custom-color[data-i="${i}"]`);
      if (wrap && inp) {
        inp.value = color;
        const isCustom = !LABEL_COLORS.includes(color);
        wrap.style.background = isCustom ? color : 'transparent';
        const plus = wrap.querySelector('span');
        if (plus) plus.style.color = isCustom ? 'transparent' : 'var(--text-muted)';
      }
    }

    container.querySelectorAll('.lb-swatches button[data-color]').forEach(btn => {
      btn.addEventListener('click', () => applyColor(+btn.dataset.i, btn.dataset.color));
    });
    container.querySelectorAll('.lb-custom-color').forEach(inp => {
      inp.addEventListener('input', () => applyColor(+inp.dataset.i, inp.value));
    });
  }

  openModal(`${t('settings_lang_config_title')}: ${lang.flag || '🌐'} ${lang.name}`, `
    <div style="margin-bottom:20px">
      <h3 style="font-size:1rem;margin-bottom:4px">📐 ${t('settings_declensions_title')}</h3>
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:10px">${t('settings_declensions_desc')}</p>
      <div id="declContainer"></div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="addDeclension()">${t('settings_decl_add')}</button>
    </div>
    <div style="margin-bottom:20px">
      <h3 style="font-size:1rem;margin-bottom:4px">📚 ${t('settings_vg_title')}</h3>
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:10px">${t('settings_vg_desc')}</p>
      <div id="vgContainer"></div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="addVerbGroup()">${t('settings_vg_add')}</button>
    </div>
    <div>
      <h3 style="font-size:1rem;margin-bottom:4px">🏷️ ${t('labels_title')}</h3>
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:10px">${t('labels_manage')}</p>
      <div id="labelsContainer"></div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="addLabelCfg()">➕ ${t('labels_add_btn')}</button>
    </div>
    <div style="margin-top:20px">
      <h3 style="font-size:1rem;margin-bottom:4px">🔊 ${t('settings_tts_title')}</h3>
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:12px">${t('settings_tts_desc')}</p>
      <div style="margin-bottom:12px">
        <label style="display:flex;justify-content:space-between;align-items:center;font-size:.9rem;margin-bottom:6px">
          <span>${t('settings_tts_normal')}</span>
          <span id="ttsNormalVal" style="font-weight:600;min-width:2.5rem;text-align:right">${(ttsSpeedNormal * 100).toFixed(0)}%</span>
        </label>
        <input type="range" id="ttsNormalSlider" min="0.5" max="2" step="0.01" value="${ttsSpeedNormal}"
          style="width:100%;accent-color:var(--primary)">
        <button type="button" id="ttsNormalTest" class="btn btn-secondary btn-sm" style="margin-top:8px">
          🔊 ${t('settings_tts_test')}
        </button>
      </div>
      <div style="margin-top:12px">
        <label style="display:flex;justify-content:space-between;align-items:center;font-size:.9rem;margin-bottom:6px">
          <span>${t('settings_tts_slow')}</span>
          <span id="ttsSlowVal" style="font-weight:600;min-width:2.5rem;text-align:right">${(ttsSpeedSlow * 100).toFixed(0)}%</span>
        </label>
        <input type="range" id="ttsSlowSlider" min="0.1" max="0.8" step="0.01" value="${ttsSpeedSlow}"
          style="width:100%;accent-color:var(--primary)">
        <button type="button" id="ttsSlowTest" class="btn btn-secondary btn-sm" style="margin-top:8px">
          🐌 ${t('settings_tts_test')}
        </button>
      </div>
    </div>
    <div style="margin-top:20px">
      <h3 style="font-size:1rem;margin-bottom:4px">🗄️ ${t('settings_tts_cache_title')}</h3>
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:10px">${t('settings_tts_cache_desc')}</p>
      <label style="display:flex;align-items:center;gap:10px;margin-bottom:12px;cursor:pointer;user-select:none">
        <div class="toggle-switch ${ttsCacheEnabled ? 'active' : ''}" id="ttsCacheToggle" style="
          position:relative;width:40px;height:22px;border-radius:11px;
          background:${ttsCacheEnabled ? 'var(--primary)' : 'var(--border)'};
          transition:background .2s;flex-shrink:0;cursor:pointer">
          <div style="
            position:absolute;top:3px;left:${ttsCacheEnabled ? '21px' : '3px'};
            width:16px;height:16px;border-radius:50%;background:#fff;
            transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.3)" id="ttsCacheKnob"></div>
        </div>
        <span style="font-size:.9rem">${t('settings_tts_cache_enable')}</span>
      </label>
      <div id="ttsCacheSection" style="${ttsCacheEnabled ? '' : 'opacity:.45;pointer-events:none'}">
      <div id="ttsCacheInfo" style="font-size:.85rem;color:var(--text-muted);margin-bottom:10px">…</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button type="button" id="ttsCacheGenBtn" class="btn btn-secondary btn-sm">
          ⚡ ${t('settings_tts_cache_generate')}
        </button>
        <button type="button" id="ttsCachePurgeBtn" class="btn btn-danger btn-sm">
          🗑️ ${t('settings_tts_cache_purge')}
        </button>
      </div>
      <div id="ttsCacheGenProgress" style="display:none;margin-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span id="ttsCacheGenLabel" style="font-size:.83rem;color:var(--text-muted)"></span>
          <button type="button" id="ttsCacheGenCancelBtn" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:.82rem;padding:0">${t('common_cancel')}</button>
        </div>
        <div style="background:var(--surface-2);border-radius:6px;height:8px;overflow:hidden">
          <div id="ttsCacheGenBar" style="height:100%;background:var(--primary);width:0%;transition:width .2s;border-radius:6px"></div>
        </div>
        <div id="ttsCacheGenCount" style="font-size:.78rem;color:var(--text-faint);margin-top:4px;text-align:right"></div>
      </div>
    </div>
    </div>
    <div id="lcErr" class="alert alert-danger hidden" style="margin-top:12px"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">${t('common_cancel')}</button>
     <button class="btn btn-primary" onclick="saveLangConfig('${isoCode}')">${t('common_save')}</button>`
  );

  renderDeclensionRows();
  renderVerbGroupRows();
  renderLabelRows();

  // TTS speed sliders
  const normalSlider = document.getElementById('ttsNormalSlider');
  const slowSlider = document.getElementById('ttsSlowSlider');
  if (normalSlider) {
    normalSlider.addEventListener('input', () => {
      ttsSpeedNormal = parseFloat(normalSlider.value);
      const el = document.getElementById('ttsNormalVal');
      if (el) el.textContent = Math.round(ttsSpeedNormal * 100) + '%';
    });
  }
  if (slowSlider) {
    slowSlider.addEventListener('input', () => {
      ttsSpeedSlow = parseFloat(slowSlider.value);
      const el = document.getElementById('ttsSlowVal');
      if (el) el.textContent = Math.round(ttsSpeedSlow * 100) + '%';
    });
  }

  // TTS test buttons — use the UI language and a sample sentence from that locale
  const ttsTestNormal = document.getElementById('ttsNormalTest');
  const ttsTestSlow = document.getElementById('ttsSlowTest');
  function ttsTestSpeak(mode) {
    // The sample phrase is in the UI language → use _uiLang for the TTS lang param
    // so the voice matches the text being read.
    // nocache=1 → server skips cache read AND write; test audio is never stored on disk.
    const uiLang = window._uiLang || 'en';
    const sample = t('settings_tts_sample');
    const speed = mode === 'slow' ? ttsSpeedSlow : ttsSpeedNormal;
    const url = '/api/tts?lang=' + encodeURIComponent(uiLang) +
      '&q=' + encodeURIComponent(sample) +
      '&speed=' + speed.toFixed(2) +
      '&nocache=1';
    const audio = new Audio(url);
    audio.volume = 1;
    audio.play().catch(() => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(sample);
      utt.lang = uiLang;
      utt.rate = speed;
      window.speechSynthesis.speak(utt);
    });
  }
  if (ttsTestNormal) ttsTestNormal.addEventListener('click', () => ttsTestSpeak('normal'));
  if (ttsTestSlow) ttsTestSlow.addEventListener('click', () => ttsTestSpeak('slow'));

  // ── TTS speed change tracking: remember original speeds to detect changes ──
  const _origSpeedNormal = ttsSpeedNormal;
  const _origSpeedSlow = ttsSpeedSlow;

  // ── TTS cache toggle ──────────────────────────────────────────────────────
  const cacheToggle = document.getElementById('ttsCacheToggle');
  if (cacheToggle) {
    cacheToggle.addEventListener('click', () => {
      ttsCacheEnabled = !ttsCacheEnabled;
      cacheToggle.style.background = ttsCacheEnabled ? 'var(--primary)' : 'var(--border)';
      const knob = document.getElementById('ttsCacheKnob');
      if (knob) knob.style.left = ttsCacheEnabled ? '21px' : '3px';
      const section = document.getElementById('ttsCacheSection');
      if (section) { section.style.opacity = ttsCacheEnabled ? '1' : '0.45'; section.style.pointerEvents = ttsCacheEnabled ? '' : 'none'; }
    });
  }

  // ── TTS cache: load stats on open ─────────────────────────────────────────
  (async () => {
    const infoEl = document.getElementById('ttsCacheInfo');
    if (!infoEl) return;
    const stats = await TTS.getCacheStats(isoCode);
    if (stats.files === 0) {
      infoEl.textContent = t('settings_tts_cache_empty');
    } else {
      const kb = (stats.sizeBytes / 1024).toFixed(1);
      infoEl.textContent = t('settings_tts_cache_info')
        .replace('{files}', stats.files)
        .replace('{size}', kb);
    }
  })();

  const purgeBtn = document.getElementById('ttsCachePurgeBtn');
  if (purgeBtn) {
    purgeBtn.addEventListener('click', async () => {
      if (!confirm(t('settings_tts_cache_confirm'))) return;
      purgeBtn.disabled = true;
      const result = await TTS.purgeCache(isoCode);
      const infoEl = document.getElementById('ttsCacheInfo');
      if (result && result.ok) {
        if (infoEl) infoEl.textContent = t('settings_tts_cache_empty');
        toast('🗑️ ' + t('settings_tts_cache_purged').replace('{n}', result.deleted));
      } else {
        toast(t('common_error'), 'danger');
      }
      purgeBtn.disabled = false;
    });
  }

  // ── TTS cache: generate all ───────────────────────────────────────────────
  const genBtn = document.getElementById('ttsCacheGenBtn');
  if (genBtn) {
    genBtn.addEventListener('click', () => _startTTSGeneration(isoCode));
  }

  async function _startTTSGeneration(langCode) {
    const genBtn = document.getElementById('ttsCacheGenBtn');
    const purgeBtn2 = document.getElementById('ttsCachePurgeBtn');
    const progressEl = document.getElementById('ttsCacheGenProgress');
    const barEl = document.getElementById('ttsCacheGenBar');
    const labelEl = document.getElementById('ttsCacheGenLabel');
    const countEl = document.getElementById('ttsCacheGenCount');
    const cancelBtn = document.getElementById('ttsCacheGenCancelBtn');
    if (!genBtn || !progressEl) return;

    // Lock UI
    genBtn.disabled = true;
    purgeBtn2.disabled = true;
    progressEl.style.display = '';
    barEl.style.width = '0%';
    labelEl.textContent = t('settings_tts_cache_gen_running');
    countEl.textContent = '…';

    // The server drives the entire generation loop via SSE.
    // We pass current speeds + previous speeds so it can skip unchanged cached items
    // and lazily delete stale files for speed-changed items.
    const body = JSON.stringify({
      lang: langCode,
      speedNormal: ttsSpeedNormal,
      speedSlow: ttsSpeedSlow,
      prevSpeedNormal: _origSpeedNormal,
      prevSpeedSlow: _origSpeedSlow
    });

    let abortCtrl = new AbortController();
    cancelBtn.disabled = false;
    cancelBtn.onclick = () => {
      abortCtrl.abort();
      cancelBtn.disabled = true;
    };

    let done = 0, total = 0, wasCancelled = false;

    try {
      const resp = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: abortCtrl.signal
      });

      if (!resp.ok) throw new Error('HTTP ' + resp.status);

      // Read the SSE stream line by line
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop(); // keep incomplete last line
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let evt;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }

          if (evt.type === 'progress') {
            done = evt.done;
            total = evt.total;
            const pct = total > 0 ? Math.round(done / total * 100) : 0;
            barEl.style.width = pct + '%';
            countEl.textContent = done + ' / ' + total;
            const icon = evt.mode === 'slow' ? '🐌' : '🔊';
            const label = evt.text || '';
            labelEl.textContent = icon + ' ' + label.slice(0, 38) + (label.length > 38 ? '…' : '');
          } else if (evt.type === 'done') {
            done = evt.done;
            total = evt.total;
            barEl.style.width = '100%';
            countEl.textContent = done + ' / ' + total;
          } else if (evt.type === 'error') {
            toast(evt.message || t('common_error'), 'danger');
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        wasCancelled = true;
      } else {
        toast(t('common_error'), 'danger');
        console.error('[TTS generate]', err);
      }
    }

    // Restore UI
    genBtn.disabled = false;
    purgeBtn2.disabled = false;
    progressEl.style.display = 'none';

    if (wasCancelled) {
      toast(t('settings_tts_cache_gen_cancelled').replace('{n}', done));
    } else if (total > 0) {
      toast('✅ ' + t('settings_tts_cache_gen_done').replace('{n}', done));
    } else {
      toast(t('settings_tts_cache_gen_empty'));
    }

    // Refresh stats display
    const infoEl2 = document.getElementById('ttsCacheInfo');
    if (infoEl2) {
      const stats2 = await TTS.getCacheStats(langCode);
      if (stats2.files === 0) {
        infoEl2.textContent = t('settings_tts_cache_empty');
      } else {
        const kb2 = (stats2.sizeBytes / 1024).toFixed(1);
        infoEl2.textContent = t('settings_tts_cache_info')
          .replace('{files}', stats2.files)
          .replace('{size}', kb2);
      }
    }
  }

  let colorIdx = 0;
  window.addDeclension = () => { declensions.push({ nativeName: '', targetName: '' }); renderDeclensionRows(); };
  window.removeDeclension = (i) => { declensions.splice(i, 1); renderDeclensionRows(); };
  window.addVerbGroup = () => { verbGroups.push({ name: '' }); renderVerbGroupRows(); };
  window.removeVerbGroup = (i) => { verbGroups.splice(i, 1); renderVerbGroupRows(); };
  window.addLabelCfg = () => {
    const color = LABEL_COLORS[colorIdx % LABEL_COLORS.length];
    colorIdx++;
    labels.push({ id: crypto.randomUUID(), name: '', color });
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
      await api('PUT', '/api/languages/' + encodeURIComponent(code), { declensions, verbGroups, labels, ttsSpeedNormal, ttsSpeedSlow, ttsCache: ttsCacheEnabled });
      await loadConfig();

      // Purge ONLY the speed bucket(s) that actually changed, leave the other intact.
      // We purge the OLD speed value so newly-generated files (at new speed) are unaffected.
      const normalChanged = Math.abs(ttsSpeedNormal - _origSpeedNormal) > 0.001;
      const slowChanged = Math.abs(ttsSpeedSlow - _origSpeedSlow) > 0.001;
      let totalPurged = 0;
      if (normalChanged) {
        const r = await TTS.purgeCache(code, _origSpeedNormal);
        if (r && r.ok) totalPurged += r.deleted;
      }
      if (slowChanged) {
        const r = await TTS.purgeCache(code, _origSpeedSlow);
        if (r && r.ok) totalPurged += r.deleted;
      }
      if (totalPurged > 0) {
        toast(`🗑️ ${t('settings_tts_cache_speed_purged').replace('{n}', totalPurged)}`);
      }

      closeModal();
      renderLangChips();
      toast(`✓ ${t('settings_config_saved')}`);
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
    toast(`✅ ${t('settings_pw_ok')}`);
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