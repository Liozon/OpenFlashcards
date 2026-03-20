// vocabulary.js – Display all saved words with conjugation support

var allWords   = [];
var activeType = "";

var loadingEl = document.getElementById("loadingWords");
var emptyEl   = document.getElementById("emptyState");
var gridEl    = document.getElementById("wordGrid");
var searchEl  = document.getElementById("searchInput");

function loadWords() {
  fetch("/api/words")
    .then(function(res) { return res.json(); })
    .then(function(words) { allWords = words; render(); })
    .catch(function() { loadingEl.innerHTML = "<p>❌ Could not load vocabulary.</p>"; });
}

function render() {
  loadingEl.classList.add("hidden");
  var search = searchEl.value.trim().toLowerCase();

  var filtered = allWords.filter(function(w) {
    var matchType   = !activeType || w.type === activeType;
    var matchSearch = !search || w.literal.toLowerCase().indexOf(search) !== -1 || w.translation.toLowerCase().indexOf(search) !== -1;
    return matchType && matchSearch;
  });

  if (filtered.length === 0) {
    gridEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  gridEl.classList.remove("hidden");

  gridEl.innerHTML = filtered.map(function(w) {
    var typeLabels  = { noun: window.t("type_noun"), verb: window.t("type_verb"), adjective: window.t("type_adjective"), adverb: window.t("type_adverb") };
    var typeClasses = { noun: "badge-noun", verb: "badge-verb", adjective: "badge-adjective", adverb: "badge-adverb" };

    var display = (w.article && w.article.trim()) ? (w.article + " " + w.literal) : w.literal;
    if (w.type === "verb" && w.infinitive) display = w.infinitive;

    // Conjugation rows for verbs
    var conjHtml = "";
    if (w.type === "verb" && w.conjugation && Object.keys(w.conjugation).length > 0) {
      var rows = Object.keys(w.conjugation).map(function(pron) {
        return '<span><span class="pron">' + esc(pron) + '</span> ' + esc(w.conjugation[pron]) + '</span>';
      }).join("");
      conjHtml = '<div class="word-card-conjugation">' + rows + '</div>';
    }

    return '<div class="word-card fade-in">' +
      '<div class="word-card-type"><span class="word-type-badge ' + (typeClasses[w.type] || "") + '">' + (typeLabels[w.type] || w.type) + '</span></div>' +
      '<div class="word-card-literal">' + esc(display) + '</div>' +
      '<div class="word-card-translation">' + esc(w.translation) + '</div>' +
      (w.helpPhrase ? '<div class="word-card-hint">' + esc(w.helpPhrase) + '</div>' : '') +
      conjHtml +
    '</div>';
  }).join("");
}

document.querySelectorAll(".filter-selector .type-btn").forEach(function(btn) {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".filter-selector .type-btn").forEach(function(b) { b.classList.remove("active"); });
    btn.classList.add("active");
    activeType = btn.getAttribute("data-type");
    render();
  });
});

searchEl.addEventListener("input", render);

function esc(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

loadWords();
