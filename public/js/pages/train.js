// pages/train.js
'use strict';

// ── Shared state ─────────────────────────────────────────────────────────────
let _trainMode    = 'word';   // 'word' | 'phrase'
let _trainTypes   = [];       // active word type filters (empty = all)
let _trainCorrect = 0;
let _trainWrong   = 0;
let _trainStreak  = 0;

// ── Phrase state ─────────────────────────────────────────────────────────────
let _curPhrase    = null;
let _answerTokens = [];       // tokens placed in answer zone

function renderTrain(el) {
  const lang = currentLang();
  if (!lang) { navigate('settings'); return; }

  _trainCorrect = 0; _trainWrong = 0; _trainStreak = 0;
  _trainTypes = []; _trainMode = 'word';

  el.innerHTML = `
    <div class="page-title">🎯 Practice</div>

    <!-- Score bar -->
    <div class="score-bar">
      <div class="score-item">✅ <span id="trCorrect">0</span></div>
      <div class="score-item">❌ <span id="trWrong">0</span></div>
      <div class="score-item">🔥 <span id="trStreak">0</span></div>
    </div>

    <!-- Mode selector -->
    <div class="filter-row">
      <button class="type-btn active" id="modeWord"   onclick="setTrainMode('word',this)">📝 Words</button>
      <button class="type-btn"        id="modePhrase" onclick="setTrainMode('phrase',this)">💬 Phrases</button>
    </div>

    <!-- Word type filters (hidden in phrase mode) -->
    <div class="filter-row" id="typeFilters">
      <button class="type-btn active" data-type="" onclick="toggleTypeFilter('',this)">🌍 All</button>
      <button class="type-btn" data-type="noun"      onclick="toggleTypeFilter('noun',this)">📦 Nouns</button>
      <button class="type-btn" data-type="verb"      onclick="toggleTypeFilter('verb',this)">⚡ Verbs</button>
      <button class="type-btn" data-type="adjective" onclick="toggleTypeFilter('adjective',this)">🎨 Adj.</button>
      <button class="type-btn" data-type="adverb"    onclick="toggleTypeFilter('adverb',this)">💨 Adv.</button>
    </div>

    <!-- Quiz area -->
    <div id="quizArea"></div>`;

  loadQuestion();
}

// ── Mode / filter ─────────────────────────────────────────────────────────────
window.setTrainMode = function(mode, btn) {
  _trainMode = mode;
  document.querySelectorAll('#modeWord,#modePhrase').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('typeFilters').style.display = mode === 'word' ? '' : 'none';
  loadQuestion();
};

