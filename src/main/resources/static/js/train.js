// train.js – Duolingo-style training mode with i18n

var currentQuestion = null;
var selectedType    = "";
var correctCount    = 0;
var wrongCount      = 0;
var streak          = 0;
var answered        = false;

var loadingState  = document.getElementById("loadingState");
var errorState    = document.getElementById("errorState");
var questionState = document.getElementById("questionState");
var resultState   = document.getElementById("resultState");
var errorMessage  = document.getElementById("errorMessage");
var wordTypeBadge = document.getElementById("wordTypeBadge");
var questionWord  = document.getElementById("questionWord");
var questionHint  = document.getElementById("questionHint");
var choicesGrid   = document.getElementById("choicesGrid");
var resultIcon    = document.getElementById("resultIcon");
var resultMessage = document.getElementById("resultMessage");
var resultAnswer  = document.getElementById("resultAnswer");

// ── Type filter ───────────────────────────────────────────────
document.querySelectorAll(".filter-selector .type-btn").forEach(function(btn) {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".filter-selector .type-btn").forEach(function(b) { b.classList.remove("active"); });
    btn.classList.add("active");
    selectedType = btn.getAttribute("data-type");
    loadQuestion();
  });
});

// ── Load question ─────────────────────────────────────────────
function loadQuestion() {
  answered = false;
  showState("loading");

  var url = selectedType ? ("/api/quiz?type=" + encodeURIComponent(selectedType)) : "/api/quiz";

  fetch(url)
    .then(function(res) { return res.json().then(function(d) { return { ok: res.ok, data: d }; }); })
    .then(function(r) {
      if (!r.ok) { showError(r.data.error || window.t("train_need_more")); return; }
      currentQuestion = r.data;
      renderQuestion(r.data);
      showState("question");
    })
    .catch(function() { showError("❌ Server error."); });
}

// ── Render question ───────────────────────────────────────────
function renderQuestion(q) {
  var typeLabels  = { noun: window.t("add_type_noun"), verb: window.t("add_type_verb"), adjective: window.t("add_type_adjective"), adverb: window.t("add_type_adverb") };
  var typeClasses = { noun: "badge-noun", verb: "badge-verb", adjective: "badge-adjective", adverb: "badge-adverb" };

  wordTypeBadge.textContent = typeLabels[q.wordType] || q.wordType;
  wordTypeBadge.className   = "word-type-badge " + (typeClasses[q.wordType] || "");

  var display = (q.article && q.article.trim()) ? (q.article + " " + q.literal) : q.literal;
  // Show infinitive for verbs if available
  if (q.wordType === "verb" && q.infinitive) display = q.infinitive;

  questionWord.textContent = display;
  questionHint.textContent = q.helpPhrase || "";

  choicesGrid.innerHTML = "";
  q.choices.forEach(function(choice) {
    var btn = document.createElement("button");
    btn.className   = "choice-btn";
    btn.textContent = choice;
    btn.addEventListener("click", function() { handleChoice(btn, choice); });
    choicesGrid.appendChild(btn);
  });
}

// ── Handle choice ─────────────────────────────────────────────
function handleChoice(btn, answer) {
  if (answered) return;
  answered = true;
  document.querySelectorAll(".choice-btn").forEach(function(b) { b.disabled = true; });

  fetch("/api/quiz/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wordId: currentQuestion.wordId, answer: answer })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    document.querySelectorAll(".choice-btn").forEach(function(b) {
      if (b.textContent === currentQuestion.correctAnswer) {
        b.classList.add("correct");
        if (data.correct) b.classList.add("bounce");
      }
    });
    if (!data.correct) { btn.classList.add("wrong"); btn.classList.add("shake"); }

    if (data.correct) { correctCount++; streak++; } else { wrongCount++; streak = 0; }
    updateScoreBar();

    setTimeout(function() { showResult(data.correct, data.correctAnswer); }, 900);
  })
  .catch(function() {
    answered = false;
    document.querySelectorAll(".choice-btn").forEach(function(b) { b.disabled = false; });
  });
}

function showResult(correct, correctAnswer) {
  resultState.className = correct ? "result-correct" : "result-wrong";
  resultIcon.textContent    = correct ? "🎉" : "😕";
  resultMessage.textContent = correct ? window.t("train_good") : window.t("train_bad");
  resultAnswer.textContent  = correct ? "" : (window.t("train_answer") + " \"" + correctAnswer + "\"");
  showState("result");
}

function updateScoreBar() {
  document.getElementById("correctCount").textContent = correctCount;
  document.getElementById("wrongCount").textContent   = wrongCount;
  document.getElementById("streak").textContent       = streak;
}

function showState(state) {
  loadingState.classList.add("hidden");
  errorState.classList.add("hidden");
  questionState.classList.add("hidden");
  resultState.classList.add("hidden");
  if (state === "loading")  loadingState.classList.remove("hidden");
  if (state === "error")    errorState.classList.remove("hidden");
  if (state === "question") { questionState.classList.remove("hidden"); questionState.classList.add("fade-in"); }
  if (state === "result")   { resultState.classList.remove("hidden");   resultState.classList.add("fade-in"); }
}

function showError(msg) { errorMessage.textContent = msg; showState("error"); }

document.addEventListener("keydown", function(e) {
  if (e.key === "Enter" && !resultState.classList.contains("hidden")) { loadQuestion(); return; }
  var choices = document.querySelectorAll(".choice-btn");
  var idx = parseInt(e.key) - 1;
  if (!isNaN(idx) && idx >= 0 && idx < choices.length && !answered) choices[idx].click();
});

loadQuestion();
