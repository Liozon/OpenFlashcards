// i18n.js – Locale loader for OpenFlashcards
'use strict';

window._i18nCache = {};
window._i18nStrings = {};
window._uiLang = 'en';

window.t = function(key) {
  return window._i18nStrings[key] || key;
};

window.loadLocale = async function(langCode) {
  if (!langCode) langCode = 'en';
  const code = langCode.toLowerCase();

  if (window._i18nCache[code]) {
    window._i18nStrings = window._i18nCache[code];
    window._uiLang = code;
    return;
  }

  try {
    const res  = await fetch('/i18n/' + encodeURIComponent(code));
    const data = await res.json();
    const locale = data.locale || {};

    window._i18nCache[code]      = locale;
    window._i18nCache[data.lang] = locale;
    window._i18nStrings = locale;
    window._uiLang = data.lang || code;

    if (data.fallback) {
      console.warn('[i18n] No locale file found for:', code, '— using English fallback.');
    }
  } catch(e) {
    console.error('[i18n] Failed to load locale:', code, e);
    if (window._i18nCache['en']) {
      window._i18nStrings = window._i18nCache['en'];
      window._uiLang = 'en';
    }
  }
};

window.setUiLang = async function(langCode) {
  if (!langCode) return;
  const base = langCode.toLowerCase().split('-')[0];
  await window.loadLocale(base);
};

(function bootstrap() {
  window._i18nReady = window.loadLocale('en');
})();
