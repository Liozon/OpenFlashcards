// nav.js – Shared navbar logic: dark toggle + target lang badge
document.addEventListener("DOMContentLoaded", function() {

  // ── Dark mode toggle ──────────────────────────────────────
  var toggle = document.getElementById("darkToggle");
  if (toggle) {
    toggle.addEventListener("click", function() {
      var isDark = document.documentElement.getAttribute("data-theme") === "dark";
      window.toggleDarkMode(!isDark);
    });
  }

  // ── Target language badge in nav ──────────────────────────
  var badge = document.getElementById("targetLangBadge");
  if (badge) {
    var lang = AppSettings.getTargetLang();
    var langData = window.LANGUAGES[lang];
    if (langData) {
      badge.textContent = langData.flag + " " + langData.label;
    } else {
      var custom = AppSettings.getCustomLang();
      if (custom) badge.textContent = "🌐 " + custom;
    }
  }

  // ── Apply translations ────────────────────────────────────
  window.applyTranslations();
});
