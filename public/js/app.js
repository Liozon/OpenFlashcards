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
  try {
    App.user = await api('GET', '/auth/me');
    return true;
  } catch {
    return false;
  }
}

async function doLogin(username, password) {
  const data = await api('POST', '/auth/login', { username, password });
  App.user = data.user;
}

async function doLogout() {
  await api('POST', '/auth/logout');
  App.user = null;
  App.config = null;
  showLoginScreen();
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
async function loadConfig() {
  App.config = await api('GET', '/api/config');
  applyTheme();
}

async function saveConfig(patch) {
  App.config = (await api('PUT', '/api/config', patch)).config;
  applyTheme();
  updateNavLangBadge();
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
window.navigate = function (page, params) {
  // Close mobile menu
  document.getElementById('navLinks').classList.remove('open');

  App.currentPage = page;

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === page);
  });

  const content = document.getElementById('pageContent');
  content.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading…</p></div>';

  const renderers = {
    home: renderHome,
    vocabulary: renderVocabulary,
    add: renderAdd,
    train: renderTrain,
    settings: renderSettings,
    admin: renderAdmin
  };

  (renderers[page] || renderHome)(content, params || {});
};

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
  // Wait for English locale to be ready before anything renders
  await window._i18nReady;

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
    loginBtn.textContent = 'Signing in…';
    try {
      await doLogin(loginUser.value.trim(), loginPass.value);
      await bootApp();
    } catch (e) {
      loginErr.textContent = e.error || 'Login failed.';
      loginErr.classList.remove('hidden');
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign in →';
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
    await bootApp();
  } else {
    showLoginScreen();
    loginUser.focus();
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// I18N HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function applyNavLabels() {
  const map = {
    navHome: 'nav_home',
    navVocab: 'nav_vocabulary',
    navAdd: 'nav_add',
    navTrain: 'nav_train',
    navSettings: 'nav_settings',
    adminLink: 'nav_admin'
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  });
  // Re-show adminLink if admin (textContent reset clears style only if we set display)
  if (App.user && App.user.role === 'admin') {
    const al = document.getElementById('adminLink');
    if (al) al.style.display = '';
  }
}

function applyLoginLabels() {
  const sub = document.getElementById('loginSub');
  const ul = document.getElementById('loginUserLabel');
  const pl = document.getElementById('loginPassLabel');
  const btn = document.getElementById('loginBtn');
  if (sub) sub.textContent = t('login_title');
  if (ul) ul.textContent = t('login_username');
  if (pl) pl.textContent = t('login_password');
  if (btn) btn.textContent = t('login_btn');
}

async function bootApp() {
  await loadConfig();
  // Apply the user's native language to UI (await so t() keys are ready before render)
  if (App.config && App.config.nativeLang) {
    await window.setUiLang(App.config.nativeLang);
  }
  applyNavLabels();
  showAppShell();

  // Show admin link if admin
  if (App.user.role === 'admin') {
    document.getElementById('adminLink').style.display = '';
  }
  // Admin → direct to admin panel, no onboarding
  if (App.user.role === 'admin') {
    document.getElementById('appShell').querySelector('.navbar').style.display = '';
    navigate('admin');
    return;
  }

  // Regular user: onboarding if no languages configured yet
  if (!App.config.targetLangs || !App.config.targetLangs.length) {
    renderOnboarding(document.getElementById('pageContent'));
    document.getElementById('appShell').querySelector('.navbar').style.display = 'none';
  } else {
    document.getElementById('appShell').querySelector('.navbar').style.display = '';
    updateNavLangBadge();
    navigate('home');
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

        <div class="field-group">
          <label>Your native language</label>
          <input type="text" id="onbNativeSearch" placeholder="Search…" autocomplete="off">
          <div id="onbNativeResults" class="lang-results" style="display:none"></div>
          <div id="onbNativeChip" style="margin-top:8px"></div>
        </div>

        <p style="margin-top:8px">${t('onb_learn_q')}</p>
        <div class="field-group">
          <label>Languages to learn</label>
          <input type="text" id="onbLearnSearch" placeholder="Search…" autocomplete="off">
          <div id="onbLearnResults" class="lang-results" style="display:none"></div>
          <div id="onbLearnChips" class="selected-chips"></div>
        </div>

        <div id="onbError" class="alert alert-danger hidden"></div>
        <button class="btn btn-primary btn-full" id="onbStartBtn">${t('onb_start')}</button>
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
          const learnP = document.querySelector('.onboarding-card p[style]');
          if (learnP) learnP.textContent = t('onb_learn_q');
          const startBtn = document.getElementById('onbStartBtn');
          if (startBtn) startBtn.textContent = t('onb_start');
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
        await saveConfig({ nativeLang: nativeLang.code });
        for (const l of Object.values(learnLangs)) {
          await api('POST', '/api/languages', l);
        }
        await loadConfig();
        await window.setUiLang(nativeLang.code);
        applyNavLabels();
        document.getElementById('appShell').querySelector('.navbar').style.display = '';
        updateNavLangBadge();
        navigate('home');
      } catch (e) {
        errEl.textContent = e.error || 'Setup failed.';
        errEl.classList.remove('hidden');
      }
    });
  });
}
