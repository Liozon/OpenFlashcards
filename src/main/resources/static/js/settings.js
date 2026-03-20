// settings.js – Settings page logic

document.addEventListener("DOMContentLoaded", function() {

  var darkToggle    = document.getElementById("darkModeToggle");
  var uiLangSelect  = document.getElementById("uiLangSelect");
  var langGrid      = document.getElementById("langGrid");
  var saveBtn       = document.getElementById("saveBtn");
  var savedFeedback = document.getElementById("savedFeedback");

  var selectedTargetLang = AppSettings.getTargetLang();

  // ── Dark mode ──────────────────────────────────────────────
  darkToggle.checked = AppSettings.getDarkMode();
  darkToggle.addEventListener("change", function() {
    window.toggleDarkMode(darkToggle.checked);
  });

  // ── UI language ────────────────────────────────────────────
  uiLangSelect.value = AppSettings.getUiLang();

  // ── Target language grid ───────────────────────────────────
  function buildLangGrid() {
    langGrid.innerHTML = "";
    window.LANGUAGES.forEach(function(lang) {
      var card = document.createElement("div");
      card.className = "lang-card" + (selectedTargetLang === lang.code ? " active" : "");
      card.setAttribute("data-code", lang.code);
      card.innerHTML =
        '<span class="flag">' + lang.flag + '</span>' +
        '<span class="name">' + lang.label + '</span>';
      card.addEventListener("click", function() {
        document.querySelectorAll(".lang-card").forEach(function(c) { c.classList.remove("active"); });
        card.classList.add("active");
        selectedTargetLang = lang.code;
      });
      langGrid.appendChild(card);
    });
  }

  buildLangGrid();

  // ── Save ───────────────────────────────────────────────────
  saveBtn.addEventListener("click", function() {
    AppSettings.set(AppSettings.KEYS.UI_LANG,     uiLangSelect.value);
    AppSettings.set(AppSettings.KEYS.TARGET_LANG, selectedTargetLang);
    AppSettings.set(AppSettings.KEYS.DARK_MODE,   darkToggle.checked ? "1" : "0");

    savedFeedback.textContent = window.t("settings_saved");
    savedFeedback.classList.remove("hidden");

    setTimeout(function() { window.location.reload(); }, 700);
  });
});
