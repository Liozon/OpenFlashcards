
// Normalize conjugation entry: old string → {form, translation}
function normConj(entry) {
  if (!entry) return { form: '', translation: '' };
  if (typeof entry === 'string') return { form: entry, translation: '' };
  return { form: entry.form || '', translation: entry.translation || '' };
}

// pages/train.js
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let _trainMode = 'word';
let _trainTypes = [];
let _trainLabels = [];
let _trainDirection = 'random';
let _trainCorrect = 0;
let _trainWrong = 0;
let _trainStreak = 0;
let _curPhrase = null;
let _curWritingWord = null;
let _writingLetterBank = [];
let _writingEasyMode = false;
let _writingSegments = [];

// ── Render page ───────────────────────────────────────────────────────────────
function renderTrain(el) {
  const lang = currentLang();
  if (!lang) { navigate('settings'); return; }

  _trainCorrect = 0; _trainWrong = 0; _trainStreak = 0;
  _trainTypes = []; _trainLabels = []; _trainMode = 'word'; _trainDirection = 'random';

  const ld = currentLangData();
  const nativeLang = (App.config && App.config.nativeLang) || 'en';
  const targetName = ld ? (ld.flag || '') + ' ' + ld.name : lang.toUpperCase();

  el.innerHTML =
    '<div class="page-title">🎯 ' + t('train_title') + '</div>' +

    '<div class="score-bar">' +
    '<div class="score-item">✅ <span id="trCorrect">0</span></div>' +
    '<div class="score-item">❌ <span id="trWrong">0</span></div>' +
    '<div class="score-item">🔥 <span id="trStreak">0</span></div>' +
    '<button class="train-settings-toggle" id="trainSettingsToggle" onclick="toggleTrainSettings()" aria-expanded="false" aria-controls="trainSettingsPanel">⚙️</button>' +
    '</div>' +

    '<div id="trainSettingsPanel" class="train-settings-panel">' +
    '<div class="filter-row">' +
    '<button class="type-btn active" id="modeWord"    onclick="setTrainMode(\'word\',this)">📝 ' + t('train_words') + '</button>' +
    '<button class="type-btn"        id="modePhrase"  onclick="setTrainMode(\'phrase\',this)">💬 ' + t('train_phrases') + '</button>' +
    '<button class="type-btn"        id="modeWriting" onclick="setTrainMode(\'writing\',this)">✍️ ' + t('train_writing') + '</button>' +
    '<button class="type-btn"        id="modeMixed"   onclick="setTrainMode(\'mixed\',this)">🎲 ' + t('train_mixed') + '</button>' +
    '</div>' +

    '<div class="filter-row" id="typeFilters">' +
    '<button class="type-btn active" data-type="" onclick="toggleTypeFilter(\'\',this)">🌍 ' + t('train_all') + '</button>' +
    '<button class="type-btn" data-type="noun"      onclick="toggleTypeFilter(\'noun\',this)">📦 ' + t('add_type_noun').replace('📦 ', '') + '</button>' +
    '<button class="type-btn" data-type="verb"      onclick="toggleTypeFilter(\'verb\',this)">⚡ ' + t('add_type_verb').replace('⚡ ', '') + '</button>' +
    '<button class="type-btn" data-type="adjective" onclick="toggleTypeFilter(\'adjective\',this)">🎨 ' + t('add_type_adj').replace('🎨 ', '') + '</button>' +
    '<button class="type-btn" data-type="adverb"    onclick="toggleTypeFilter(\'adverb\',this)">💨 ' + t('add_type_adv').replace('💨 ', '') + '</button>' +
    '</div>' +

    '<div class="filter-row" id="dirFilters">' +
    '<button class="type-btn active" data-dir="random"        onclick="setTrainDir(\'random\',this)">🔀 ' + t('train_dir_random') + '</button>' +
    '<button class="type-btn" data-dir="native→target"        onclick="setTrainDir(\'native→target\',this)">🌐→' + targetName + '</button>' +
    '<button class="type-btn" data-dir="target→native"        onclick="setTrainDir(\'target→native\',this)">' + targetName + '→🌐</button>' +
    '</div>' +

    '<div class="filter-row" id="labelFilters"></div>' +

    '<div class="filter-row" id="writingDiffFilters" style="display:none">' +
    '<button class="type-btn active" id="writingBtnHard" onclick="setWritingDifficulty(false,this)">🔇 ' + t('train_writing_hard') + '</button>' +
    '<button class="type-btn"        id="writingBtnEasy" onclick="setWritingDifficulty(true,this)">🔊 ' + t('train_writing_easy') + '</button>' +
    '</div>' +
    '</div>' +

    '<div id="quizArea"></div>';

  _populateLabelFilters(lang);
  loadQuestion();
}

