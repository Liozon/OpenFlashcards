// app.js – Core SPA: auth, router, state, API helpers
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
window.App = {
  user: null,   // { id, username, role }
  config: null,   // user config from server
  currentPage: null
};

// ─────────────────────────────────────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────────────────────────────────────
window.api = async function (method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin'
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────
async function checkAuth() {
  const offline = window._isReallyOffline ? window._isReallyOffline() : !navigator.onLine;
  console.log('[auth] checkAuth — offline:', offline, '| api patched:', window.api !== window._realApi && !!window._realApi);
  try {
    App.user = await api('GET', '/auth/me');
    console.log('[auth] /auth/me success:', App.user && App.user.username);
    // If offline and config not yet loaded, restore it from IDB bundle
    const isOfflineNow = window._isReallyOffline ? window._isReallyOffline() : !navigator.onLine;
    if (isOfflineNow && !App.config && window.OfflineDB) {
      const bundle = await OfflineDB.getBundle().catch(() => null);
      if (bundle && bundle.config) App.config = bundle.config;
    }
    // Persist for offline refresh (only when online)
    if (!isOfflineNow && window.OfflineSession && App.config) OfflineSession.save(App.user, App.config);
    return true;
  } catch (e) {
    console.warn('[auth] /auth/me failed:', e);
    // The interceptor already handled the offline /auth/me case and returned the
    // user if a session was saved. If we still got an error, no session is available.
    return false;
  }
}

async function doLogin(username, password) {
  const data = await api('POST', '/auth/login', { username, password });
  App.user = data.user;
}

async function doLogout() {
  if (navigator.onLine) await api('POST', '/auth/logout').catch(() => { });
  App.user = null;
  App.config = null;
  if (window.OfflineSession) OfflineSession.clear();
  showLoginScreen();
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
async function loadConfig() {
  // If offline boot already loaded config from IDB bundle, skip network fetch
  const isOffline = window._isReallyOffline ? window._isReallyOffline() : !navigator.onLine;
  if (App.config && isOffline) {
    applyTheme();
    updateOfflineSyncBtn();
    return;
  }
  App.config = await api('GET', '/api/config');
  applyTheme();
  updateOfflineSyncBtn();
  // Persist session for offline refresh
  const isOfflineNow = window._isReallyOffline ? window._isReallyOffline() : !navigator.onLine;
  if (!isOfflineNow && window.OfflineSession && App.user) OfflineSession.save(App.user, App.config);
}

async function saveConfig(patch) {
  App.config = (await api('PUT', '/api/config', patch)).config;
  applyTheme();
  updateNavLangBadge();
  updateOfflineSyncBtn();
  if (window.OfflineSession && App.user) OfflineSession.save(App.user, App.config);
}

function updateOfflineSyncBtn() {
  const btn = document.getElementById('syncOfflineBtn');
  if (!btn) return;
  const enabled = App.config && App.config.offlineMode;
  btn.style.display = enabled ? '' : 'none';
  if (enabled && window.OfflineMode) {
    btn.classList.toggle('sync-btn-offline', !OfflineMode.isOnline);
    btn.title = window.t ? t(OfflineMode.isOnline ? 'offline_sync_now' : 'offline_no_connection') : 'Sync';
  }
  // Show/hide offline banner
  _updateOfflineBanner(enabled && window.OfflineMode && !OfflineMode.isOnline);

  // Pending-sync badge
  if (enabled && window.OfflineDB) {
    OfflineDB.getProgressQueue().then(queue => {
      let badge = document.getElementById('syncPendingBadge');
      const count = queue.length;
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.id = 'syncPendingBadge';
          badge.style.cssText =
            'position:absolute;top:-5px;right:-5px;background:var(--warning,#ff9800);' +
            'color:#fff;border-radius:99px;font-size:.65rem;font-weight:700;' +
            'min-width:16px;height:16px;line-height:16px;text-align:center;padding:0 3px;pointer-events:none';
          btn.style.position = 'relative';
          btn.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = '';
      } else if (badge) {
        badge.style.display = 'none';
      }
    }).catch(() => { });
  }
}

function _updateOfflineBanner(show) {
  let banner = document.getElementById('offlineBanner');
  if (show) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offlineBanner';
      banner.className = 'offline-banner';

      const msg = document.createElement('span');
      msg.textContent = `📴 ${window.t ? t('offline_no_connection') : 'You are offline'} – ${window.t ? t('offline_readonly') : 'read-only mode'}`;

      const closeBtn = document.createElement('button');
      closeBtn.className = 'offline-banner-close';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.textContent = 'X';
      closeBtn.addEventListener('click', () => {
        banner.remove();
        if (banner._autoTimer) clearTimeout(banner._autoTimer);
      });

      banner.appendChild(msg);
      banner.appendChild(closeBtn);
      document.body.appendChild(banner);

      // Auto-dismiss after 30 seconds
      banner._autoTimer = setTimeout(() => {
        if (document.getElementById('offlineBanner')) {
          banner.classList.add('offline-banner-hiding');
          banner.addEventListener('animationend', () => banner.remove(), { once: true });
        }
      }, 30000);
    }
  } else {
    if (banner) {
      if (banner._autoTimer) clearTimeout(banner._autoTimer);
      banner.remove();
    }
  }
}

