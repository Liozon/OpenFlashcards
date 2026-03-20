// add.js – Unified word addition form with verb conjugation + i18n

var typeButtons    = document.querySelectorAll(".type-btn");
var wordTypeInput  = document.getElementById("wordType");
var articleGroup   = document.getElementById("articleGroup");
var infinitiveGroup = document.getElementById("infinitiveGroup");
var conjugationSection = document.getElementById("conjugationSection");
var conjugationGrid    = document.getElementById("conjugationGrid");
var form           = document.getElementById("addWordForm");
var feedback       = document.getElementById("feedback");
var submitBtn      = document.getElementById("submitBtn");

// ── Build conjugation grid based on target language pronouns ──
function buildConjugationGrid() {
  var pronouns = window.AppSettings.getTargetPronouns();
  conjugationGrid.innerHTML = "";
  pronouns.forEach(function(pronoun, idx) {
    var row = document.createElement("div");
    row.className = "conjugation-row";

    var label = document.createElement("span");
    label.className = "pronoun";
    label.textContent = pronoun;

    var input = document.createElement("input");
    input.type = "text";
    input.name = "conj_" + idx;
    input.id   = "conj_" + idx;
    input.autocomplete = "off";
    input.placeholder = pronoun + "…";

    row.appendChild(label);
    row.appendChild(input);
    conjugationGrid.appendChild(row);
  });
}

// ── Type selector ─────────────────────────────────────────────
typeButtons.forEach(function(btn) {
  btn.addEventListener("click", function() {
    typeButtons.forEach(function(b) { b.classList.remove("active"); });
    btn.classList.add("active");

    var type = btn.getAttribute("data-type");
    wordTypeInput.value = type;

    // Show/hide contextual fields
    articleGroup.style.display   = (type === "noun")  ? "flex" : "none";
    infinitiveGroup.classList.toggle("hidden", type !== "verb");
    conjugationSection.classList.toggle("hidden", type !== "verb");

    // Rebuild pronouns grid when switching to verb
    if (type === "verb") buildConjugationGrid();

    clearFeedback();
  });
});

// Init: show article group for default "noun"
articleGroup.style.display = "flex";
infinitiveGroup.classList.add("hidden");
conjugationSection.classList.add("hidden");

// ── Form submit ───────────────────────────────────────────────
form.addEventListener("submit", function(e) {
  e.preventDefault();

  var type        = wordTypeInput.value;
  var literal     = document.getElementById("literal").value.trim();
  var translation = document.getElementById("translation").value.trim();
  var helpPhrase  = document.getElementById("helpPhrase").value.trim();
  var article     = document.getElementById("article").value.trim();
  var infinitive  = document.getElementById("infinitive") ? document.getElementById("infinitive").value.trim() : "";

  if (!literal || !translation) {
    showFeedback("error", window.t("add_error_required"));
    return;
  }

  // Collect conjugation if verb
  var conjugation = {};
  if (type === "verb") {
    var pronouns = window.AppSettings.getTargetPronouns();
    pronouns.forEach(function(pronoun, idx) {
      var inp = document.getElementById("conj_" + idx);
      if (inp && inp.value.trim()) {
        conjugation[pronoun] = inp.value.trim();
      }
    });
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "…";

  fetch("/api/words", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: type,
      literal: literal,
      translation: translation,
      helpPhrase: helpPhrase,
      article: article,
      infinitive: infinitive,
      conjugation: conjugation
    })
  })
  .then(function(res) { return res.json().then(function(d) { return { ok: res.ok, data: d }; }); })
  .then(function(r) {
    if (r.ok) {
      showFeedback("success", r.data.message);
      // Reset fields
      document.getElementById("literal").value = "";
      document.getElementById("translation").value = "";
      document.getElementById("helpPhrase").value = "";
      document.getElementById("article").value = "";
      if (document.getElementById("infinitive")) document.getElementById("infinitive").value = "";
      // Reset conjugation inputs
      document.querySelectorAll("#conjugationGrid input").forEach(function(i) { i.value = ""; });
      document.getElementById("literal").focus();
    } else {
      showFeedback("error", r.data.error || "Error");
    }
  })
  .catch(function() { showFeedback("error", "❌ Server error."); })
  .finally(function() {
    submitBtn.disabled = false;
    submitBtn.textContent = window.t("add_btn_submit");
  });
});

function showFeedback(type, msg) {
  feedback.className = "feedback " + type;
  feedback.textContent = msg;
}
function clearFeedback() {
  feedback.className = "feedback hidden";
  feedback.textContent = "";
}
