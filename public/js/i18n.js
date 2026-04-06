// i18n.js – Dynamic locale loader for OpenFlashcards
'use strict';

// In-memory cache of loaded locales: { langCode: { key: value, … } }
window._i18nCache = {};

// Currently active locale object
window._i18nStrings = {};

// Active language code
window._uiLang = 'en';

// ─────────────────────────────────────────────────────────────────────────────
// t() — translate a key, fallback to key itself
// ─────────────────────────────────────────────────────────────────────────────
window.t = function(key) {
  return window._i18nStrings[key] || key;
};

// ─────────────────────────────────────────────────────────────────────────────
// loadLocale(langCode) — fetch locale from server (with cache)
// Returns a Promise that resolves when the locale is loaded and active.
// ─────────────────────────────────────────────────────────────────────────────
window.loadLocale = async function(langCode) {
  if (!langCode) langCode = 'en';
  const code = langCode.toLowerCase();

  // Already cached?
  if (window._i18nCache[code]) {
    window._i18nStrings = window._i18nCache[code];
    window._uiLang = code;
    return;
  }

  try {
    const res  = await fetch('/i18n/' + encodeURIComponent(code));
    const data = await res.json();
    const locale = data.locale || {};

    // Cache under both the returned lang and the requested code
    window._i18nCache[code]      = locale;
    window._i18nCache[data.lang] = locale;

    window._i18nStrings = locale;
    window._uiLang = data.lang || code;

    if (data.generated) {
      console.log('[i18n] Auto-generated locale for:', code);
    }
    if (data.fallback) {
      console.warn('[i18n] Locale generation failed, using English fallback for:', code);
    }
  } catch(e) {
    console.error('[i18n] Failed to load locale:', code, e);
    // If we have English already, use it as fallback
    if (window._i18nCache['en']) {
      window._i18nStrings = window._i18nCache['en'];
      window._uiLang = 'en';
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// setUiLang(langCode) — switch active language (loads if needed)
// Returns a Promise — callers should await it before re-rendering UI.
// ─────────────────────────────────────────────────────────────────────────────
window.setUiLang = async function(langCode) {
  if (!langCode) return;
  // Normalize sub-codes: "fr-CH" → "fr", "en-US" → "en"
  const base = langCode.toLowerCase().split('-')[0];
  await window.loadLocale(base);
};

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap: load English immediately (synchronous-looking via inline fetch)
// This is called before app.js runs, so t() is available right away.
// ─────────────────────────────────────────────────────────────────────────────
(function bootstrap() {
  // Kick off English load immediately — we'll await it in app.js boot
  window._i18nReady = window.loadLocale('en');
})();