function applyTheme() {
  const dark = App.config ? App.config.darkMode : true;
  if (dark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const btn = document.getElementById('darkToggle');
  if (btn) btn.textContent = dark ? '☀️' : '🌙';
}

function currentLang() {
  return App.config && App.config.currentLang ? App.config.currentLang : null;
}

function currentLangData() {
  if (!App.config || !App.config.currentLang) return null;
  const base = (App.config.targetLangs || []).find(l => l.isoCode === App.config.currentLang) || null;
  if (!base) return null;
  // Enrich with pronouns
  const pronouns = (window.LANG_PRONOUNS && window.LANG_PRONOUNS[base.isoCode]) || null;
  return pronouns ? { ...base, pronouns } : base;
}

function updateNavLangBadge() {
  const badge = document.getElementById('navLangBadge');
  if (!badge) return;
  const ld = currentLangData();
  badge.textContent = ld ? (ld.flag || '') + ' ' + ld.isoCode.toUpperCase() : '';
  badge.style.display = ld ? '' : 'none';
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREENS
// ─────────────────────────────────────────────────────────────────────────────
function showLoginScreen() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
}

function showAppShell() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────────────────────────────────────
window.navigate = function (page, params, _fromPopState) {
  // Close mobile menu
  document.getElementById('navLinks').classList.remove('open');

  App.currentPage = page;

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === page);
  });

  // Push page to browser history so back/forward buttons work
  if (!_fromPopState) {
    let hash = '#/' + page;
    if (params && Object.keys(params).length) {
      hash += '?' + Object.entries(params).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
    }
    if (window.location.hash !== hash) {
      history.pushState({ page, params }, '', hash);
    }
  }

  const content = document.getElementById('pageContent');
  content.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>' + t('app_loading') + '</p></div>';

  const renderers = {
    home: renderHome,
    vocabulary: renderVocabulary,
    add: renderAdd,
    train: renderTrain,
    settings: renderSettings,
    admin: renderAdmin,
    notebook: renderNotebook
  };

  (renderers[page] || renderHome)(content, params || {});
};

// Handle browser back/forward buttons and manual hash changes
window.addEventListener('popstate', function (e) {
  if (!App.user) return;
  const page = (e.state && e.state.page) || getPageFromHash();
  if (page) {
    navigate(page, (e.state && e.state.params) || getParamsFromHash(), true);
  }
});

window.addEventListener('hashchange', function () {
  if (!App.user) return;
  const page = getPageFromHash();
  const params = getParamsFromHash();
  if (page && page !== App.currentPage) {
    navigate(page, params, true);
  }
});

function getPageFromHash() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#/')) {
    const [pathPart, queryPart] = hash.slice(2).split('?');
    const page = pathPart.split('/')[0];
    if (['home', 'vocabulary', 'add', 'train', 'settings', 'admin', 'notebook'].includes(page)) {
      return page;
    }
  }
  return null;
}

