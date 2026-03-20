// i18n-loader.js – Must be the FIRST script on every page.
// Loads the correct translation file synchronously before page renders.
(function() {
  var lang = localStorage.getItem("fc_ui_lang") || "en";
  // Supported languages
  var supported = ["en", "fr"];
  if (supported.indexOf(lang) === -1) lang = "en";

  // Write a synchronous script tag so translations are available immediately
  document.write('<script src="/js/i18n/' + lang + '.js"><\/script>');
})();
