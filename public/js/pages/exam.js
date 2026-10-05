// pages/exam.js
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let _examQuestions = [];
let _examCurrentIdx = 0;
let _examCorrect = 0;
let _examWrong = 0;
let _examStreak = 0;
let _examCount = 10;
let _examSelectedLangs = [];
let _examTotalAvailable = 0;
let _examTypeFilters = [];
let _examIncludePhrases = true;
let _examSessionStarted = false;

// Phrase/writing answer state
let _examWritingLetterBank = [];
// Audio matching state
let _examMatchActivePair = null;
let _examMatchDone = 0;
let _examMatchAllCorrect = true;

const _EXAM_STORAGE_KEY = 'exam_history';

// ── Shuffle helper ────────────────────────────────────────────────────────────
function _examShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Replicate server-side wordDisplay: article + literal (or infinitive for verbs)
function _examWordDisplay(w) {
  if (w && w._examDisplay) return w._examDisplay;
  const article = w.article || '';
  const separator = article && !article.endsWith("'") && !article.endsWith('\u2019') ? ' ' : '';
  return (article ? article + separator : '') +
    (w.type === 'verb' && w.infinitive ? w.infinitive : w.literal);
}

// ── History helpers ───────────────────────────────────────────────────────────
function _examLoadHistory() {
  try { return JSON.parse(localStorage.getItem(_EXAM_STORAGE_KEY)) || []; } catch { return []; }
}

function _examSaveHistory(entry) {
  const hist = _examLoadHistory();
  hist.unshift(entry);
  if (hist.length > 50) hist.length = 50;
  localStorage.setItem(_EXAM_STORAGE_KEY, JSON.stringify(hist));
}

function _examGetBestScore(langCode) {
  try {
    const c = App.config && App.config.examBest && App.config.examBest[langCode];
    if (c) return c;
    return JSON.parse(localStorage.getItem('exam_best_' + langCode));
  } catch { return null; }
}

function _examSaveBestScore(langCode, pct, date) {
  const prev = _examGetBestScore(langCode);
  if (prev && pct <= prev.percentage) return prev;
  const examBest = Object.assign({}, (App.config && App.config.examBest) || {});
  examBest[langCode] = { percentage: pct, date };
  if (App.config) App.config.examBest = examBest;
  saveConfig({ examBest }).catch(() => {});
  return { percentage: pct, date };
}

// ── Render page ───────────────────────────────────────────────────────────────
function renderExam(el) {
  const lang = currentLang();
  if (!lang) { navigate('settings'); return; }

  _examCorrect = 0; _examWrong = 0; _examStreak = 0;
  _examQuestions = []; _examCurrentIdx = 0;
  _examSessionStarted = false;
  _examSelectedLangs = []; _examTypeFilters = [];
  _examIncludePhrases = true;

  const langs = App.config.targetLangs || [];
  const multiLang = langs.length > 1;

  el.innerHTML =
    '<div class="page-title">' + phIcon('clipboard-text') + ' ' + t('exam_title') + '</div>' +

    '<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">' +
    '<div class="score-bar" id="examScoreBar" style="flex:1;display:flex;gap:16px;justify-content:center;margin-bottom:0">' +
    '<div class="score-item">' + phIcon('check') + ' <span id="examCorrect">0</span></div>' +
    '<div class="score-item">' + phIcon('x-red') + ' <span id="examWrong">0</span></div>' +
    '<div class="score-item">' + phIcon('fire') + ' <span id="examStreak">0</span></div>' +
    '</div>' +
    '<button class="train-settings-toggle" id="examSettingsToggle" onclick="toggleExamSettings()" aria-expanded="true" aria-controls="examSettingsPanel">' + phIcon('gear') + '</button>' +
    '</div>' +

    '<div id="examSettingsPanel" class="train-settings-panel open">' +

    // ── 1. Language selector (multi-language only) ──
    (multiLang ?
      '<div class="filter-row" id="examLangFilters">' +
      '<button class="type-btn active" data-exam-lang="" onclick="toggleExamLang(\'\',this)">' + phIcon('globe') + ' ' + t('exam_lang_all') + '</button>' +
      langs.map(l =>
        '<button class="type-btn" data-exam-lang="' + l.isoCode + '" onclick="toggleExamLang(\'' + l.isoCode + '\',this)">' + (l.flag || '🌐') + ' ' + l.name + '</button>'
      ).join('') +
      '</div>' : '') +

    // ── 2. Content type filters ──
    '<div class="filter-row" id="examTypeFilters">' +
    '<button class="type-btn active" data-type="" onclick="toggleExamTypeFilter(\'\',this)">' + phIcon('globe') + ' ' + t('train_all') + '</button>' +
    '<button class="type-btn" data-type="noun"      onclick="toggleExamTypeFilter(\'noun\',this)">' + phIcon('package') + ' ' + t('add_type_noun') + '</button>' +
    '<button class="type-btn" data-type="verb"      onclick="toggleExamTypeFilter(\'verb\',this)">' + phIcon('lightning') + ' ' + t('add_type_verb') + '</button>' +
    '<button class="type-btn" data-type="adjective" onclick="toggleExamTypeFilter(\'adjective\',this)">' + phIcon('palette') + ' ' + t('add_type_adj') + '</button>' +
    '<button class="type-btn" data-type="adverb"    onclick="toggleExamTypeFilter(\'adverb\',this)">' + phIcon('wind') + ' ' + t('add_type_adv') + '</button>' +
    '<button class="type-btn" data-type="other"    onclick="toggleExamTypeFilter(\'other\',this)">' + phIcon('puzzle-piece') + ' ' + t('add_type_other') + '</button>' +
    '</div>' +

    // ── 3. Phrase include toggle ──
    '<div class="filter-row">' +
    '<button class="type-btn active" id="examPhraseToggle" onclick="toggleExamPhrases(this)"></button>' +
    '</div>' +

    // ── 4. Question count ──
    '<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:20px">' +
    '<span style="font-size:.85rem;color:var(--text-muted)">' + t('exam_count_label') + ':</span>' +
    '<button class="btn btn-sm btn-secondary" onclick="adjustExamCount(-10)" style="padding:6px 12px">−</button>' +
    '<span id="examCountValue" style="font-weight:700;min-width:40px;text-align:center;font-size:1.1rem">' + _examCount + '</span>' +
    '<button class="btn btn-sm btn-secondary" onclick="adjustExamCount(10)" style="padding:6px 12px">+</button>' +
    '</div>' +

    // ── 5. UX toggles ──
    '<div>' +
    '<div class="train-toggle-row">' +
    '<label>' + t('train_green_border') + '</label>' +
    '<label class="toggle-switch">' +
    '<input type="checkbox" id="examGreenBorderToggle" ' + ((App.config && App.config.showGreenBorder !== false) ? 'checked' : '') + ' onchange="toggleGreenBorder(this.checked)">' +
    '<span class="toggle-slider"></span>' +
    '</label>' +
    '</div>' +
    '<div class="train-toggle-row">' +
    '<label>' + t('train_confetti') + '</label>' +
    '<label class="toggle-switch">' +
    '<input type="checkbox" id="examConfettiToggle" ' + ((App.config && App.config.showConfetti !== false) ? 'checked' : '') + ' onchange="toggleConfetti(this.checked)">' +
    '<span class="toggle-slider"></span>' +
    '</label>' +
    '</div>' +
    '</div>' +

    // ── 6. Start button ──
    '<div class="filter-row" id="examStartRow">' +
    '<button class="btn btn-primary" style="font-size:1.1rem;padding:14px 48px" onclick="startExam()">▶ ' + t('exam_start') + '</button>' +
    '</div>' +

    '</div>' +

    '<div id="examQuizArea">' +
    '<div class="quiz-card" style="text-align:center">' +
    '<p style="font-size:3rem;margin-bottom:16px">' + phIcon('clipboard-text') + '</p>' +
    '<p style="color:var(--text-muted);font-size:1.1rem">' + t('exam_configure_prompt') + '</p>' +
    '</div>' +
    '</div>';

  const phraseBtn = document.getElementById('examPhraseToggle');
  if (phraseBtn) phraseBtn.innerHTML = phIcon('chat-circle') + ' ' + t('train_phrases') + ': ' + phIcon('check');

  _examLoadTotalAvailable(lang);

  document.getElementById('examQuizArea').addEventListener('click', function () {
    if (!_examSessionStarted) return;
    const panel = document.getElementById('examSettingsPanel');
    const btn = document.getElementById('examSettingsToggle');
    if (panel && btn && panel.classList.contains('open')) {
      panel.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      btn.classList.remove('active');
    }
  });

  _examUpdateCountDisplay();
}