function getParamsFromHash() {
  const hash = window.location.hash;
  const params = {};
  if (hash && hash.includes('?')) {
    const qs = hash.split('?')[1];
    qs.split('&').forEach(pair => {
      const [k, v] = pair.split('=').map(s => decodeURIComponent(s));
      if (k) params[k] = v;
    });
  }
  return params;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────
window.openModal = function (title, bodyHtml, footerHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml || '';
  document.getElementById('modal').classList.remove('hidden');
};

window.closeModal = function () {
  document.getElementById('modal').classList.add('hidden');
};

// Close on backdrop click
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});

window.confirmModal = function (message, opts = {}) {
  return new Promise(resolve => {
    const okId = 'cmOk';
    const cancelId = 'cmCancel';
    const extraId = 'cmExtra';
    let finished = false;
    const modal = document.getElementById('modal');
    const wasHidden = modal.classList.contains('hidden');
    const prevTitle = document.getElementById('modalTitle').textContent;
    const prevBody = document.getElementById('modalBody').innerHTML;
    const prevFooter = document.getElementById('modalFooter').innerHTML;

    function finish(val) {
      if (finished) return;
      finished = true;
      if (wasHidden) {
        closeModal();
      } else {
        openModal(prevTitle, prevBody, prevFooter);
      }
      resolve(val);
    }

    const extraHtml = opts.extraButton
      ? `<button class="btn ${opts.extraButtonClass || 'btn-secondary'}" id="${extraId}">${opts.extraButton}</button>`
      : '';

    openModal(
      opts.title || t('common_confirm') || 'Confirm',
      `<p style="margin:0;line-height:1.5">${message}</p>`,
      `${extraHtml}
       <button class="btn btn-secondary" id="${cancelId}">${opts.cancelLabel || t('common_cancel')}</button>
       <button class="btn ${opts.confirmBtnClass || 'btn-danger'}" id="${okId}">${opts.confirmLabel || t('common_delete') || 'Delete'}</button>`
    );

    document.getElementById(okId).addEventListener('click', () => finish(true));
    document.getElementById(cancelId).addEventListener('click', () => finish(false));
    if (opts.extraButton) {
      document.getElementById(extraId).addEventListener('click', () => finish(-1));
    }

    const observer = new MutationObserver(() => {
      if (modal.classList.contains('hidden')) {
        observer.disconnect();
        finish(false);
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────────
window.toast = function (msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `alert alert-${type}`;
  el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;max-width:320px;box-shadow:0 4px 16px rgba(0,0,0,.2);animation:fadeIn .2s';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 8000);
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Wait for English locale to be ready before anything renders.
  // offline-db.js may still be populating _offlineLocaleBundle from IDB,
  // so we give it a short extra tick before resolving i18nReady.
  await window._i18nReady;

  // If offline and locale strings are still empty, try loading from IDB bundle directly
  if (!navigator.onLine && Object.keys(window._i18nStrings || {}).length < 5) {
    try {
      const bundle = window._offlineLocaleBundle ||
        (window.OfflineDB ? (await OfflineDB.getBundle().catch(() => null) || {}).locales : null);
      if (bundle) {
        const code = (navigator.language || 'en').split('-')[0].toLowerCase();
        const locale = bundle[code] || bundle['en'];
        if (locale) { window._i18nStrings = locale; window._uiLang = code; window._i18nCache = window._i18nCache || {}; window._i18nCache[code] = locale; }
      }
    } catch { }
  }

  // Detect browser language for login screen before user logs in
  const browserLang = (navigator.language || navigator.userLanguage || 'en').split('-')[0];
  await window.setUiLang(browserLang);
  applyLoginLabels();

  // Login form
  const loginBtn = document.getElementById('loginBtn');
  const loginUser = document.getElementById('loginUsername');
  const loginPass = document.getElementById('loginPassword');
  const loginErr = document.getElementById('loginError');

  async function attemptLogin() {
    loginErr.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.textContent = t('app_signing_in');
    try {
      await doLogin(loginUser.value.trim(), loginPass.value);
      await bootApp();
    } catch (e) {
      var errorLabel
      if (e.error === "Invalid credentials.") {
        errorLabel = t('login_error')
      } else if (e.error === "Username and password required.") {
        errorLabel = t('login_error_empty')
      } else {
        errorLabel = e.error
      }

      loginErr.textContent = errorLabel;
      loginErr.classList.remove('hidden');
      loginBtn.disabled = false;
      loginBtn.textContent = t('login_btn') + " →";
    }
  }

  loginBtn.addEventListener('click', attemptLogin);
  loginPass.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
  loginUser.addEventListener('keydown', e => { if (e.key === 'Enter') loginPass.focus(); });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', doLogout);

  // Dark mode toggle
  document.getElementById('darkToggle').addEventListener('click', async () => {
    const dark = !(App.config && App.config.darkMode);
    await saveConfig({ darkMode: dark });
    document.getElementById('darkToggle').textContent = dark ? '☀️' : '🌙';
  });

  // Hamburger menu
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('open');
  });

  // Nav links
  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigate(link.dataset.page);
    });
  });

  // Check existing session
  const authed = await checkAuth();
  if (authed) {
    // If we have config already (offline restore), apply the user's language
    // immediately so the UI renders in the right language from the start
    if (App.config) {
      const uiLang = App.config.uiLang || App.config.nativeLang;
      if (uiLang) await window.setUiLang(uiLang);
    }
    await bootApp();
  } else {
    showLoginScreen();
    loginUser.focus();
  }
});