async function _populateLabelFilters(lang) {
  let labels = [];
  try { labels = await api('GET', '/api/labels?lang=' + encodeURIComponent(lang)); } catch { }
  const row = document.getElementById('labelFilters');
  if (!row) return;
  if (!labels.length) { row.style.display = 'none'; return; }
  row.style.display = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'type-btn active';
  allBtn.dataset.labelId = '';
  allBtn.textContent = `🏷️ ${t('train_labels_filter')}`;
  allBtn.addEventListener('click', () => toggleLabelFilter('', allBtn));
  row.appendChild(allBtn);
  labels.forEach(lb => {
    const btn = document.createElement('button');
    btn.className = 'type-btn';
    btn.dataset.labelId = lb.id;
    btn.style.borderColor = lb.color;
    btn.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + esc(lb.color) + ';margin-right:5px"></span>' + esc(lb.name);
    btn.addEventListener('click', () => toggleLabelFilter(lb.id, btn));
    row.appendChild(btn);
  });
}

// ── Mode / filter / direction ─────────────────────────────────────────────────
window.setTrainMode = function (mode, btn) {
  _trainMode = mode;
  document.querySelectorAll('#modeWord,#modePhrase,#modeWriting,#modeMixed').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const isWord = mode === 'word';
  const isPhrase = mode === 'phrase';
  const isWriting = mode === 'writing';
  const isMixed = mode === 'mixed';
  document.getElementById('typeFilters').style.display = (isWord || isWriting || isMixed) ? '' : 'none';
  document.getElementById('dirFilters').style.display = (isWord || isMixed) ? '' : 'none';
  document.getElementById('writingDiffFilters').style.display = (isWriting || isMixed) ? '' : 'none';
  const lf = document.getElementById('labelFilters');
  if (lf && lf.children.length) lf.style.display = (isWord || isWriting || isPhrase || isMixed) ? '' : 'none';
  loadQuestion();
};