window.toggleTypeFilter = function(type, btn) {
  if (type === '') {
    // All
    _trainTypes = [];
    document.querySelectorAll('#typeFilters .type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  } else {
    document.querySelector('#typeFilters .type-btn[data-type=""]').classList.remove('active');
    btn.classList.toggle('active');
    const active = [...document.querySelectorAll('#typeFilters .type-btn.active')].map(b => b.dataset.type).filter(Boolean);
    _trainTypes = active;
    if (!active.length) {
      _trainTypes = [];
      document.querySelector('#typeFilters .type-btn[data-type=""]').classList.add('active');
    }
  }
  loadQuestion();
};

// ── Load question ─────────────────────────────────────────────────────────────
async function loadQuestion() {
  if (_trainMode === 'phrase') {
    await loadPhraseQuestion();
  } else {
    await loadWordQuestion();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WORD QUIZ
// ─────────────────────────────────────────────────────────────────────────────
async function loadWordQuestion() {
  const lang  = currentLang();
  const area  = document.getElementById('quizArea');
  area.innerHTML = `<div class="quiz-card"><div class="loading-state"><div class="spinner"></div></div></div>`;

  const typesParam = _trainTypes.length ? '&types=' + _trainTypes.join(',') : '';
  try {
    const q = await api('GET', `/api/quiz?lang=${encodeURIComponent(lang)}&direction=random${typesParam}`);
    renderWordQuiz(q);
  } catch(e) {
    area.innerHTML = `
      <div class="quiz-card">
        <p style="font-size:2rem;margin-bottom:12px">😅</p>
        <p style="color:var(--text-muted)">${e.error || 'Error loading question.'}</p>
        <button class="btn btn-primary" style="margin-top:16px" onclick="loadQuestion()">↺ Retry</button>
      </div>`;
  }
}

function renderWordQuiz(q) {
  const area = document.getElementById('quizArea');
  const typeLabels = { noun:'📦 Noun', verb:'⚡ Verb', adjective:'🎨 Adj.', adverb:'💨 Adv.' };

  area.innerHTML = `
    <div class="quiz-card" id="wordQuizCard">
      <div class="badge badge-${q.type}" style="margin-bottom:12px">${typeLabels[q.type]||q.type}</div>
      <div class="question-word" id="qWord">${esc(q.promptText)}</div>
      ${q.definition ? `<div class="question-def">${esc(q.definition)}</div>` : ''}
      <p class="question-instr">What is the translation?</p>
      <div class="choices-grid" id="choicesGrid"></div>
    </div>`;

  const grid = document.getElementById('choicesGrid');
  q.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = choice;
    btn.addEventListener('click', () => handleWordAnswer(btn, choice, q));
    grid.appendChild(btn);
  });
}

async function handleWordAnswer(btn, answer, q) {
  // Disable all buttons
  document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);

  const correct = answer.trim().toLowerCase() === q.answerText.trim().toLowerCase();

  // Visual feedback
  btn.classList.add(correct ? 'correct' : 'wrong');
  if (!correct) {
    document.querySelectorAll('.choice-btn').forEach(b => {
      if (b.textContent.trim().toLowerCase() === q.answerText.trim().toLowerCase())
        b.classList.add('correct');
    });
  }

  // Submit to server (update difficulty)
  try {
    await api('POST', '/api/quiz/answer', {
      lang: q.langCode, id: q.id, answer, expectedAnswer: q.answerText
    });
  } catch {}

  // Update score
  if (correct) { _trainCorrect++; _trainStreak++; }
  else         { _trainWrong++;   _trainStreak = 0; }
  updateScore();

  // Show next button
  const card = document.getElementById('wordQuizCard');
  const nextRow = document.createElement('div');
  nextRow.style.cssText = 'margin-top:20px;width:100%;max-width:500px';
  nextRow.innerHTML = `
    <div style="margin-bottom:12px;font-weight:700;color:${correct?'var(--primary-dk)':'var(--danger-dk)'}">
      ${correct ? '✓ Correct!' : `✗ The answer was: <em>${esc(q.answerText)}</em>`}
    </div>
    <button class="btn btn-primary btn-full" onclick="loadQuestion()">Next →</button>`;
  card.appendChild(nextRow);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHRASE QUIZ
// ─────────────────────────────────────────────────────────────────────────────
async function loadPhraseQuestion() {
  const lang = currentLang();
  const area = document.getElementById('quizArea');
  area.innerHTML = `<div class="quiz-card"><div class="loading-state"><div class="spinner"></div></div></div>`;
  _answerTokens = [];

  try {
    _curPhrase = await api('GET', `/api/quiz/phrase?lang=${encodeURIComponent(lang)}`);
    renderPhraseQuiz(_curPhrase);
  } catch(e) {
    area.innerHTML = `
      <div class="phrase-card" style="text-align:center">
        <p style="font-size:2rem;margin-bottom:12px">📭</p>
        <p style="color:var(--text-muted)">${e.error || 'No phrases found.'}</p>
        <button class="btn btn-primary" style="margin-top:16px" onclick="navigate('add')">➕ Add phrases</button>
      </div>`;
  }
}

function renderPhraseQuiz(phrase) {
  const area = document.getElementById('quizArea');

  // Build clickable translation words (each word can reveal its translation from word bank if available)
  const transWords = phrase.translation.split(/\s+/);
  const clickableTrans = transWords.map(w => {
    const clean = w.replace(/[^\w]/g,'').toLowerCase();
    return `<span class="phrase-word-clickable" data-word="${esc(w)}" onclick="showWordTip(this,'${esc(clean)}')" title="Click for translation hint">${esc(w)}</span>`;
  }).join(' ');

  area.innerHTML = `
    <div class="phrase-card">
      <div class="badge badge-phrase" style="margin-bottom:12px">💬 Phrase reconstruction</div>
      <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:8px">Reconstruct this sentence:</p>
      <div class="phrase-translation" id="phraseTransEl">${clickableTrans}</div>
      ${phrase.helpNote ? `<p class="phrase-hint">${esc(phrase.helpNote)}</p>` : ''}

      <div class="answer-zone" id="answerZone">
        <span class="answer-zone-placeholder" id="answerPlaceholder">Click words below to build the sentence…</span>
      </div>

      <div class="word-bank" id="wordBank"></div>

      <div id="phraseResultEl" class="phrase-result hidden"></div>

      <div class="phrase-actions">
        <button class="btn btn-primary"   id="checkPhraseBtn" onclick="checkPhraseAnswer()" style="flex:1">Check ✓</button>
        <button class="btn btn-secondary hidden" id="nextPhraseBtn" onclick="loadQuestion()" style="flex:1">Next →</button>
        <button class="btn btn-secondary" onclick="clearPhraseAnswer()" title="Clear" style="padding:12px 16px">↺</button>
      </div>
    </div>`;

  buildWordBank(phrase);
}

function buildWordBank(phrase) {
  const words  = phrase.text.trim().split(/\s+/);
  const tokens = words.map((w, i) => ({ word: w, idx: i }));

  // Add 2–3 distractors
  const distractors = getDistr(phrase.langCode, words);
  distractors.forEach((w, i) => tokens.push({ word: w, idx: 1000 + i, distractor: true }));

  // Shuffle
  tokens.sort(() => Math.random() - 0.5);

  const bank = document.getElementById('wordBank');
  tokens.forEach(tok => {
    const btn = document.createElement('div');
    btn.className = 'word-token';
    btn.dataset.idx  = tok.idx;
    btn.dataset.word = tok.word;
    btn.textContent  = tok.word;
    btn.addEventListener('click', () => addTokenToAnswer(btn));
    bank.appendChild(btn);
  });
}

function addTokenToAnswer(btn) {
  if (btn.classList.contains('used')) return;
  btn.classList.add('used');

  const zone = document.getElementById('answerZone');
  document.getElementById('answerPlaceholder')?.classList.add('hidden');

  const chip = document.createElement('div');
  chip.className = 'word-token in-answer';
  chip.textContent  = btn.dataset.word;
  chip.dataset.idx  = btn.dataset.idx;
  chip.addEventListener('click', () => {
    // Return to bank
    chip.remove();
    btn.classList.remove('used');
    if (!document.querySelectorAll('.in-answer').length) {
      document.getElementById('answerPlaceholder')?.classList.remove('hidden');
    }
  });
  zone.appendChild(chip);
}

window.clearPhraseAnswer = function() {
  document.querySelectorAll('.in-answer').forEach(c => c.remove());
  document.querySelectorAll('.word-token').forEach(b => b.classList.remove('used'));
  document.getElementById('answerPlaceholder')?.classList.remove('hidden');
  document.getElementById('answerZone').className = 'answer-zone';
};

window.checkPhraseAnswer = async function() {
  if (!_curPhrase) return;
  const chips = [...document.querySelectorAll('#answerZone .in-answer')];
  if (!chips.length) return;

  const answer   = chips.map(c => c.textContent).join(' ');
  const expected = _curPhrase.text.trim();
  const correct  = answer.trim().toLowerCase() === expected.trim().toLowerCase();

  const zone      = document.getElementById('answerZone');
  const resultEl  = document.getElementById('phraseResultEl');
  const checkBtn  = document.getElementById('checkPhraseBtn');
  const nextBtn   = document.getElementById('nextPhraseBtn');

  zone.className = 'answer-zone ' + (correct ? 'correct' : 'wrong');
  resultEl.className = 'phrase-result ' + (correct ? 'correct' : 'wrong');
  resultEl.innerHTML = correct
    ? '✓ Correct!'
    : `✗ The answer was: <strong>${esc(expected)}</strong>`;
  resultEl.classList.remove('hidden');
  checkBtn.classList.add('hidden');
  nextBtn.classList.remove('hidden');

  if (correct) { _trainCorrect++; _trainStreak++; }
  else         { _trainWrong++;   _trainStreak = 0; }
  updateScore();

  try {
    await api('POST', '/api/quiz/phrase/answer', {
      lang: _curPhrase.langCode, id: _curPhrase.id, correct
    });
  } catch {}
};

// ── Word tooltip in phrase translation ───────────────────────────────────────
window.showWordTip = async function(el, word) {
  // Remove any existing tooltip
  document.querySelectorAll('.word-tooltip').forEach(t => t.remove());
  const lang = currentLang();
  try {
    const words = await api('GET', `/api/words?lang=${encodeURIComponent(lang)}`);
    const match = words.find(w => w.literal.toLowerCase() === word.toLowerCase());
    const tip = document.createElement('div');
    tip.className = 'word-tooltip';
    tip.textContent = match ? match.translation : '?';
    el.style.position = 'relative';
    el.appendChild(tip);
    setTimeout(() => tip.remove(), 2500);
  } catch {}
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function updateScore() {
  document.getElementById('trCorrect').textContent = _trainCorrect;
  document.getElementById('trWrong').textContent   = _trainWrong;
  document.getElementById('trStreak').textContent  = _trainStreak;
}

function getDistr(langCode, words) {
  const pool = {
    fr: ['le','la','les','un','une','des','et','mais','de','du','est','pas','que','je','tu'],
    en: ['the','a','an','and','but','of','is','are','not','I','you','we','they','in','on'],
    de: ['der','die','das','ein','und','ist','nicht','ich','du','wir','sie','es','in','auf'],
    es: ['el','la','los','un','una','y','de','es','no','yo','tú','que','en','se'],
    it: ['il','la','i','un','e','di','è','non','io','tu','che','in','su','si']
  }[langCode] || ['the','a','and','of','in'];
  const used = new Set(words.map(w => w.toLowerCase()));
  return pool.filter(w => !used.has(w)).slice(0, 3);
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