// ── Offline sync trigger (called by navbar sync button) ───────────────────────
window._triggerOfflineSync = async function () {
  const btn = document.getElementById('syncOfflineBtn');
  if (!btn) return;
  if (!navigator.onLine) {
    toast(window.t ? t('offline_no_connection') : 'No connection', 'danger');
    return;
  }
  btn.textContent = '⏳';
  btn.disabled = true;
  try {
    const targetLangs = (App.config && App.config.targetLangs) || [];
    const langs = targetLangs.map(l => l.isoCode);
    const configByLang = {};
    targetLangs.forEach(l => { configByLang[l.isoCode] = l; });

    await OfflineSync.fullSync(langs, configByLang, progress => {
      if (progress.phase === 'data') btn.textContent = '📦';
      else if (progress.phase === 'tts_gen') btn.textContent = '🎙️';
      else if (progress.phase === 'tts_dl') btn.textContent = '📥';
    });
    btn.textContent = '✅';
    toast(window.t ? t('offline_sync_done') : 'Sync complete ✓');
    setTimeout(() => { btn.textContent = '🔄'; btn.disabled = false; }, 2000);
  } catch (err) {
    console.error('[offline sync]', err);
    btn.textContent = '❌';
    toast(window.t ? t('offline_sync_error') : 'Sync failed', 'danger');
    setTimeout(() => { btn.textContent = '🔄'; btn.disabled = false; }, 2000);
  }
};



// ─────────────────────────────────────────────────────────────────────────────
// I18N HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function applyNavLabels() {
  const map = {
    navHome: 'nav_home',
    navVocab: 'nav_vocabulary',
    navTrain: 'nav_train',
    navAdd: 'nav_add',
    navNotebook: 'nav_notebook',
    navSettings: 'nav_settings',
    adminLink: 'nav_admin'
  };

  const icons = {
    navHome: '🏠',
    navVocab: '📚',
    navTrain: '🎯',
    navAdd: '➕',
    navNotebook: '📓',
    navSettings: '⚙️',
    adminLink: '🔑'
  };

  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;

    const label = t(map[id]); // ta fonction de traduction
    const icon = icons[id] || '';

    el.textContent = `${icon} ${label}`;
  });

  // Admin link: only visible to admins. Always enforce this after any textContent reset.
  const al = document.getElementById('adminLink');
  if (al) al.style.display = (App.user && App.user.role === 'admin') ? '' : 'none';

  // Language tools: hidden for admin users (admins only manage users)
  const isAdmin = App.user && App.user.role === 'admin';
  ['navHome', 'navVocab', 'navAdd', 'navTrain'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin ? 'none' : '';
  });
  // Settings also hidden for admin (no languages to configure)
  const navSettings = document.getElementById('navSettings');
  if (navSettings) navSettings.style.display = isAdmin ? 'none' : '';
}

