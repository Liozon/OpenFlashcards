// pages/train.js
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let _trainMode = 'word';   // 'word' | 'phrase'
let _trainTypes = [];       // word type filters (empty = all)
let _trainDirection = 'random'; // 'random' | 'target→native' | 'native→target'
let _trainCorrect = 0;
let _trainWrong = 0;
let _trainStreak = 0;
let _curPhrase = null;

// ── Render page ───────────────────────────────────────────────────────────────
function renderTrain(el) {
  const lang = currentLang();
  if (!lang) { navigate('settings'); return; }

  _trainCorrect = 0; _trainWrong = 0; _trainStreak = 0;
  _trainTypes = []; _trainMode = 'word'; _trainDirection = 'random';

  const ld = currentLangData();
  const nativeLang = (App.config && App.config.nativeLang) || 'en';
  const targetName = ld ? (ld.flag || '') + ' ' + ld.name : lang.toUpperCase();

  el.innerHTML =
    '<div class="page-title">' + t('train_title') + '</div>' +

    // Score bar
    '<div class="score-bar">' +
    '<div class="score-item">✅ <span id="trCorrect">0</span></div>' +
    '<div class="score-item">❌ <span id="trWrong">0</span></div>' +
    '<div class="score-item">🔥 <span id="trStreak">0</span></div>' +
    '</div>' +

    // Mode selector
    '<div class="filter-row">' +
    '<button class="type-btn active" id="modeWord"   onclick="setTrainMode(\'word\',this)">' + t('train_words') + '</button>' +
    '<button class="type-btn"        id="modePhrase" onclick="setTrainMode(\'phrase\',this)">' + t('train_phrases') + '</button>' +
    '</div>' +

    // Word type filters
    '<div class="filter-row" id="typeFilters">' +
    '<button class="type-btn active" data-type="" onclick="toggleTypeFilter(\'\',this)">' + t('train_all') + '</button>' +
    '<button class="type-btn" data-type="noun"      onclick="toggleTypeFilter(\'noun\',this)">📦 ' + t('add_type_noun').replace('📦 ', '') + '</button>' +
    '<button class="type-btn" data-type="verb"      onclick="toggleTypeFilter(\'verb\',this)">⚡ ' + t('add_type_verb').replace('⚡ ', '') + '</button>' +
    '<button class="type-btn" data-type="adjective" onclick="toggleTypeFilter(\'adjective\',this)">🎨 ' + t('add_type_adj').replace('🎨 ', '') + '</button>' +
    '<button class="type-btn" data-type="adverb"    onclick="toggleTypeFilter(\'adverb\',this)">💨 ' + t('add_type_adv').replace('💨 ', '') + '</button>' +
    '</div>' +

    // Direction selector (word mode only)
    '<div class="filter-row" id="dirFilters">' +
    '<button class="type-btn active" data-dir="random"          onclick="setTrainDir(\'random\',this)">🔀 ' + t('train_dir_random') + '</button>' +
    '<button class="type-btn"        data-dir="native→target"   onclick="setTrainDir(\'native→target\',this)">🌐→' + targetName + '</button>' +
    '<button class="type-btn"        data-dir="target→native"   onclick="setTrainDir(\'target→native\',this)">' + targetName + '→🌐</button>' +
    '</div>' +

    // Quiz area
    '<div id="quizArea"></div>';

  loadQuestion();
}

// ── Mode / filter / direction ─────────────────────────────────────────────────
window.setTrainMode = function (mode, btn) {
  _trainMode = mode;
  document.querySelectorAll('#modeWord,#modePhrase').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('typeFilters').style.display = mode === 'word' ? '' : 'none';
  document.getElementById('dirFilters').style.display = mode === 'word' ? '' : 'none';
  loadQuestion();
};