async function _examLoadTotalAvailable(lang) {
  try {
    const langsToFetch = _examSelectedLangs.length ? _examSelectedLangs : [lang];
    let total = 0;
    for (const l of langsToFetch) {
      const stats = await api('GET', '/api/stats?lang=' + encodeURIComponent(l)).catch(() => null);
      if (!stats) continue;
      let wordCount = stats.totalWords || 0;
      if (_examTypeFilters.length) {
        wordCount = _examTypeFilters.reduce((sum, tt) => sum + (stats.byType[tt] || 0), 0);
      }
      total += wordCount;
      if (_examIncludePhrases) total += (stats.totalPhrases || 0);
    }
    _examTotalAvailable = total;
    _examUpdateCountDisplay();
  } catch {
    _examTotalAvailable = 0;
  }
}

function _examUpdateCountDisplay() {
  if (_examTotalAvailable > 0) {
    _examCount = Math.max(1, Math.min(_examCount || 10, _examTotalAvailable));
  }
  const el = document.getElementById('examCountValue');
  if (el) el.textContent = _examCount;
}

// ── Settings toggles ──────────────────────────────────────────────────────────
window.toggleExamSettings = function () {
  const panel = document.getElementById('examSettingsPanel');
  const btn = document.getElementById('examSettingsToggle');
  if (!panel || !btn) return;
  const open = panel.classList.toggle('open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.classList.toggle('active', open);
};

window.toggleExamLang = function (code, btn) {
  if (code === '') {
    _examSelectedLangs = [];
    document.querySelectorAll('#examLangFilters .type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  } else {
    document.querySelector('#examLangFilters .type-btn[data-exam-lang=""]').classList.remove('active');
    btn.classList.toggle('active');
    const active = [...document.querySelectorAll('#examLangFilters .type-btn.active')]
      .map(b => b.dataset.examLang).filter(Boolean);
    _examSelectedLangs = active;
    if (!active.length) {
      _examSelectedLangs = [];
      document.querySelector('#examLangFilters .type-btn[data-exam-lang=""]').classList.add('active');
    }
  }
  const lang = currentLang();
  if (lang) _examLoadTotalAvailable(lang);
};

window.toggleExamTypeFilter = function (type, btn) {
  if (type === '') {
    _examTypeFilters = [];
    document.querySelectorAll('#examTypeFilters .type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  } else {
    document.querySelector('#examTypeFilters .type-btn[data-type=""]').classList.remove('active');
    btn.classList.toggle('active');
    const active = [...document.querySelectorAll('#examTypeFilters .type-btn.active')]
      .map(b => b.dataset.type).filter(Boolean);
    _examTypeFilters = active;
    if (!active.length) {
      _examTypeFilters = [];
      document.querySelector('#examTypeFilters .type-btn[data-type=""]').classList.add('active');
    }
  }
  const lang = currentLang();
  if (lang) _examLoadTotalAvailable(lang);
};

window.toggleExamPhrases = function (btn) {
  _examIncludePhrases = !_examIncludePhrases;
  btn.classList.toggle('active', _examIncludePhrases);
  btn.innerHTML = phIcon('chat-circle') + ' ' + t('train_phrases') + ': ' + (_examIncludePhrases ? phIcon('check') : phIcon('x'));
  const lang = currentLang();
  if (lang) _examLoadTotalAvailable(lang);
};

window.adjustExamCount = function (delta) {
  if (_examTotalAvailable > 0) {
    const total = _examTotalAvailable;
    let next = _examCount + delta;
    if (next > total) next = total;
    if (next < 10) next = Math.min(10, total);
    _examCount = Math.max(1, Math.min(total, next));
  } else {
    _examCount = Math.max(1, (_examCount || 10) + delta);
  }
  const el = document.getElementById('examCountValue');
  if (el) el.textContent = _examCount;
};

// ── Start exam ────────────────────────────────────────────────────────────────
window.startExam = async function () {
  _examSessionStarted = true;
  TTS.unlock();
  const startRow = document.getElementById('examStartRow');
  if (startRow) startRow.style.display = 'none';
  const panel = document.getElementById('examSettingsPanel');
  const btn = document.getElementById('examSettingsToggle');
  if (panel && panel.classList.contains('open')) {
    panel.classList.remove('open');
    if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('active'); }
  }

  const area = document.getElementById('examQuizArea');
  area.innerHTML = '<div class="quiz-card"><div class="loading-state"><div class="spinner"></div></div></div>';

  try {
    await _examBuildQuestionPool();
    if (!_examQuestions.length) {
      area.innerHTML =
        '<div class="quiz-card" style="text-align:center">' +
        '<p style="font-size:2rem;margin-bottom:12px">' + phIcon('mailbox') + '</p>' +
        '<p style="color:var(--text-muted)">' + t('train_no_words') + '</p>' +
        '<button class="btn btn-primary" style="margin-top:16px" onclick="navigate(\'add\')">' + phIcon('plus') + ' ' + t('home_add_words') + '</button>' +
        '</div>';
      return;
    }
    _examCurrentIdx = 0;
    _examCorrect = 0; _examWrong = 0; _examStreak = 0;
    _examUpdateScore();
    _examRenderQuestion();
  } catch (e) {
    console.error('[exam] start failed:', e);
    area.innerHTML =
      '<div class="quiz-card" style="text-align:center">' +
      '<p style="font-size:2rem;margin-bottom:12px">' + phIcon('warning') + '</p>' +
      '<p style="color:var(--text-muted)">' + (e.error || t('common_error')) + '</p>' +
      '</div>';
  }
};

// ── Build question pool ───────────────────────────────────────────────────────
async function _examBuildQuestionPool() {
  const lang = currentLang();
  const nativeLang = (App.config && App.config.nativeLang) || 'en';
  const langsToFetch = _examSelectedLangs.length ? _examSelectedLangs : [lang];

  let wordItems = [];
  let phraseItems = [];

  for (const l of langsToFetch) {
    const wordsRes = await api('GET', '/api/words?lang=' + encodeURIComponent(l)).catch(() => []);
    let words = Array.isArray(wordsRes) ? wordsRes : [];
    if (_examTypeFilters.length) {
      words = words.filter(w => _examTypeFilters.includes(w.type));
    }
    words.forEach(w => wordItems.push({
      kind: 'word',
      data: {
        id: w.id,
        langCode: l,
        type: w.type || 'other',
        literal: w.literal || '',
        translation: w.translation || '',
        display: _examWordDisplay(w),
        definition: w.definition || '',
        infinitive: w.infinitive || '',
        article: w.article || ''
      }
    }));

    if (_examIncludePhrases) {
      const phrasesRes = await api('GET', '/api/phrases?lang=' + encodeURIComponent(l)).catch(() => []);
      Array.isArray(phrasesRes) && phrasesRes.forEach(p => phraseItems.push({
        kind: 'phrase',
        data: {
          id: p.id,
          langCode: l,
          text: p.text || '',
          translation: p.translation || '',
          helpNote: p.helpNote || ''
        }
      }));
    }
  }

  const allItems = _examShuffle([...wordItems, ...phraseItems]);
  if (!allItems.length) { _examQuestions = []; return; }

  const count = Math.min(_examCount, allItems.length);
  const selected = allItems.slice(0, count);

  const questions = [];
  for (const item of selected) {
    const options = ['audio'];
    if (item.kind === 'word') options.push('word', 'writing');
    else options.push('phrase');
    const qType = options[Math.floor(Math.random() * options.length)];
    questions.push(_examBuildQuestion(item, qType, wordItems, phraseItems, nativeLang));
  }

  _examQuestions = questions;
}

function _examBuildQuestion(poolItem, qType, wordItems, phraseItems, nativeLang) {
  const item = poolItem.data;
  const isPhrase = poolItem.kind === 'phrase';
  const lang = item.langCode || currentLang();

  if (qType === 'audio') {
    return _examBuildAudioQuestion(poolItem, wordItems, phraseItems, nativeLang);
  }
  if (qType === 'word') {
    return _examBuildWordQuestion(item, isPhrase, lang, nativeLang, wordItems, phraseItems);
  }
  if (qType === 'writing') {
    if (isPhrase) return _examBuildPhraseQuestion(item, lang);
    return _examBuildWritingQuestion(item, lang);
  }
  // phrase
  if (isPhrase) return _examBuildPhraseQuestion(item, lang);
  return _examBuildWritingQuestion(item, lang);
}

function _examBuildWordQuestion(item, isPhrase, lang, nativeLang, wordItems, phraseItems) {
  if (isPhrase) return _examBuildPhraseQuestion(item, lang);

  const showNative = Math.random() < 0.5;
  const promptText = showNative ? item.translation : item.display;
  const answerText = showNative ? item.display : item.translation;

  const others = wordItems.filter(w => w.data.id !== item.id && w.data.langCode === lang)
    .map(w => ({ display: w.data.display, translation: w.data.translation }));
  _examShuffle(others);

  const typeLabels = {
    word: t('exam_type_word'), phrase: t('exam_type_phrase'),
    writing: t('exam_type_writing'), audio: t('exam_type_audio')
  };

  const decoys = others.slice(0, 3).map(w => showNative ? w.display : w.translation).filter(Boolean);
  while (decoys.length < 3) decoys.push('—');

  const choices = _examShuffle([answerText, ...decoys]);

  return {
    type: 'word',
    langCode: lang,
    id: item.id,
    promptText,
    answerText,
    choices,
    showNative,
    wordType: item.type || 'other',
    definition: item.definition || '',
    typeLabel: typeLabels.word,
    phraseQuestion: false
  };
}

function _examBuildPhraseQuestion(item, lang) {
  const typeLabels = {
    word: t('exam_type_word'), phrase: t('exam_type_phrase'),
    writing: t('exam_type_writing'), audio: t('exam_type_audio')
  };

  return {
    type: 'phrase',
    langCode: lang,
    id: item.id,
    text: item.text || item.display || '',
    translation: item.translation || '',
    helpNote: item.helpNote || '',
    typeLabel: typeLabels.phrase
  };
}

function _examBuildWritingQuestion(item, lang) {
  const typeLabels = {
    word: t('exam_type_word'), phrase: t('exam_type_phrase'),
    writing: t('exam_type_writing'), audio: t('exam_type_audio')
  };

  return {
    type: 'writing',
    langCode: lang,
    id: item.id,
    promptText: item.translation || '',
    answerText: item.display || item.literal || '',
    wordType: item.type || 'other',
    definition: item.definition || '',
    typeLabel: typeLabels.writing
  };
}

function _examBuildAudioQuestion(poolItem, wordItems, phraseItems) {
  const item = poolItem.data;
  const lang = item.langCode || currentLang();
  const showInTarget = Math.random() < 0.5;

  function toCandidate(c) {
    return {
      id: c.data.id,
      isPhrase: c.kind === 'phrase',
      audioText: (c.kind === 'phrase' ? c.data.text : c.data.display) || '',
      translation: c.data.translation || ''
    };
  }

  const candidates = [];
  for (const w of wordItems) if (w.data.langCode === lang) candidates.push(toCandidate(w));
  for (const p of phraseItems) if (p.data.langCode === lang) candidates.push(toCandidate(p));

  const primaryId = item.id;
  let primary = candidates.find(c => c.id === primaryId);
  if (!primary) primary = toCandidate(poolItem);

  _examShuffle(candidates);
  const others = candidates.filter(c => c.id !== primaryId);
  const picked = [primary, ...others.slice(0, 4)].filter(Boolean);
  const n = Math.max(1, Math.min(5, picked.length));

  const pairs = picked.slice(0, n).map((c, k) => ({
    pairId: k,
    refId: c.id,
    isPhrase: c.isPhrase,
    audioText: c.audioText,
    answerText: (showInTarget ? c.audioText : c.translation) || ''
  }));

  const soundsOrder = _examShuffle(pairs.map(p => p.pairId));
  let answersOrder = _examShuffle(pairs.map(p => p.pairId));
  if (n > 1) {
    let guard = 0;
    while (soundsOrder.join(',') === answersOrder.join(',') && guard++ < 20) {
      answersOrder = _examShuffle(pairs.map(p => p.pairId));
    }
  }

  return {
    type: 'audio',
    langCode: lang,
    id: item.id,
    pairs,
    soundsOrder,
    answersOrder,
    showInTarget,
    typeLabel: t('exam_type_audio')
  };
}

// ── Render current question ───────────────────────────────────────────────────
function _examRenderQuestion() {
  if (_examCurrentIdx >= _examQuestions.length) {
    _examRenderResults();
    return;
  }

  const q = _examQuestions[_examCurrentIdx];
  const area = document.getElementById('examQuizArea');
  _examMatchActivePair = null;
  _examMatchDone = 0;
  _examMatchAllCorrect = true;

  const progressPct = (_examCurrentIdx / _examQuestions.length) * 100;

  let html = '<div class="exam-progress-bar-wrap"><div class="exam-progress-bar-fill" style="width:' + progressPct + '%"></div></div>';

  switch (q.type) {
    case 'word': html += _examRenderWord(q); break;
    case 'phrase': html += _examRenderPhrase(q); break;
    case 'writing': html += _examRenderWriting(q); break;
    case 'audio': html += _examRenderAudio(q); break;
  }

  area.innerHTML = html;

  if (q.type === 'phrase') _examInitPhraseEvents(q);
  if (q.type === 'writing') _examInitWritingEvents(q);
}

// ── Word question ─────────────────────────────────────────────────────────────
function _examRenderWord(q) {
  const lang = q.langCode;
  const nativeLang = (App.config && App.config.nativeLang) || 'en';
  const dirLabel = q.showNative
    ? '<span style="font-size:.8rem;color:var(--text-faint)">' + nativeLang.toUpperCase() + ' → ' + lang.toUpperCase() + '</span>'
    : '<span style="font-size:.8rem;color:var(--text-faint)">' + lang.toUpperCase() + ' → ' + nativeLang.toUpperCase() + '</span>';

  const iconLabel = {
    noun: { key: 'vocab_noun', icon: 'package' },
    verb: { key: 'vocab_verb', icon: 'lightning' },
    adjective: { key: 'vocab_adjective', icon: 'palette' },
    adverb: { key: 'vocab_adverb', icon: 'wind' },
    other: { key: 'vocab_other', icon: 'puzzle-piece' }
  };
  const tl = iconLabel[q.wordType] || { key: 'vocab_other', icon: 'puzzle-piece' };
  const badge = '<div class="badge badge-' + q.wordType + '">' + phIcon(tl.icon) + ' ' + t(tl.key) + '</div>';

  const choicesHtml = q.choices.map((ch, i) =>
    '<button class="choice-btn" data-idx="' + i + '" onclick="examAnswerWord(' + i + ')">' + esc(capitalizeFirst(ch)) + '</button>'
  ).join('');

  return '<div class="quiz-card" id="examQuizCard">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;justify-content:center;flex-wrap:wrap">' +
    '<span class="badge badge-phrase">' + phIcon('lego') + ' ' + q.typeLabel + '</span>' +
    badge + dirLabel +
    '</div>' +
    '<div class="question-word" id="examQWord">' + esc(capitalizeFirst(q.promptText)) + '</div>' +
    (q.definition ? '<div class="question-def">' + esc(q.definition) + '</div>' : '') +
    '<p class="question-instr">' + t('train_question') + '</p>' +
    '<div class="choices-grid" id="examChoicesGrid">' + choicesHtml + '</div>' +
    '</div>';
}

window.examAnswerWord = function (idx) {
  const q = _examQuestions[_examCurrentIdx];
  if (!q || q.type !== 'word') return;

  const buttons = document.querySelectorAll('#examChoicesGrid .choice-btn');
  buttons.forEach(b => b.disabled = true);

  const selected = q.choices[idx];
  const correct = selected.trim().toLowerCase() === q.answerText.trim().toLowerCase();

  buttons[idx].classList.add(correct ? 'correct' : 'wrong');
  if (!correct) {
    buttons.forEach(b => {
      if (b.textContent.trim().toLowerCase() === q.answerText.trim().toLowerCase())
        b.classList.add('correct');
    });
  }

  _examRecordAnswer(correct);
  TTS.speak(q.showNative ? q.answerText : q.promptText, q.langCode, q.id);
  api('POST', '/api/quiz/answer', { lang: q.langCode, id: q.id, answer: selected, expectedAnswer: q.answerText }).catch(() => {});

  const card = document.getElementById('examQuizCard');
  const nextRow = document.createElement('div');
  nextRow.style.cssText = 'margin-top:20px;width:100%;text-align:center';
  nextRow.innerHTML =
    '<button class="btn btn-primary" onclick="examNext()">' + t('exam_next') + ' →</button>';
  card.appendChild(nextRow);
};

// ── Phrase question ───────────────────────────────────────────────────────────
function _examRenderPhrase(q) {
  const lang = q.langCode;
  const nativeLang = (App.config && App.config.nativeLang) || 'en';
  const transHtml = esc(q.translation).split(' ').join(' ');

  return '<div class="phrase-card" id="examQuizCard">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">' +
    '<span class="badge badge-phrase">' + phIcon('chat-circle') + ' ' + q.typeLabel + '</span>' +
    '<span style="font-size:.8rem;color:var(--text-faint)">' + nativeLang.toUpperCase() + ' → ' + lang.toUpperCase() + '</span>' +
    '</div>' +
    '<p style="color:var(--text-muted);font-size:.9rem;margin-bottom:8px">' + t('train_reconstruct') + '</p>' +
    '<div class="phrase-translation" id="examPhraseTransEl">' + transHtml + '</div>' +
    (q.helpNote ? '<p class="phrase-hint">' + esc(q.helpNote) + '</p>' : '') +
    '<div class="answer-zone" id="examAnswerZone">' +
    '<span class="answer-zone-placeholder" id="examAnswerPlaceholder">' + t('train_placeholder') + '</span>' +
    '</div>' +
    '<div class="word-bank" id="examWordBank"></div>' +
    '<div id="examPhraseResult" class="phrase-result hidden"></div>' +
    '<div class="phrase-actions">' +
    '<button class="btn btn-primary" id="examCheckBtn" onclick="examCheckPhrase()" style="flex:1">' + t('train_check') + ' ' + phIcon('check') + '</button>' +
    '<button class="btn btn-secondary hidden" id="examNextBtn" onclick="examNext()" style="flex:1">' + t('exam_next') + ' →</button>' +
    '<button class="btn btn-secondary" onclick="examClearPhrase()" title="Clear" style="padding:12px 16px">' + phIcon('arrow-counter-clockwise') + '</button>' +
    '</div></div>';
}

function _examInitPhraseEvents(q) {
  const words = q.text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return;
  const tokens = words.map((w, i) => ({ word: w, idx: i }));
  const distractors = _examGetDistractors(q.langCode, words);
  distractors.forEach((w, i) => tokens.push({ word: w, idx: 1000 + i }));
  _examShuffle(tokens);

  const bank = document.getElementById('examWordBank');
  tokens.forEach(tok => {
    const btn = document.createElement('div');
    btn.className = 'word-token';
    btn.dataset.idx = tok.idx;
    btn.dataset.word = tok.word;
    btn.textContent = tok.word;
    btn.addEventListener('click', () => _examAddToken(btn));
    bank.appendChild(btn);
  });
}

function _examAddToken(btn) {
  if (btn.classList.contains('used')) return;
  btn.classList.add('used');
  const lang = currentLang();
  if (lang) TTS.speak(btn.dataset.word, lang);

  const zone = document.getElementById('examAnswerZone');
  const ph = document.getElementById('examAnswerPlaceholder');
  if (ph) ph.style.display = 'none';

  const chip = document.createElement('div');
  chip.className = 'word-token in-answer';
  chip.textContent = btn.dataset.word;
  chip.dataset.idx = btn.dataset.idx;
  chip.addEventListener('click', () => {
    chip.remove();
    btn.classList.remove('used');
    if (!document.querySelectorAll('#examAnswerZone .in-answer').length && ph) ph.style.display = '';
  });
  zone.appendChild(chip);
}

window.examClearPhrase = function () {
  document.querySelectorAll('#examAnswerZone .in-answer').forEach(c => c.remove());
  document.querySelectorAll('#examWordBank .word-token').forEach(b => b.classList.remove('used'));
  const ph = document.getElementById('examAnswerPlaceholder');
  if (ph) ph.style.display = '';
  const zone = document.getElementById('examAnswerZone');
  if (zone) zone.className = 'answer-zone';
};

window.examCheckPhrase = function () {
  const q = _examQuestions[_examCurrentIdx];
  if (!q || q.type !== 'phrase') return;
  const chips = [...document.querySelectorAll('#examAnswerZone .in-answer')];
  if (!chips.length) return;

  const answer = chips.map(c => c.textContent).join(' ');
  const correct = answer.trim().toLowerCase() === q.text.trim().toLowerCase();

  document.getElementById('examAnswerZone').className = 'answer-zone ' + (correct ? 'correct' : 'wrong');
  const resultEl = document.getElementById('examPhraseResult');
  resultEl.className = 'phrase-result ' + (correct ? 'correct' : 'wrong');
  resultEl.innerHTML = correct
    ? phIcon('check') + ' ' + t('exam_correct')
    : phIcon('x-red') + ' ' + t('exam_wrong') + ' <strong>' + esc(q.text) + '</strong>';
  resultEl.classList.remove('hidden');

  document.getElementById('examCheckBtn').classList.add('hidden');
  document.getElementById('examNextBtn').classList.remove('hidden');

  _examRecordAnswer(correct);
  TTS.speak(q.text, q.langCode);
  api('POST', '/api/quiz/phrase/answer', { lang: q.langCode, id: q.id, correct }).catch(() => {});
};

// ── Writing question ──────────────────────────────────────────────────────────
function _examRenderWriting(q) {
  const lang = q.langCode;
  const nativeLang = (App.config && App.config.nativeLang) || 'en';
  const segments = q.answerText.split(' ');
  const zoneHtml = segments.map((seg, si) => {
    const slots = seg.split('').map((_, li) =>
      '<span class="letter-slot" data-seg="' + si + '" data-pos="' + li + '"></span>'
    ).join('');
    return '<span class="writing-segment" data-seg="' + si + '">' + slots + '</span>';
  }).join('<span class="writing-space-sep"> </span>');

  const iconLabel = {
    noun: { key: 'vocab_noun', icon: 'package' },
    verb: { key: 'vocab_verb', icon: 'lightning' },
    adjective: { key: 'vocab_adjective', icon: 'palette' },
    adverb: { key: 'vocab_adverb', icon: 'wind' },
    other: { key: 'vocab_other', icon: 'puzzle-piece' }
  };
  const tl = iconLabel[q.wordType] || { key: 'vocab_other', icon: 'puzzle-piece' };

  return '<div class="quiz-card" id="examQuizCard">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;justify-content:center;flex-wrap:wrap">' +
    '<span class="badge badge-phrase">' + phIcon('pen-nib') + ' ' + q.typeLabel + '</span>' +
    '<div class="badge badge-' + q.wordType + '">' + phIcon(tl.icon) + ' ' + t(tl.key) + '</div>' +
    '<span style="font-size:.8rem;color:var(--text-faint)">' + nativeLang.toUpperCase() + ' → ' + lang.toUpperCase() + '</span>' +
    '</div>' +
    '<div class="question-word" style="display:flex;align-items:center;justify-content:center;gap:10px">' +
    '<span id="examWritingPrompt">' + esc(q.promptText) + '</span>' +
    '<span id="examWritingTtsSlot"></span>' +
    '</div>' +
    (q.definition ? '<div class="question-def">' + esc(q.definition) + '</div>' : '') +
    '<p class="question-instr">' + t('train_writing_instr') + '</p>' +
    '<div class="writing-answer-zone" id="examWritingZone">' + zoneHtml + '</div>' +
    '<div class="word-bank" id="examLetterBank"></div>' +
    '<div id="examWritingResult" class="phrase-result hidden"></div>' +
    '<div class="phrase-actions" style="margin-top:16px">' +
    '<button class="btn btn-primary" id="examCheckBtn" onclick="examCheckWriting()" style="flex:1">' + t('train_writing_check') + ' ' + phIcon('check') + '</button>' +
    '<button class="btn btn-secondary hidden" id="examNextBtn" onclick="examNext()" style="flex:1">' + t('exam_next') + ' →</button>' +
    '<button class="btn btn-secondary" onclick="examClearWriting()" title="Clear" style="padding:12px 16px">' + phIcon('arrow-counter-clockwise') + '</button>' +
    '</div></div>';
}

function _examInitWritingEvents(q) {
  const targetWord = q.answerText;
  const segments = targetWord.split(' ');
  const neededLetters = segments.join('').split('');

  const commonLetters = {
    fr: 'eaiuonsrlmtdpcgbfhvjqxyz',
    en: 'etaoinshrdlucmfywgpbvkjxqz',
    de: 'enisrathdulgomcbfkwzpvjyqx',
    es: 'eaoinsrlcdtumpbgvhfyqjzxkw',
    it: 'eaoinsrltcmdupbgvhfzqjkxyw',
    uk: '\u0430\u043e\u0435\u0438\u043d\u0442\u0441\u0440\u043b\u0432\u043a\u043c\u0434\u043f\u0437\u0443\u0433\u044f\u0431\u0447\u0448\u0444\u0439\u0446\u0445\u0436\u0435',
    default: 'etaoinshrdlucmfywgpbvkjxqz'
  }[q.langCode] || 'etaoinshrdlucmfywgpbvkjxqz';

  const neededSet = new Set(neededLetters.map(c => c.toLowerCase()));
  const candidates = commonLetters.split('').filter(c => !neededSet.has(c));
  const maxExtras = Math.max(3, Math.ceil(neededLetters.length / 2));
  const extras = [];
  for (let i = 0; i < maxExtras && candidates.length; i++) {
    extras.push(candidates[Math.floor(Math.random() * candidates.length)]);
  }

  const allLetters = [...neededLetters, ...extras];
  _examShuffle(allLetters);
  _examWritingLetterBank = allLetters.map((ch, i) => ({ ch, idx: i, used: false }));

  const bank = document.getElementById('examLetterBank');
  _examWritingLetterBank.forEach(tok => {
    const btn = document.createElement('div');
    btn.className = 'word-token letter-token';
    btn.dataset.idx = tok.idx;
    btn.textContent = tok.ch;
    btn.addEventListener('click', () => _examAddLetter(btn, tok));
    bank.appendChild(btn);
  });

  const ttsSlot = document.getElementById('examWritingTtsSlot');
  if (ttsSlot) {
    ttsSlot.appendChild(TTS.button(targetWord, q.langCode, null, q.id));
    ttsSlot.appendChild(TTS.buttonSlow(targetWord, q.langCode, null, q.id));
  }
}

function _examAddLetter(btn, tok) {
  if (tok.used) return;
  const allSlots = [...document.querySelectorAll('#examWritingZone .letter-slot')];
  const emptySlot = allSlots.find(s => !s.dataset.filled);
  if (!emptySlot) return;
  tok.used = true;
  btn.classList.add('used');
  emptySlot.dataset.filled = '1';
  emptySlot.dataset.tokenIdx = tok.idx;
  emptySlot.textContent = tok.ch;
  emptySlot.classList.add('filled-slot');
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

window.examClearWriting = function () {
  document.querySelectorAll('#examWritingZone .letter-slot.filled-slot').forEach(slot => {
    const idx = parseInt(slot.dataset.tokenIdx, 10);
    const tok = _examWritingLetterBank.find(t => t.idx === idx);
    if (tok) {
      tok.used = false;
      const btn = document.querySelector('#examLetterBank .letter-token[data-idx="' + idx + '"]');
      if (btn) btn.classList.remove('used');
    }
    slot.textContent = '';
    slot.classList.remove('filled-slot');
    delete slot.dataset.filled;
    delete slot.dataset.tokenIdx;
  });
};

window.examCheckWriting = function () {
  const q = _examQuestions[_examCurrentIdx];
  if (!q || q.type !== 'writing') return;
  const targetWord = q.answerText;
  const segments = targetWord.split(' ');
  const typedSegments = segments.map((seg, si) => {
    const slots = [...document.querySelectorAll('#examWritingZone .letter-slot[data-seg="' + si + '"]')];
    return slots.map(s => s.textContent || '').join('');
  });
  const reconstructed = typedSegments.join(' ');
  const correct = reconstructed.trim().toLowerCase() === targetWord.trim().toLowerCase();

  document.getElementById('examWritingZone').classList.add(correct ? 'correct' : 'wrong');
  const resultEl = document.getElementById('examWritingResult');
  resultEl.className = 'phrase-result ' + (correct ? 'correct' : 'wrong');
  resultEl.innerHTML = correct
    ? phIcon('check') + ' ' + t('exam_correct')
    : phIcon('x-red') + ' ' + t('exam_wrong') + ' <strong>' + esc(targetWord) + '</strong>';
  resultEl.classList.remove('hidden');

  document.getElementById('examCheckBtn').classList.add('hidden');
  document.getElementById('examNextBtn').classList.remove('hidden');

  document.querySelectorAll('#examLetterBank .letter-token').forEach(b => b.style.pointerEvents = 'none');
  document.querySelectorAll('#examWritingZone .letter-slot').forEach(s => s.style.pointerEvents = 'none');

  _examRecordAnswer(correct);
  TTS.speak(targetWord, q.langCode);
  api('POST', '/api/quiz/answer', { lang: q.langCode, id: q.id, answer: reconstructed, expectedAnswer: targetWord }).catch(() => {});
};

// ── Audio matching question (5 sounds ↔ 5 answers, 2-column grid) ─────────────
const _EXAM_WAVEFORM_BARS =
  '<span class="waveform-bar"></span>'.repeat(7);

function _examRenderAudio(q) {
  const rowCount = Math.min(q.soundsOrder.length, q.answersOrder.length);
  const cells = [];

  for (let i = 0; i < rowCount; i++) {
    const soundPair = q.soundsOrder[i];
    const answerPair = q.answersOrder[i];
    const p = q.pairs[answerPair];

    cells.push(
      '<button class="exam-sound-btn" data-pairid="' + soundPair + '" onclick="examSelectMatchSound(' + soundPair + ', this)">' +
      '<span class="exam-sound-num">' + (i + 1) + '</span>' +
      '<span class="waveform-container">' + _EXAM_WAVEFORM_BARS + '</span>' +
      '</button>'
    );

    cells.push(
      '<button class="choice-btn exam-match-answer" data-pairid="' + answerPair + '" onclick="examSelectMatchAnswer(' + answerPair + ', this)">' +
      esc(capitalizeFirst(p.answerText)) + '</button>'
    );
  }

  return '<div class="quiz-card" id="examQuizCard">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;justify-content:center;flex-wrap:wrap">' +
    '<span class="badge badge-phrase">' + phIcon('speaker-high') + ' ' + q.typeLabel + '</span>' +
    '</div>' +
    '<p class="question-instr">' + t('exam_listen_match') + '</p>' +
    '<div class="exam-match-grid" id="examMatchGrid">' + cells.join('') + '</div>' +
    '<div id="examMatchStatus" class="question-instr" style="margin-top:14px"></div>' +
    '</div>';
}

window.examSelectMatchSound = function (pairId, btn) {
  const q = _examQuestions[_examCurrentIdx];
  if (!q || q.type !== 'audio') return;

  const p = q.pairs[pairId];
  const wf = btn.querySelector('.waveform-container');
  TTS.speak(p.audioText, q.langCode, p.refId).then(audioEl => {
    if (!audioEl) return;
    if (wf) wf.classList.add('playing');
    audioEl.addEventListener('ended', () => { if (wf) wf.classList.remove('playing'); }, { once: true });
  }).catch(() => { if (wf) wf.classList.remove('playing'); });

  if (btn.classList.contains('matched')) return;
  _examMatchActivePair = pairId;
  document.querySelectorAll('#examMatchGrid .exam-sound-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

window.examSelectMatchAnswer = function (pairId, btn) {
  const q = _examQuestions[_examCurrentIdx];
  if (!q || q.type !== 'audio') return;
  if (btn.classList.contains('matched')) return;

  if (_examMatchActivePair === null) {
    const st = document.getElementById('examMatchStatus');
    if (st) st.innerHTML = phIcon('arrow-up') + ' ' + t('exam_listen_match');
    return;
  }

  const activePair = _examMatchActivePair;
  const soundBtn = document.querySelector('#examMatchGrid .exam-sound-btn.active');
  const correct = activePair === pairId;

  btn.classList.add('matched', correct ? 'correct' : 'wrong');
  if (soundBtn) {
    soundBtn.classList.add('matched', correct ? 'correct' : 'wrong');
    soundBtn.classList.remove('active');
  }

  _examMatchDone++;
  if (!correct) _examMatchAllCorrect = false;

  const p = q.pairs[activePair];
  const status = document.getElementById('examMatchStatus');
  if (status) {
    status.innerHTML = (correct ? phIcon('check') + ' ' + t('exam_correct') : phIcon('x-red') + ' ' + t('exam_wrong')) +
      ' <span style="color:var(--text-faint)">' + _examMatchDone + '/' + q.pairs.length + '</span>';
  }

  if (p.isPhrase) {
    api('POST', '/api/quiz/phrase/answer', { lang: q.langCode, id: p.refId, correct }).catch(() => {});
  } else {
    api('POST', '/api/quiz/answer', {
      lang: q.langCode,
      id: p.refId,
      answer: q.pairs[pairId].answerText,
      expectedAnswer: p.answerText
    }).catch(() => {});
  }

  _examMatchActivePair = null;

  if (_examMatchDone >= q.pairs.length) {
    _examRecordAnswer(_examMatchAllCorrect);
    const card = document.getElementById('examQuizCard');
    const nextRow = document.createElement('div');
    nextRow.style.cssText = 'margin-top:20px;width:100%;text-align:center';
    nextRow.innerHTML =
      '<button class="btn btn-primary" onclick="examNext()">' + t('exam_next') + ' →</button>';
    card.appendChild(nextRow);
  }
};

// ── Answer recording ─────────────────────────────────────────────────────────
function _examRecordAnswer(correct, animate) {
  if (correct) {
    _examCorrect++; _examStreak++;
    if (animate !== false) {
      _triggerGreenBorder('examQuizCard');
      _examCheckComboConfetti();
    }
  } else {
    _examWrong++; _examStreak = 0;
  }
  _examUpdateScore();
}

function _examUpdateScore() {
  const ce = document.getElementById('examCorrect');
  const we = document.getElementById('examWrong');
  const se = document.getElementById('examStreak');
  if (ce) ce.textContent = _examCorrect;
  if (we) we.textContent = _examWrong;
  if (se) se.textContent = _examStreak;
}

// ── UX: Green border & combofetti (same as training, follows user settings) ──
window.toggleGreenBorder = function (checked) {
  if (!App.config) return;
  App.config.showGreenBorder = checked;
  saveConfig({ showGreenBorder: checked });
};

window.toggleConfetti = function (checked) {
  if (!App.config) return;
  App.config.showConfetti = checked;
  saveConfig({ showConfetti: checked });
};

function _triggerGreenBorder(id) {
  if (App.config && App.config.showGreenBorder === false) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('correct');

  requestAnimationFrame(function () {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const bw = parseFloat(getComputedStyle(el).borderTopWidth) || 1.5;
    const r = 16;
    const halfTop = Math.max(0, w / 2 - r);
    const side = Math.max(0, h - 2 * r);
    const bottom = Math.max(0, w - 2 * r);
    const arc = Math.PI * r / 2;
    const length = 2 * halfTop + 2 * side + bottom + 4 * arc;

    const d = 'M ' + (w / 2) + ' 0' +
      ' L ' + (w - r) + ' 0' +
      ' A ' + r + ' ' + r + ' 0 0 1 ' + w + ' ' + r +
      ' L ' + w + ' ' + (h - r) +
      ' A ' + r + ' ' + r + ' 0 0 1 ' + (w - r) + ' ' + h +
      ' L ' + r + ' ' + h +
      ' A ' + r + ' ' + r + ' 0 0 1 0 ' + (h - r) +
      ' L 0 ' + r +
      ' A ' + r + ' ' + r + ' 0 0 1 ' + r + ' 0' +
      ' L ' + (w / 2) + ' 0';

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.style.cssText = 'position:absolute;top:' + (-bw) + 'px;left:' + (-bw) + 'px;pointer-events:none;overflow:visible';
    svg.classList.add('correct-border-svg');

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#439b00');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linecap', 'butt');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-dasharray', length);
    svg.appendChild(path);
    el.appendChild(svg);

    const anim = path.animate([
      { strokeDashoffset: length },
      { strokeDashoffset: 0 }
    ], { duration: 600, easing: 'linear' });
    anim.onfinish = function () { el.classList.add('correct-breathe'); };
  });
}

function _examCheckComboConfetti() {
  if (_examStreak > 0 && _examStreak % 10 === 0) {
    _fireConfetti();
  }
}

function _fireConfetti() {
  if (App.config && App.config.showConfetti === false) return;

  const colors = ['#439b00', '#ff4b4b', '#ffc800', '#1cb0f6', '#9b59b6', '#e67e22', '#2ecc71', '#e74c3c', '#3498db'];
  const count = 150;

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const particles = [];

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 5,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: Math.random() * 4 - 2,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * 360,
      rotSpd: Math.random() * 10 - 5,
      opacity: 1
    });
  }

  let frame = 0;
  const maxFrames = 180;
  const fadeStart = maxFrames * 0.55;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.rot += p.rotSpd;
      if (p.y < canvas.height + 20) {
        alive = true;
        const t = Math.max(0, Math.min(1, (frame - fadeStart) / (maxFrames - fadeStart)));
        const alpha = 1 - t;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    }
    if (alive && frame < maxFrames) {
      frame++;
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }
  animate();
}

window.examNext = function () {
  _examCurrentIdx++;
  _examRenderQuestion();
};

// ── Results ───────────────────────────────────────────────────────────────────
function _examRenderResults() {
  const area = document.getElementById('examQuizArea');
  const total = _examCorrect + _examWrong;
  const pct = total > 0 ? Math.round((_examCorrect / total) * 100) : 0;
  const scoreClass = pct >= 80 ? 'good' : pct >= 50 ? 'ok' : 'bad';

  const lang = currentLang();
  const best = _examSaveBestScore(lang, pct, new Date().toISOString());
  const bestHtml = best ? '<p style="margin-top:8px;font-size:.9rem;color:var(--text-muted)">' + t('exam_best_score') + ': <strong>' + best.percentage + '%</strong></p>' : '';

  const history = _examLoadHistory();
  let historyHtml = '';
  if (history.length) {
    const rows = history.slice(0, 10).map(h => {
      const hPct = h.total > 0 ? Math.round((h.correct / h.total) * 100) : 0;
      const hClass = hPct >= 80 ? 'good' : hPct >= 50 ? 'ok' : 'bad';
      const dateStr = h.date ? new Date(h.date).toLocaleDateString() : '—';
      return '<div class="exam-history-item">' +
        '<span class="exam-h-date">' + esc(dateStr) + '</span>' +
        '<span class="exam-h-score">' + h.correct + '/' + h.total + '</span>' +
        '<span class="exam-h-pct ' + hClass + '">' + hPct + '%</span>' +
        '</div>';
    }).join('');
    historyHtml = '<div class="exam-history"><h4>' + t('exam_history') + '</h4><div class="exam-history-list">' + rows + '</div></div>';
  }

  area.innerHTML =
    '<div class="quiz-card exam-result-card">' +
    '<p style="font-size:2rem;margin-bottom:8px">' + phIcon('confetti') + '</p>' +
    '<h2 style="margin-bottom:4px">' + t('exam_results_title') + '</h2>' +
    '<div class="exam-result-score ' + scoreClass + '">' + _examCorrect + '/' + total + '</div>' +
    '<div class="exam-result-pct ' + scoreClass + '">' + pct + '%</div>' +
    '<div class="exam-result-breakdown">' +
    '<span>' + phIcon('check') + ' ' + _examCorrect + ' ' + t('exam_correct_count') + '</span>' +
    '<span>' + phIcon('x-red') + ' ' + _examWrong + ' ' + t('exam_wrong_count') + '</span>' +
    '</div>' +
    bestHtml +
    '<div style="display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap">' +
    '<button class="btn btn-primary" onclick="navigate(\'exam\')">' + phIcon('arrows-clockwise') + ' ' + t('exam_restart') + '</button>' +
    '<button class="btn btn-secondary" onclick="navigate(\'home\')">' + phIcon('house') + ' ' + t('exam_back_home') + '</button>' +
    '</div>' +
    historyHtml +
    '</div>';

  _examSaveHistory({ date: new Date().toISOString(), total, correct: _examCorrect, wrong: _examWrong, lang });
}

// ── Distractors ───────────────────────────────────────────────────────────────
function _examGetDistractors(langCode, words) {
  const pool = {
    fr: ['le', 'la', 'les', 'un', 'une', 'des', 'et', 'mais', 'de', 'du', 'est', 'pas', 'que', 'je', 'tu'],
    en: ['the', 'a', 'an', 'and', 'but', 'of', 'is', 'are', 'not', 'I', 'you', 'we', 'they', 'in', 'on'],
    de: ['der', 'die', 'das', 'ein', 'und', 'ist', 'nicht', 'ich', 'du', 'wir', 'sie', 'es', 'in', 'auf'],
    es: ['el', 'la', 'los', 'un', 'una', 'y', 'de', 'es', 'no', 'yo', 't\u00fa', 'que', 'en', 'se'],
    it: ['il', 'la', 'i', 'un', 'e', 'di', '\u00e8', 'non', 'io', 'tu', 'che', 'in', 'su', 'si'],
    uk: ['\u044f', '\u0442\u0438', '\u0432\u0456\u043d', '\u0432\u043e\u043d\u0430', '\u0432\u043e\u043d\u043e', '\u043c\u0438', '\u0432\u0438', '\u0432\u043e\u043d\u0438', '\u0446\u0435', '\u0442\u0430', '\u0430\u043b\u0435', '\u043d\u0435', '\u0432', '\u043d\u0430', '\u0437'],
  }[langCode] || ['the', 'a', 'and', 'of', 'in'];
  const used = new Set(words.map(w => w.toLowerCase()));
  return _examShuffle(pool.filter(w => !used.has(w))).slice(0, 3);
}

function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}