function applyLoginLabels() {
  const sub = document.getElementById('loginSub');
  const ul = document.getElementById('loginUserLabel');
  const pl = document.getElementById('loginPassLabel');
  const btn = document.getElementById('loginBtn');
  if (sub) sub.textContent = t('login_title');
  if (ul) ul.textContent = t('login_username');
  if (pl) pl.textContent = t('login_password');
  if (btn) btn.textContent = t('login_btn') + " →";
}

async function bootApp() {
  await loadConfig();
  // Apply the user's preferred UI language (uiLang takes precedence over nativeLang)
  const preferredUiLang = (App.config && App.config.uiLang) || (App.config && App.config.nativeLang);
  if (preferredUiLang) {
    await window.setUiLang(preferredUiLang);
  }
  applyNavLabels();
  showAppShell();

  // Admin → direct to admin panel, no language tools
  if (App.user.role === 'admin') {
    document.getElementById('appShell').querySelector('.navbar').style.display = '';
    const hashPage = getPageFromHash();
    const targetPage = hashPage || 'admin';
    history.replaceState({ page: targetPage }, '', '#/' + targetPage);
    navigate(targetPage, {}, true);
    return;
  }

  // Regular user: onboarding if no languages configured yet
  if (!App.config.targetLangs || !App.config.targetLangs.length) {
    renderOnboarding(document.getElementById('pageContent'));
    document.getElementById('appShell').querySelector('.navbar').style.display = 'none';
  } else {
    document.getElementById('appShell').querySelector('.navbar').style.display = '';
    updateNavLangBadge();
    const hashPage = getPageFromHash();
    const targetPage = hashPage || 'home';
    history.replaceState({ page: targetPage }, '', '#/' + targetPage);
    navigate(targetPage, {}, true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────────────────────────────────────────
function renderOnboarding(el) {
  el.innerHTML = `
    <div class="onboarding-screen">
      <div class="onboarding-card">
        <div style="font-size:2.5rem;margin-bottom:8px">🃏</div>
        <h2>${t('onb_welcome')}</h2>
        <p>${t('onb_native_q')}</p>

        <div class="field-group your-language">
          <label>${t('onb_your_language')}</label>
          <input type="text" id="onbNativeSearch" placeholder="${t('onb_search')}" autocomplete="off">
          <div id="onbNativeResults" class="lang-results" style="display:none"></div>
          <div id="onbNativeChip" style="margin-top:8px"></div>
        </div>

        <p style="margin-top:8px">${t('onb_learn_q')}</p>
        <div class="field-group languages-to-learn">
          <label>${t('onb_language_to_learn')}</label>
          <input type="text" id="onbLearnSearch" placeholder="${t('onb_search')}" autocomplete="off">
          <div id="onbLearnResults" class="lang-results" style="display:none"></div>
          <div id="onbLearnChips" class="selected-chips"></div>
        </div>

        <div id="onbError" class="alert alert-danger hidden"></div>
        <button class="btn btn-primary btn-full" id="onbStartBtn">${t('onb_start')} →</button>
      </div>
    </div>`;

  let nativeLang = null;
  const learnLangs = {};

  // Native search
  const nSearch = document.getElementById('onbNativeSearch');
  const nResults = document.getElementById('onbNativeResults');
  const nChip = document.getElementById('onbNativeChip');

  nSearch.addEventListener('input', () => {
    const q = nSearch.value.trim().toLowerCase();
    const list = (window.WORLD_LANGUAGES || []).filter(l =>
      l.name.toLowerCase().includes(q) || (l.native || '').toLowerCase().includes(q) || l.code.includes(q)
    ).slice(0, 40);
    nResults.style.display = list.length ? '' : 'none';
    nResults.innerHTML = list.map(l =>
      `<div class="lang-result-item" data-code="${l.code}" data-name="${l.name}" data-flag="${l.flag || '🌐'}" data-native="${l.native || l.name}">
        <span>${l.flag || '🌐'}</span><span>${l.name}</span><small style="color:var(--text-faint)">${l.code}</small>
      </div>`
    ).join('');
    nResults.querySelectorAll('.lang-result-item').forEach(item => {
      item.addEventListener('click', () => {
        nativeLang = { code: item.dataset.code, name: item.dataset.name, flag: item.dataset.flag, native: item.dataset.native };
        nSearch.value = nativeLang.name;
        nResults.style.display = 'none';
        nChip.innerHTML = `<span class="selected-chip">${nativeLang.flag} ${nativeLang.name}</span>`;
        // Switch UI language immediately (async — re-render after load)
        window.setUiLang(nativeLang.code).then(() => {
          applyLoginLabels();
          // Re-render onboarding texts in the new language
          document.querySelector('.onboarding-card h2').textContent = t('onb_welcome');
          document.querySelector('.onboarding-card > p').textContent = t('onb_native_q');
          document.querySelector('.your-language > label').textContent = t('onb_your_language');
          document.querySelector('.languages-to-learn > label').textContent = t('onb_language_to_learn');
          document.querySelector('.languages-to-learn > input').placeholder = t('onb_search');
          const learnP = document.querySelector('.onboarding-card p[style]');
          if (learnP) learnP.textContent = t('onb_learn_q');
          const startBtn = document.getElementById('onbStartBtn');
          if (startBtn) startBtn.textContent = `${t('onb_start')} →`;
        });
      });
    });

    // Learn search
    const lSearch = document.getElementById('onbLearnSearch');
    const lResults = document.getElementById('onbLearnResults');
    const lChips = document.getElementById('onbLearnChips');

    lSearch.addEventListener('input', () => {
      const q = lSearch.value.trim().toLowerCase();
      const list = (window.WORLD_LANGUAGES || []).filter(l =>
        l.name.toLowerCase().includes(q) || (l.native || '').toLowerCase().includes(q) || l.code.includes(q)
      ).slice(0, 40);
      lResults.style.display = list.length ? '' : 'none';
      lResults.innerHTML = list.map(l =>
        `<div class="lang-result-item" data-code="${l.code}" data-name="${l.name}" data-flag="${l.flag || '🌐'}" data-native="${l.native || l.name}">
        <span>${l.flag || '🌐'}</span><span>${l.name}</span><small style="color:var(--text-faint)">${l.code}</small>
      </div>`
      ).join('');
      lResults.querySelectorAll('.lang-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const code = item.dataset.code;
          if (learnLangs[code]) return;
          learnLangs[code] = { isoCode: code, name: item.dataset.name, flag: item.dataset.flag, nativeName: item.dataset.native };
          lSearch.value = '';
          lResults.style.display = 'none';
          renderLearnChips();
        });
      });
    });

    function renderLearnChips() {
      lChips.innerHTML = Object.values(learnLangs).map(l =>
        `<span class="selected-chip" data-code="${l.isoCode}" title="Click to remove">${l.flag} ${l.name}</span>`
      ).join('');
      lChips.querySelectorAll('.selected-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          delete learnLangs[chip.dataset.code];
          renderLearnChips();
        });
      });
    }

    document.getElementById('onbStartBtn').addEventListener('click', async () => {
      const errEl = document.getElementById('onbError');
      if (!nativeLang) { errEl.textContent = t('onb_error_native'); errEl.classList.remove('hidden'); return; }
      if (!Object.keys(learnLangs).length) { errEl.textContent = t('onb_error_learn'); errEl.classList.remove('hidden'); return; }

      try {
        await saveConfig({ nativeLang: nativeLang.code, uiLang: nativeLang.code });
        for (const l of Object.values(learnLangs)) {
          await api('POST', '/api/languages', l);
        }
        await loadConfig();
        await window.setUiLang(nativeLang.code);
        applyNavLabels();
        document.getElementById('appShell').querySelector('.navbar').style.display = '';
        updateNavLangBadge();
        history.replaceState({ page: 'home' }, '', '#/home');
        navigate('home', {}, true);
      } catch (e) {
        errEl.textContent = e.error || t('app_setup_failed');
        errEl.classList.remove('hidden');
      }
    });
  });
}