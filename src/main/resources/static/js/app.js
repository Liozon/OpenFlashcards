// app.js – Core: i18n, dark mode, settings, language config

// ── Supported TARGET languages (what the user is learning) ───────────────
window.LANGUAGES = [
  { code: "fr", label: "Français",    flag: "🇫🇷", pronouns: ["je", "tu", "il/elle", "nous", "vous", "ils/elles"] },
  { code: "en", label: "English",     flag: "🇬🇧", pronouns: ["I", "you", "he/she", "we", "you (pl.)", "they"] },
  { code: "de", label: "Deutsch",     flag: "🇩🇪", pronouns: ["ich", "du", "er/sie/es", "wir", "ihr", "sie/Sie"] },
  { code: "es", label: "Español",     flag: "🇪🇸", pronouns: ["yo", "tú", "él/ella", "nosotros", "vosotros", "ellos"] },
  { code: "it", label: "Italiano",    flag: "🇮🇹", pronouns: ["io", "tu", "lui/lei", "noi", "voi", "loro"] },
  { code: "pt", label: "Português",   flag: "🇵🇹", pronouns: ["eu", "tu", "ele/ela", "nós", "vós", "eles/elas"] },
  { code: "uk", label: "Українська",  flag: "🇺🇦", pronouns: ["я", "ти", "він/вона", "ми", "ви", "вони"] },
  { code: "ja", label: "日本語",       flag: "🇯🇵", pronouns: ["私", "あなた", "彼/彼女", "私たち", "あなたたち", "彼ら"] }
];

function getLangByCode(code) {
  for (var i = 0; i < window.LANGUAGES.length; i++) {
    if (window.LANGUAGES[i].code === code) return window.LANGUAGES[i];
  }
  return window.LANGUAGES[0]; // default FR
}

// ── Settings helpers ──────────────────────────────────────────────────────
window.AppSettings = {
  KEYS: {
    UI_LANG:     "fc_ui_lang",
    TARGET_LANG: "fc_target_lang",
    DARK_MODE:   "fc_dark_mode"
  },
  get: function(key, def) {
    var v = localStorage.getItem(key);
    return v !== null ? v : (def !== undefined ? def : null);
  },
  set: function(key, value) { localStorage.setItem(key, value); },

  getUiLang:     function() { return this.get(this.KEYS.UI_LANG, "en"); },
  getTargetLang: function() { return this.get(this.KEYS.TARGET_LANG, "fr"); },
  getDarkMode:   function() { return this.get(this.KEYS.DARK_MODE, "0") === "1"; },

  getTargetPronouns: function() {
    return getLangByCode(this.getTargetLang()).pronouns;
  },
  getTargetLangData: function() {
    return getLangByCode(this.getTargetLang());
  }
};

// ── Apply dark mode immediately (before paint) ────────────────────────────
(function() {
  if (window.AppSettings.getDarkMode()) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();

// ── Translation helper ────────────────────────────────────────────────────
window.t = function(key) {
  return (window.TRANSLATIONS && window.TRANSLATIONS[key]) ? window.TRANSLATIONS[key] : key;
};

// ── Apply translations to DOM elements with data-i18n / data-i18n-ph ─────
window.applyTranslations = function() {
  document.querySelectorAll("[data-i18n]").forEach(function(el) {
    var val = window.t(el.getAttribute("data-i18n"));
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = val;
    } else {
      el.textContent = val;
    }
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(function(el) {
    el.placeholder = window.t(el.getAttribute("data-i18n-ph"));
  });
};

// ── Dark mode toggle ──────────────────────────────────────────────────────
window.toggleDarkMode = function(on) {
  if (on) {
    document.documentElement.setAttribute("data-theme", "dark");
    AppSettings.set(AppSettings.KEYS.DARK_MODE, "1");
  } else {
    document.documentElement.removeAttribute("data-theme");
    AppSettings.set(AppSettings.KEYS.DARK_MODE, "0");
  }
};

document.addEventListener("DOMContentLoaded", function() {
  window.applyTranslations();
});
