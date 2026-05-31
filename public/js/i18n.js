// i18n.js – Locale loader for OpenFlashcards
'use strict';

window._i18nCache   = {};
window._i18nStrings = {};
window._uiLang      = 'en';

window.t = function (key) {
  return window._i18nStrings[key] || key;
};

// ── Core locale loader ───────────────────────────────────────────────────────
// Tries network first; on failure, falls back to IDB bundle (offline-db.js
// populates window._offlineLocaleBundle during its own boot, before this runs).
window.loadLocale = async function (langCode) {
  if (!langCode) langCode = 'en';
  const code = langCode.toLowerCase().split('-')[0];

  // Already in memory cache
  if (window._i18nCache[code]) {
    window._i18nStrings = window._i18nCache[code];
    window._uiLang      = code;
    return;
  }

  // Try network
  if (navigator.onLine) {
    try {
      const res    = await fetch('/i18n/' + encodeURIComponent(code));
      const data   = await res.json();
      const locale = data.locale || {};
      window._i18nCache[code]      = locale;
      window._i18nCache[data.lang] = locale;
      window._i18nStrings = locale;
      window._uiLang      = data.lang || code;
      if (data.fallback) console.warn('[i18n] No locale for:', code, '– using EN fallback.');
      return;
    } catch (e) {
      console.warn('[i18n] Network load failed for:', code, e);
    }
  }

  // Offline fallback: IDB bundle locales
  // offline-db.js exposes window._offlineLocaleBundle once IDB is ready,
  // OR we read it synchronously from the pre-populated cache set by offline-db.js boot.
  const bundleLocales = window._offlineLocaleBundle;
  if (bundleLocales) {
    const locale = bundleLocales[code] || bundleLocales[code.split('-')[0]] || bundleLocales['en'];
    if (locale) {
      window._i18nCache[code]  = locale;
      window._i18nStrings      = locale;
      window._uiLang           = code;
      return;
    }
  }

  // Last resort: already-cached English
  if (window._i18nCache['en']) {
    window._i18nStrings = window._i18nCache['en'];
    window._uiLang      = 'en';
  }
};

window.setUiLang = async function (langCode) {
  if (!langCode) return;
  await window.loadLocale(langCode.toLowerCase().split('-')[0]);
};

// ── Bootstrap ────────────────────────────────────────────────────────────────
// _i18nReady resolves once the initial locale is loaded.
// offline-db.js will have set window._offlineLocaleBundle before this runs
// if the IDB read was fast enough (it's triggered at script parse time).
window._i18nReady = (async () => {
  // Give offline-db.js a tick to populate _offlineLocaleBundle from IDB
  await new Promise(r => setTimeout(r, 0));
  await window.loadLocale('en');
})();