window.toggleTypeFilter = function (type, btn) {
  if (type === '') {
    _trainTypes = [];
    document.querySelectorAll('#typeFilters .type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  } else {
    document.querySelector('#typeFilters .type-btn[data-type=""]').classList.remove('active');
    btn.classList.toggle('active');
    const active = [...document.querySelectorAll('#typeFilters .type-btn.active')]
      .map(b => b.dataset.type).filter(Boolean);
    _trainTypes = active;
    if (!active.length) {
      _trainTypes = [];
      document.querySelector('#typeFilters .type-btn[data-type=""]').classList.add('active');
    }
  }
  loadQuestion();
};

window.setTrainDir = function (dir, btn) {
  _trainDirection = dir;
  document.querySelectorAll('#dirFilters .type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadQuestion();
};

// ── Router ────────────────────────────────────────────────────────────────────
async function loadQuestion() {
  _trainMode === 'phrase' ? await loadPhraseQuestion() : await loadWordQuestion();
}

// ─────────────────────────────────────────────────────────────────────────────
// WORD QUIZ
// ─────────────────────────────────────────────────────────────────────────────
async function loadWordQuestion() {
  const lang = currentLang();
  const area = document.getElementById('quizArea');
  area.innerHTML = '<div class="quiz-card"><div class="loading-state"><div class="spinner"></div></div></div>';

  // Map UI direction to API direction param
  const dirMap = { 'random': 'random', 'native→target': 'native', 'target→native': 'target' };
  const apiDir = dirMap[_trainDirection] || 'random';
  const typesParam = _trainTypes.length ? '&types=' + _trainTypes.join(',') : '';

  try {
    const q = await api('GET', '/api/quiz?lang=' + encodeURIComponent(lang) + '&direction=' + apiDir + typesParam);
    renderWordQuiz(q);
  } catch (e) {
    area.innerHTML =
      '<div class="quiz-card">' +
      '<p style="font-size:2rem;margin-bottom:12px">😅</p>' +
      '<p style="color:var(--text-muted)">' + (e.error || 'Error loading question.') + '</p>' +
      '<button class="btn btn-primary" style="margin-top:16px" onclick="loadQuestion()">' + t('train_retry') + '</button>' +
      '</div>';
  }
}

function renderWordQuiz(q) {
  const area = document.getElementById('quizArea');
  const typeLabels = { noun: t('vocab_noun'), verb: t('vocab_verb'), adjective: t('vocab_adjective'), adverb: t('vocab_adverb') };
  const lang = currentLang();

  // Direction label
  const nativeLang = (App.config && App.config.nativeLang) || 'en';
  const dirLabel = q.showNative
    ? '<span style="font-size:.8rem;color:var(--text-faint)">' + nativeLang.toUpperCase() + ' → ' + lang.toUpperCase() + '</span>'
    : '<span style="font-size:.8rem;color:var(--text-faint)">' + lang.toUpperCase() + ' → ' + nativeLang.toUpperCase() + '</span>';

  // Verb group secondary info
  const verbGroupBadge = (q.type === 'verb' && q.verbGroup)
    ? '<span style="font-size:.78rem;color:var(--text-faint);background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:2px 8px;margin-left:4px">📚 ' + esc(q.verbGroup) + '</span>'
    : '';

  area.innerHTML =
    '<div class="quiz-card" id="wordQuizCard">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;justify-content:center;flex-wrap:wrap">' +
    '<div class="badge badge-' + q.type + '">' + (typeLabels[q.type] || q.type) + '</div>' +
    verbGroupBadge +
    dirLabel +
    '</div>' +
    '<div class="question-word" id="qWord">' + esc(q.promptText) + '</div>' +
    (q.definition ? '<div class="question-def">' + esc(q.definition) + '</div>' : '') +
    '<p class="question-instr">' + t('train_question') + '</p>' +
    '<div class="choices-grid" id="choicesGrid"></div>' +
    '</div>';

  // TTS button for the prompt word (always speaks the target-lang word)
  const wordEl = document.getElementById('qWord');
  const ttsWord = q.showNative ? q.answerText : q.promptText;
  wordEl.appendChild(document.createTextNode(' '));
  wordEl.appendChild(TTS.button(ttsWord, lang));

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
  document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);

  const correct = answer.trim().toLowerCase() === q.answerText.trim().toLowerCase();
  btn.classList.add(correct ? 'correct' : 'wrong');
  if (!correct) {
    document.querySelectorAll('.choice-btn').forEach(b => {
      if (b.textContent.trim().toLowerCase() === q.answerText.trim().toLowerCase())
        b.classList.add('correct');
    });
  }

  try { await api('POST', '/api/quiz/answer', { lang: q.langCode, id: q.id, answer, expectedAnswer: q.answerText }); } catch { }

  if (correct) { _trainCorrect++; _trainStreak++; } else { _trainWrong++; _trainStreak = 0; }
  updateScore();

  // Auto-speak correct answer
  TTS.speak(q.showNative ? q.answerText : q.promptText, q.langCode);

  // Show declensions if available (as a memory aid after answering)
  const card = document.getElementById('wordQuizCard');
  if (q.declensions && Object.keys(q.declensions).length > 0) {
    const langData = (App.config.targetLangs || []).find(l => l.isoCode === q.langCode) || {};
    const cfgDeclensions = langData.declensions || [];
    const declRows = Object.entries(q.declensions).map(([i, d]) => {
      const cfgD = cfgDeclensions[+i] || {};
      const label = cfgD.nativeName || d.nativeName || ('Case ' + (+i + 2));
      return `<div style="display:flex;gap:10px;font-size:.85rem;padding:3px 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--text-muted);min-width:100px">${esc(label)}</span>
        <span style="font-weight:600">${esc(d.value)}</span>
      </div>`;
    }).join('');
    const declBox = document.createElement('div');
    declBox.style.cssText = 'margin-top:14px;padding:12px;background:var(--surface-2);border-radius:10px;border:1px solid var(--border)';
    declBox.innerHTML =
      '<div style="font-size:.8rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">📐 Declensions</div>' +
      '<div style="font-size:.85rem;padding:3px 0;border-bottom:1px solid var(--border);margin-bottom:4px;display:flex;gap:10px">' +
      '<span style="color:var(--text-muted);min-width:100px">Nominative</span>' +
      '<span style="font-weight:600">' + esc(q.literal) + '</span>' +
      '</div>' +
      declRows;
    card.appendChild(declBox);
  }

  const nextRow = document.createElement('div');
  nextRow.style.cssText = 'margin-top:20px;width:100%;max-width:500px;text-align:center';
  nextRow.innerHTML =
    '<div style="margin-bottom:12px;font-weight:700;color:' + (correct ? 'var(--primary-dk)' : 'var(--danger-dk)') + '">' +
    (correct ? t('train_correct_msg') : t('train_wrong_msg') + ' <em>' + esc(q.answerText) + '</em>') +
    '</div>' +
    '<button class="btn btn-primary btn-full" onclick="loadQuestion()">' + t('train_next') + '</button>';
  card.appendChild(nextRow);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHRASE QUIZ
// ─────────────────────────────────────────────────────────────────────────────
async function loadPhraseQuestion() {
  const lang = currentLang();
  const area = document.getElementById('quizArea');
  area.innerHTML = '<div class="quiz-card"><div class="loading-state"><div class="spinner"></div></div></div>';
  _curPhrase = null;

  try {
    _curPhrase = await api('GET', '/api/quiz/phrase?lang=' + encodeURIComponent(lang));
    renderPhraseQuiz(_curPhrase);
  } catch (e) {
    area.innerHTML =
      '<div class="phrase-card" style="text-align:center">' +
      '<p style="font-size:2rem;margin-bottom:12px">📭</p>' +
      '<p style="color:var(--text-muted)">' + (e.error || t('train_no_phrases')) + '</p>' +
      '<button class="btn btn-primary" style="margin-top:16px" onclick="navigate(\'add\')">' + t('train_add_phrases') + '</button>' +
      '</div>';
  }
}

function renderPhraseQuiz(phrase) {
  const area = document.getElementById('quizArea');
  const lang = currentLang();
  const nativeLang = (App.config && App.config.nativeLang) || 'en';

  // Clickable words in the translation (native lang sentence shown to user)
  const transWords = phrase.translation.split(/\s+/);
  const clickableTrans = transWords.map(w => {
    const clean = w.replace(/[^\wÀ-ÿ]/g, '').toLowerCase();
    return '<span class="phrase-word-clickable" data-word="' + esc(w) + '" data-clean="' + esc(clean) + '">' + esc(w) + '</span>';
  }).join(' ');

  area.innerHTML =
    '<div class="phrase-card">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">' +
    '<div class="badge badge-phrase">💬 ' + t('train_phrases') + '</div>' +
    '<span style="font-size:.8rem;color:var(--text-faint)">' + nativeLang.toUpperCase() + ' → ' + lang.toUpperCase() + '</span>' +
    '</div>' +
    '<p style="color:var(--text-muted);font-size:.9rem;margin-bottom:8px">' + t('train_reconstruct') + '</p>' +
    '<div class="phrase-translation" id="phraseTransEl">' + clickableTrans + '</div>' +
    (phrase.helpNote ? '<p class="phrase-hint">' + esc(phrase.helpNote) + '</p>' : '') +

    '<div class="answer-zone" id="answerZone">' +
    '<span class="answer-zone-placeholder" id="answerPlaceholder">' + t('train_placeholder') + '</span>' +
    '</div>' +
    '<div class="word-bank" id="wordBank"></div>' +
    '<div id="phraseResultEl" class="phrase-result hidden"></div>' +
    '<div class="phrase-actions">' +
    '<button class="btn btn-primary"            id="checkPhraseBtn" onclick="checkPhraseAnswer()" style="flex:1">' + t('train_check') + '</button>' +
    '<button class="btn btn-secondary hidden"   id="nextPhraseBtn"  onclick="loadQuestion()"      style="flex:1">' + t('train_next') + '</button>' +
    '<button class="btn btn-secondary" onclick="clearPhraseAnswer()" title="Clear" style="padding:12px 16px">' + t('train_clear') + '</button>' +
    '</div>' +
    '</div>';

  // Wire TTS button next to the translation display
  const transEl = document.getElementById('phraseTransEl');
  transEl.appendChild(document.createTextNode(' '));
  transEl.appendChild(TTS.button(phrase.translation, nativeLang));

  // Wire tooltip clicks — load words list once
  loadWordsForTooltips(lang, phrase);

  buildWordBank(phrase);
}

// ── Word tooltips: click a word in the translation to see its target-lang form ──
async function loadWordsForTooltips(lang, phrase) {
  let wordBank = [];
  try { wordBank = await api('GET', '/api/words?lang=' + encodeURIComponent(lang)); } catch { }

  document.querySelectorAll('#phraseTransEl .phrase-word-clickable').forEach(span => {
    span.title = t('train_click_hint');
    span.addEventListener('click', () => {
      // Remove existing tooltips
      document.querySelectorAll('.word-tooltip').forEach(t => t.remove());

      const clean = span.dataset.clean || span.textContent.replace(/[^\wÀ-ÿ]/g, '').toLowerCase();

      // 1. Try exact match in word bank
      let found = wordBank.find(w =>
        w.literal.toLowerCase() === clean ||
        (w.infinitive && w.infinitive.toLowerCase() === clean)
      );

      // 2. Try partial / stem match (handles "mange" → "manger")
      if (!found) {
        found = wordBank.find(w =>
          clean.startsWith(w.literal.toLowerCase().slice(0, 4)) ||
          w.literal.toLowerCase().startsWith(clean.slice(0, 4))
        );
      }

      const tipText = found ? found.literal + ' = ' + found.translation : null;

      // 3. Always show Google Translate TTS for the clicked word + tooltip
      showTooltip(span, tipText, clean, lang);
    });
  });
}

function showTooltip(el, text, word, langCode) {
  const tip = document.createElement('div');
  tip.className = 'word-tooltip';

  if (text) {
    tip.textContent = text;
  } else {
    // No match in local bank → show word with TTS and fallback message
    tip.textContent = '?  (click 🔊)';
  }

  // TTS button inside tooltip
  const ttsBtn = TTS.button(word, langCode, 'margin-left:6px;padding:2px 6px;font-size:.8rem;');
  tip.style.display = 'flex';
  tip.style.alignItems = 'center';
  tip.style.gap = '4px';
  tip.appendChild(ttsBtn);

  el.style.position = 'relative';
  el.appendChild(tip);
  setTimeout(() => tip.remove(), 4000);

  // Auto-play TTS for the clicked word
  TTS.speak(word, langCode);
}

function buildWordBank(phrase) {
  const words = phrase.text.trim().split(/\s+/);
  const tokens = words.map((w, i) => ({ word: w, idx: i }));
  const distractors = getDistr(phrase.langCode, words);
  distractors.forEach((w, i) => tokens.push({ word: w, idx: 1000 + i }));
  tokens.sort(() => Math.random() - 0.5);

  const bank = document.getElementById('wordBank');
  tokens.forEach(tok => {
    const btn = document.createElement('div');
    btn.className = 'word-token';
    btn.dataset.idx = tok.idx;
    btn.dataset.word = tok.word;
    btn.textContent = tok.word;
    btn.addEventListener('click', () => addTokenToAnswer(btn));
    bank.appendChild(btn);
  });
}

function addTokenToAnswer(btn) {
  if (btn.classList.contains('used')) return;
  btn.classList.add('used');

  const zone = document.getElementById('answerZone');
  document.getElementById('answerPlaceholder').style.display = 'none';

  const chip = document.createElement('div');
  chip.className = 'word-token in-answer';
  chip.textContent = btn.dataset.word;
  chip.dataset.idx = btn.dataset.idx;
  chip.addEventListener('click', () => {
    chip.remove();
    btn.classList.remove('used');
    const remaining = document.querySelectorAll('#answerZone .in-answer');
    if (!remaining.length) document.getElementById('answerPlaceholder').style.display = '';
  });
  zone.appendChild(chip);
}

window.clearPhraseAnswer = function () {
  document.querySelectorAll('#answerZone .in-answer').forEach(c => c.remove());
  document.querySelectorAll('#wordBank .word-token').forEach(b => b.classList.remove('used'));
  const ph = document.getElementById('answerPlaceholder');
  if (ph) ph.style.display = '';
  const zone = document.getElementById('answerZone');
  if (zone) zone.className = 'answer-zone';
};

window.checkPhraseAnswer = async function () {
  if (!_curPhrase) return;
  const chips = [...document.querySelectorAll('#answerZone .in-answer')];
  if (!chips.length) return;

  const answer = chips.map(c => c.textContent).join(' ');
  const expected = _curPhrase.text.trim();
  const correct = answer.trim().toLowerCase() === expected.trim().toLowerCase();

  document.getElementById('answerZone').className = 'answer-zone ' + (correct ? 'correct' : 'wrong');

  const resultEl = document.getElementById('phraseResultEl');
  resultEl.className = 'phrase-result ' + (correct ? 'correct' : 'wrong');
  resultEl.innerHTML = correct
    ? t('train_correct_msg')
    : t('train_wrong_msg') + ' <strong>' + esc(expected) + '</strong>';
  resultEl.classList.remove('hidden');

  document.getElementById('checkPhraseBtn').classList.add('hidden');
  document.getElementById('nextPhraseBtn').classList.remove('hidden');

  if (correct) { _trainCorrect++; _trainStreak++; } else { _trainWrong++; _trainStreak = 0; }
  updateScore();

  // Speak the correct answer in the target language
  TTS.speak(expected, _curPhrase.langCode);

  try { await api('POST', '/api/quiz/phrase/answer', { lang: _curPhrase.langCode, id: _curPhrase.id, correct }); } catch { }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function updateScore() {
  document.getElementById('trCorrect').textContent = _trainCorrect;
  document.getElementById('trWrong').textContent = _trainWrong;
  document.getElementById('trStreak').textContent = _trainStreak;
}

function getDistr(langCode, words) {
  const pool = {
    fr: ['le', 'la', 'les', 'un', 'une', 'des', 'et', 'mais', 'de', 'du', 'est', 'pas', 'que', 'je', 'tu'],
    en: ['the', 'a', 'an', 'and', 'but', 'of', 'is', 'are', 'not', 'I', 'you', 'we', 'they', 'in', 'on'],
    de: ['der', 'die', 'das', 'ein', 'und', 'ist', 'nicht', 'ich', 'du', 'wir', 'sie', 'es', 'in', 'auf'],
    es: ['el', 'la', 'los', 'un', 'una', 'y', 'de', 'es', 'no', 'yo', 'tú', 'que', 'en', 'se'],
    it: ['il', 'la', 'i', 'un', 'e', 'di', 'è', 'non', 'io', 'tu', 'che', 'in', 'su', 'si'],
    uk: ['я', 'ти', 'він', 'вона', 'воно', 'ми', 'ви', 'вони', 'це', 'та', 'але', 'не', 'в', 'на', 'з'],
  }[langCode] || ['the', 'a', 'and', 'of', 'in'];
  const used = new Set(words.map(w => w.toLowerCase()));
  return pool.filter(w => !used.has(w)).sort(() => Math.random() - 0.5).slice(0, 3);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