window.toggleLabelFilter = function (labelId, btn) {
  if (labelId === '') {
    _trainLabels = [];
    document.querySelectorAll('#labelFilters .type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  } else {
    document.querySelector('#labelFilters .type-btn[data-label-id=""]').classList.remove('active');
    btn.classList.toggle('active');
    const active = [...document.querySelectorAll('#labelFilters .type-btn.active')]
      .map(b => b.dataset.labelId).filter(Boolean);
    _trainLabels = active;
    if (!active.length) {
      _trainLabels = [];
      document.querySelector('#labelFilters .type-btn[data-label-id=""]').classList.add('active');
    }
  }
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

window.setWritingDifficulty = function (easy, btn) {
  _writingEasyMode = easy;
  document.querySelectorAll('#writingDiffFilters .type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadQuestion();
};

async function loadQuestion() {
  if (_trainMode === 'phrase') return await loadPhraseQuestion();
  if (_trainMode === 'writing') return await loadWritingQuestion();
  if (_trainMode === 'mixed') return await loadMixedQuestion();
  return await loadWordQuestion();
}

async function loadMixedQuestion() {
  const modes = ['word', 'phrase', 'writing'];
  const picked = modes[Math.floor(Math.random() * modes.length)];
  if (picked === 'phrase') return await loadPhraseQuestion();
  if (picked === 'writing') return await loadWritingQuestion();
  return await loadWordQuestion();
}

// ─────────────────────────────────────────────────────────────────────────────
// WORD QUIZ
// ─────────────────────────────────────────────────────────────────────────────
async function loadWordQuestion() {
  const lang = currentLang();
  const area = document.getElementById('quizArea');
  area.innerHTML = '<div class="quiz-card"><div class="loading-state"><div class="spinner"></div></div></div>';

  const dirMap = { 'random': 'random', 'native→target': 'native', 'target→native': 'target' };
  const apiDir = dirMap[_trainDirection] || 'random';
  const typesParam = _trainTypes.length ? '&types=' + _trainTypes.join(',') : '';
  const labelsParam = _trainLabels.length ? '&labels=' + _trainLabels.join(',') : '';

  try {
    const q = await api('GET', '/api/quiz?lang=' + encodeURIComponent(lang) + '&direction=' + apiDir + typesParam + labelsParam);
    renderWordQuiz(q);
  } catch (e) {
    area.innerHTML =
      '<div class="quiz-card" style="text-align:center">' +
      '<p style="font-size:2rem;margin-bottom:12px">📭</p>' +
      '<p style="color:var(--text-muted)">' + (t('train_no_words') || e.error) + '</p>' +
      '<button class="btn btn-primary" style="margin-top:16px" onclick="navigate(\'add\')">➕ ' + t('home_add_words') + '</button>' +
      '</div>';
  }

}

function renderWordQuiz(q) {
  const area = document.getElementById('quizArea');
  const iconLabel = {
    noun: { key: 'vocab_noun', icon: '📦' },
    verb: { key: 'vocab_verb', icon: '⚡' },
    adjective: { key: 'vocab_adjective', icon: '🎨' },
    adverb: { key: 'vocab_adverb', icon: '💨' }
  };
  const typeLabels = Object.fromEntries(
    Object.entries(iconLabel).map(([type, { key, icon }]) => [
      type,
      `${icon} ${t(key)}`
    ])
  );
  const lang = currentLang();
  const nativeLang = (App.config && App.config.nativeLang) || 'en';

  const dirLabel = q.showNative
    ? '<span style="font-size:.8rem;color:var(--text-faint)">' + nativeLang.toUpperCase() + ' → ' + lang.toUpperCase() + '</span>'
    : '<span style="font-size:.8rem;color:var(--text-faint)">' + lang.toUpperCase() + ' → ' + nativeLang.toUpperCase() + '</span>';

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

  TTS.speak(q.showNative ? q.answerText : q.promptText, q.langCode);

  const card = document.getElementById('wordQuizCard');

  // ── Verb conjugation display (after answer) ──
  if (q.type === 'verb' && q.conjugation && Object.keys(q.conjugation).length) {
    const conjBox = document.createElement('div');
    conjBox.style.cssText = 'margin-top:14px;padding:12px;background:var(--surface-2);border-radius:10px;border:1px solid var(--border)';

    const headerRow = '<div style="font-size:.8rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">' +
      t('train_conjugation') + (q.infinitive ? ' — ' + esc(q.infinitive) : '') + '</div>';

    const conjRows = Object.entries(q.conjugation).map(([pronoun, entry]) => {
      const e = normConj(entry);
      return '<div style="display:grid;grid-template-columns:90px 1fr 1fr;gap:8px;font-size:.85rem;padding:3px 0;border-bottom:1px solid var(--border);align-items:center">' +
        '<span style="color:var(--text-muted)">' + esc(pronoun) + '</span>' +
        '<span style="font-weight:600">' + esc(e.form) + '</span>' +
        (e.translation ? '<span style="color:var(--text-faint);font-size:.8rem">' + esc(e.translation) + '</span>' : '<span></span>') +
        '</div>';
    }).join('');

    conjBox.innerHTML = headerRow + conjRows;
    card.appendChild(conjBox);
  }

  // ── Declensions (non-verbs only) ──
  if (q.type !== 'verb' && q.declensions && Object.keys(q.declensions).length > 0) {
    const langData = (App.config.targetLangs || []).find(l => l.isoCode === q.langCode) || {};
    const cfgDeclensions = langData.declensions || [];
    const declRows = Object.entries(q.declensions).map(([i, d]) => {
      const cfgD = cfgDeclensions[+i] || {};
      const label = cfgD.nativeName || d.nativeName || ('Case ' + (+i + 2));
      return '<div style="display:flex;gap:10px;font-size:.85rem;padding:3px 0;border-bottom:1px solid var(--border)">' +
        '<span style="color:var(--text-muted);min-width:100px">' + esc(label) + '</span>' +
        '<span style="font-weight:600">' + esc(d.value) + '</span>' +
        '</div>';
    }).join('');

    const declBox = document.createElement('div');
    declBox.style.cssText = 'margin-top:14px;padding:12px;background:var(--surface-2);border-radius:10px;border:1px solid var(--border)';
    declBox.innerHTML =
      '<div style="font-size:.8rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">📐 ' + t('train_declensions') + '</div>' +
      '<div style="font-size:.85rem;padding:3px 0;border-bottom:1px solid var(--border);margin-bottom:4px;display:flex;gap:10px">' +
      '<span style="color:var(--text-muted);min-width:100px">' + t('common_nominative') + '</span>' +
      '<span style="font-weight:600">' + esc(q.literal) + '</span>' +
      '</div>' +
      declRows;
    card.appendChild(declBox);
  }

  const nextRow = document.createElement('div');
  nextRow.style.cssText = 'margin-top:20px;width:100%;max-width:500px;text-align:center';
  nextRow.innerHTML =
    '<div style="margin-bottom:12px;font-weight:700;color:' + (correct ? 'var(--primary-dk)' : 'var(--danger-dk)') + '">' +
    (correct ? `✓ ${t('train_correct_msg')}` : `✗ ${t('train_wrong_msg')}` + ' <em>' + esc(q.answerText) + '</em>') +
    '</div>' +
    '<button class="btn btn-primary btn-full" onclick="loadQuestion()">' + t('train_next') + ' →</button>';
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
    const labelsParam = _trainLabels.length ? '&labels=' + _trainLabels.join(',') : '';
    _curPhrase = await api('GET', '/api/quiz/phrase?lang=' + encodeURIComponent(lang) + labelsParam);
    renderPhraseQuiz(_curPhrase);
  } catch (e) {
    area.innerHTML =
      '<div class="phrase-card" style="text-align:center">' +
      '<p style="font-size:2rem;margin-bottom:12px">📭</p>' +
      '<p style="color:var(--text-muted)">' + (t('train_no_phrases') || e.error) + '</p>' +
      '<button class="btn btn-primary" style="margin-top:16px" onclick="navigate(\'add\')">➕ ' + t('train_add_phrases') + '</button>' +
      '</div>';
  }
}

function renderPhraseQuiz(phrase) {
  const area = document.getElementById('quizArea');
  const lang = currentLang();
  const nativeLang = (App.config && App.config.nativeLang) || 'en';

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
    '<button class="btn btn-primary"          id="checkPhraseBtn" onclick="checkPhraseAnswer()" style="flex:1">' + t('train_check') + ' ✓</button>' +
    '<button class="btn btn-secondary hidden" id="nextPhraseBtn"  onclick="loadQuestion()"      style="flex:1">' + t('train_next') + ' →</button>' +
    '<button class="btn btn-secondary" onclick="clearPhraseAnswer()" title="Clear" style="padding:12px 16px">↺</button>' +
    '</div>' +
    '</div>';

  // TTS for the translation (native lang)
  const transEl = document.getElementById('phraseTransEl');
  transEl.appendChild(document.createTextNode(' '));
  transEl.appendChild(TTS.button(phrase.translation, nativeLang));

  // In easy mode (mixed), auto-speak the phrase in the target language
  if (_writingEasyMode && (_trainMode === 'mixed')) {
    TTS.speak(phrase.text, lang);
  }

  // Wire tooltip/TTS clicks
  loadWordsForTooltips(lang, phrase);

  buildWordBank(phrase);
}

async function loadWordsForTooltips(lang, phrase) {
  let wordBank = [];
  try { wordBank = await api('GET', '/api/words?lang=' + encodeURIComponent(lang)); } catch { }

  document.querySelectorAll('#phraseTransEl .phrase-word-clickable').forEach(span => {
    span.title = t('train_click_hint');
    span.addEventListener('click', () => {
      document.querySelectorAll('.word-tooltip').forEach(t => t.remove());

      const clean = span.dataset.clean || span.textContent.replace(/[^\wÀ-ÿ]/g, '').toLowerCase();

      let found = wordBank.find(w =>
        w.literal.toLowerCase() === clean ||
        (w.infinitive && w.infinitive.toLowerCase() === clean)
      );
      if (!found) {
        found = wordBank.find(w =>
          clean.startsWith(w.literal.toLowerCase().slice(0, 4)) ||
          w.literal.toLowerCase().startsWith(clean.slice(0, 4))
        );
      }

      const tipText = found ? found.literal + ' = ' + found.translation : null;
      showTooltip(span, tipText, clean, lang);
    });
  });
}

function showTooltip(el, text, word, langCode) {
  const tip = document.createElement('div');
  tip.className = 'word-tooltip';
  tip.textContent = text || '? (click 🔊)';
  const ttsBtn = TTS.button(word, langCode, 'margin-left:6px;padding:2px 6px;font-size:.8rem;');
  tip.style.display = 'flex';
  tip.style.alignItems = 'center';
  tip.style.gap = '4px';
  tip.appendChild(ttsBtn);
  el.style.position = 'relative';
  el.appendChild(tip);
  setTimeout(() => tip.remove(), 4000);
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

  // TTS: speak the selected word
  const lang = currentLang();
  if (lang) TTS.speak(btn.dataset.word, lang);

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
    : `🗑 ${t('train_wrong_msg')}` + ' <strong>' + esc(expected) + '</strong>';
  resultEl.classList.remove('hidden');

  document.getElementById('checkPhraseBtn').classList.add('hidden');
  document.getElementById('nextPhraseBtn').classList.remove('hidden');

  if (correct) { _trainCorrect++; _trainStreak++; } else { _trainWrong++; _trainStreak = 0; }
  updateScore();

  // Speak the whole sentence
  TTS.speak(expected, _curPhrase.langCode);

  try { await api('POST', '/api/quiz/phrase/answer', { lang: _curPhrase.langCode, id: _curPhrase.id, correct }); } catch { }
};

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

// ─────────────────────────────────────────────────────────────────────────────
// WRITING QUIZ  (letter-bank spelling of the target word)
// ─────────────────────────────────────────────────────────────────────────────

async function loadWritingQuestion() {
  const lang = currentLang();
  const area = document.getElementById('quizArea');
  area.innerHTML = '<div class="quiz-card"><div class="loading-state"><div class="spinner"></div></div></div>';
  _curWritingWord = null;
  _writingLetterBank = [];
  _writingSegments = [];

  try {
    const typesParam = _trainTypes.length ? '&types=' + _trainTypes.join(',') : '';
    const labelsParam = _trainLabels.length ? '&labels=' + _trainLabels.join(',') : '';
    // Always native→target direction for writing mode
    const q = await api('GET', '/api/quiz?lang=' + encodeURIComponent(lang) + '&direction=native' + typesParam + labelsParam);
    _curWritingWord = q;
    renderWritingQuiz(q);
  } catch (e) {
    area.innerHTML =
      '<div class="quiz-card" style="text-align:center">' +
      '<p style="font-size:2rem;margin-bottom:12px">📭</p>' +
      '<p style="color:var(--text-muted)">' + (t('train_no_words') || e.error) + '</p>' +
      '<button class="btn btn-primary" style="margin-top:16px" onclick="navigate(\'add\')">➕ ' + t('home_add_words') + '</button>' +
      '</div>';
  }
}

function renderWritingQuiz(q) {
  const area = document.getElementById('quizArea');
  const nativeLang = (App.config && App.config.nativeLang) || 'en';
  const lang = currentLang();
  const iconLabel = {
    noun: { key: 'vocab_noun', icon: '📦' },
    verb: { key: 'vocab_verb', icon: '⚡' },
    adjective: { key: 'vocab_adjective', icon: '🎨' },
    adverb: { key: 'vocab_adverb', icon: '💨' }
  };
  const typeLabels = Object.fromEntries(
    Object.entries(iconLabel).map(([type, { key, icon }]) => [
      type,
      `${icon} ${t(key)} `
    ])
  );

  const targetWord = q.answerText;
  _writingSegments = targetWord.split(' ');

  // Build the answer zone skeleton: one slot-group per segment, separated by visible space dividers
  const zoneSegmentsHtml = _writingSegments.map((seg, si) => {
    const slots = seg.split('').map((_, li) =>
      '<span class="letter-slot" data-seg="' + si + '" data-pos="' + li + '"></span>'
    ).join('');
    return '<span class="writing-segment" data-seg="' + si + '">' + slots + '</span>';
  }).join('<span class="writing-space-sep"> </span>');

  const ttsBtn = TTS.button(targetWord, lang);
  // We'll inject the TTS button via JS after innerHTML

  area.innerHTML =
    '<div class="quiz-card" id="writingQuizCard">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;justify-content:center;flex-wrap:wrap">' +
    '<div class="badge badge-' + q.type + '">' + (typeLabels[q.type] || q.type) + '</div>' +
    '<span style="font-size:.8rem;color:var(--text-faint)">' + nativeLang.toUpperCase() + ' → ' + lang.toUpperCase() + '</span>' +
    '</div>' +

    // Prompt word + TTS button (always shown)
    '<div class="question-word" style="display:flex;align-items:center;justify-content:center;gap:10px">' +
    '<span id="writingPromptText">' + esc(q.promptText) + '</span>' +
    '<span id="writingTtsSlot"></span>' +
    '</div>' +
    (q.definition ? '<div class="question-def">' + esc(q.definition) + '</div>' : '') +
    '<p class="question-instr">' + t('train_writing_instr') + '</p>' +

    // Answer zone with segment/slot structure
    '<div class="writing-answer-zone" id="writingAnswerZone">' + zoneSegmentsHtml + '</div>' +

    // Letter bank
    '<div class="word-bank" id="writingLetterBank"></div>' +

    // Result + feedback
    '<div id="writingResultEl" class="phrase-result hidden"></div>' +
    '<div class="phrase-actions" style="margin-top:16px">' +
    '<button class="btn btn-primary"          id="checkWritingBtn" onclick="checkWritingAnswer()" style="flex:1">' + t('train_writing_check') + ' ✓</button>' +
    '<button class="btn btn-secondary hidden" id="nextWritingBtn"  onclick="loadQuestion()"        style="flex:1">' + t('train_next') + ' →</button>' +
    '<button class="btn btn-secondary" onclick="clearWritingAnswer()" title="Clear" style="padding:12px 16px">↺</button>' +
    '</div>' +
    '</div>';

  // Inject TTS button into slot (always visible)
  document.getElementById('writingTtsSlot').appendChild(TTS.button(targetWord, lang));

  // In easy mode, auto-speak the target word
  if (_writingEasyMode) {
    TTS.speak(targetWord, lang);
  }

  buildWritingLetterBank(targetWord, lang);
}

function buildWritingLetterBank(targetWord, lang) {
  const segments = targetWord.split(' ');
  const neededLetters = segments.join('').split('');

  let extraLetters = [];
  try { extraLetters = getWritingDistractorLetters(lang, neededLetters); } catch (_) { }

  const maxExtras = Math.max(3, Math.ceil(neededLetters.length / 2));
  const extras = extraLetters.slice(0, maxExtras);
  const allLetters = [...neededLetters, ...extras];
  allLetters.sort(() => Math.random() - 0.5);

  _writingLetterBank = allLetters.map((ch, i) => ({ ch, idx: i, used: false }));

  const bank = document.getElementById('writingLetterBank');
  _writingLetterBank.forEach(tok => {
    const btn = document.createElement('div');
    btn.className = 'word-token letter-token';
    btn.dataset.idx = tok.idx;
    btn.textContent = tok.ch;
    btn.addEventListener('click', () => addLetterToAnswer(btn, tok));
    bank.appendChild(btn);
  });
}

/**
 * Find the next empty slot across all segments and fill it.
 * Automatically advances to the next segment once one is full,
 * inserting the visible space separator between segments.
 */
function addLetterToAnswer(btn, tok) {
  if (tok.used) return;

  // Find the next available slot in order (segment by segment)
  const allSlots = [...document.querySelectorAll('#writingAnswerZone .letter-slot')];
  const emptySlot = allSlots.find(s => !s.dataset.filled);
  if (!emptySlot) return; // all slots filled

  tok.used = true;
  btn.classList.add('used');

  emptySlot.dataset.filled = '1';
  emptySlot.dataset.tokenIdx = tok.idx;
  emptySlot.textContent = tok.ch;
  emptySlot.classList.add('filled-slot');

  // Make filled slot clickable to remove
  emptySlot.addEventListener('click', function handler() {
    emptySlot.removeEventListener('click', handler);
    emptySlot.textContent = '';
    emptySlot.classList.remove('filled-slot');
    delete emptySlot.dataset.filled;
    delete emptySlot.dataset.tokenIdx;
    tok.used = false;
    btn.classList.remove('used');
  });
}

window.clearWritingAnswer = function () {
  document.querySelectorAll('#writingAnswerZone .letter-slot.filled-slot').forEach(slot => {
    const idx = parseInt(slot.dataset.tokenIdx, 10);
    const tok = _writingLetterBank.find(t => t.idx === idx);
    if (tok) {
      tok.used = false;
      const btn = document.querySelector('#writingLetterBank .letter-token[data-idx="' + idx + '"]');
      if (btn) btn.classList.remove('used');
    }
    slot.textContent = '';
    slot.classList.remove('filled-slot');
    delete slot.dataset.filled;
    delete slot.dataset.tokenIdx;
  });
};

window.checkWritingAnswer = async function () {
  if (!_curWritingWord) return;

  // Collect typed letters per segment from slots
  const targetWord = _curWritingWord.answerText;
  const segments = targetWord.split(' ');

  const typedSegments = segments.map((seg, si) => {
    const slots = [...document.querySelectorAll('#writingAnswerZone .letter-slot[data-seg="' + si + '"]')];
    return slots.map(s => s.textContent || '').join('');
  });

  const reconstructed = typedSegments.join(' ');
  const correct = reconstructed.trim().toLowerCase() === targetWord.trim().toLowerCase();

  const zone = document.getElementById('writingAnswerZone');
  zone.classList.add(correct ? 'correct' : 'wrong');

  const resultEl = document.getElementById('writingResultEl');
  resultEl.className = 'phrase-result ' + (correct ? 'correct' : 'wrong');
  resultEl.innerHTML = correct
    ? `✓ ${t('train_writing_correct')}`
    : `✗ ${t('train_writing_wrong')}` + ' <strong>' + esc(targetWord) + '</strong>';
  resultEl.classList.remove('hidden');

  document.getElementById('checkWritingBtn').classList.add('hidden');
  document.getElementById('nextWritingBtn').classList.remove('hidden');

  // Disable all letter tokens
  document.querySelectorAll('#writingLetterBank .letter-token').forEach(b => b.style.pointerEvents = 'none');
  // Disable slot clicks
  document.querySelectorAll('#writingAnswerZone .letter-slot').forEach(s => s.style.pointerEvents = 'none');

  if (correct) { _trainCorrect++; _trainStreak++; } else { _trainWrong++; _trainStreak = 0; }
  updateScore();

  TTS.speak(targetWord, _curWritingWord.langCode);

  try {
    await api('POST', '/api/quiz/answer', {
      lang: _curWritingWord.langCode,
      id: _curWritingWord.id,
      answer: reconstructed,
      expectedAnswer: targetWord
    });
  } catch { }
};

/**
 * Returns random letters weighted toward common ones in the language,
 * excluding letters already present in neededLetters.
 */
function getWritingDistractorLetters(lang, neededLetters) {
  const commonLetters = {
    fr: 'eaiuonsrlmtdpcgbfhvjqxyz',
    en: 'etaoinshrdlucmfywgpbvkjxqz',
    de: 'enisrathdulgomcbfkwzpvjyqx',
    es: 'eaoinsrlcdtumpbgvhfyqjzxkw',
    it: 'eaoinsrltcmdupbgvhfzqjkxyw',
    uk: 'аоеинтсрлвкмдпзугябчшфйцхжє',
    default: 'etaoinshrdlucmfywgpbvkjxqz'
  }[lang] || 'etaoinshrdlucmfywgpbvkjxqz';

  const neededSet = new Set(neededLetters.map(c => c.toLowerCase()));
  const candidates = commonLetters.split('').filter(c => !neededSet.has(c));

  const result = [];
  for (let i = 0; i < 8; i++) {
    result.push(candidates[Math.floor(Math.random() * candidates.length)]);
  }
  return result;
}

window.toggleTrainSettings = function () {
  const panel = document.getElementById('trainSettingsPanel');
  const btn = document.getElementById('trainSettingsToggle');
  if (!panel || !btn) return;
  const open = panel.classList.toggle('open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.classList.toggle('active', open);
};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
