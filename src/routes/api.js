'use strict';
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const {
  getWords, saveWords,
  getPhrases, savePhrases,
  getUserConfig, saveUserConfig
} = require('../utils/storage');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const uid  = () => req => req.user.id;
const TYPES = ['noun','verb','adjective','adverb'];

function userId(req) { return req.user.id; }

// ─────────────────────────────────────────────────────────────────────────────
// USER CONFIG / LANGUAGES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/config
router.get('/config', (req, res) => {
  res.json(getUserConfig(userId(req)));
});

// PUT /api/config
router.put('/config', (req, res) => {
  const cfg = getUserConfig(userId(req));
  const allowed = ['nativeLang','targetLangs','currentLang','uiLang','darkMode'];
  allowed.forEach(k => { if (req.body[k] !== undefined) cfg[k] = req.body[k]; });
  saveUserConfig(userId(req), cfg);
  res.json({ ok: true, config: cfg });
});

// POST /api/languages  – add a language to user's list
router.post('/languages', (req, res) => {
  const { isoCode, name, flag, nativeName } = req.body;
  if (!isoCode || !name) return res.status(400).json({ error: 'isoCode and name required.' });

  const cfg = getUserConfig(userId(req));
  if (!cfg.targetLangs) cfg.targetLangs = [];
  if (!cfg.targetLangs.find(l => l.isoCode === isoCode)) {
    cfg.targetLangs.push({ isoCode, name, flag: flag||'🌐', nativeName: nativeName||name });
  }
  if (!cfg.currentLang) cfg.currentLang = isoCode;
  saveUserConfig(userId(req), cfg);
  res.json({ ok: true });
});

// DELETE /api/languages/:code
router.delete('/languages/:code', (req, res) => {
  const cfg = getUserConfig(userId(req));
  cfg.targetLangs = (cfg.targetLangs || []).filter(l => l.isoCode !== req.params.code);
  if (cfg.currentLang === req.params.code)
    cfg.currentLang = cfg.targetLangs.length ? cfg.targetLangs[0].isoCode : null;
  saveUserConfig(userId(req), cfg);
  res.json({ ok: true });
});

// PUT /api/languages/:code  – update language settings (declensions, verb groups)
router.put('/languages/:code', (req, res) => {
  const cfg = getUserConfig(userId(req));
  const lang = (cfg.targetLangs || []).find(l => l.isoCode === req.params.code);
  if (!lang) return res.status(404).json({ error: 'Language not found.' });

  // declensions: array of { id, nativeName, targetName }
  if (req.body.declensions !== undefined) lang.declensions = req.body.declensions;
  // verbGroups: array of { id, name }
  if (req.body.verbGroups !== undefined) lang.verbGroups = req.body.verbGroups;

  saveUserConfig(userId(req), cfg);
  res.json({ ok: true, lang });
});

// GET /api/tts?lang=uk&q=молоко  – proxy Google TTS to avoid CORS/referer blocks
router.get('/tts', async (req, res) => {
  const { lang, q } = req.query;
  if (!lang || !q) return res.status(400).json({ error: 'lang and q required' });
  const https = require('https');
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}&client=tw-ob`;
  const request = https.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; OpenFlashcards/1.0)',
      'Referer': 'https://translate.google.com/'
    }
  }, (upstream) => {
    if (upstream.statusCode !== 200) {
      res.status(upstream.statusCode).end();
      return;
    }
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    upstream.pipe(res);
  });
  request.on('error', () => res.status(502).end());
});

// ─────────────────────────────────────────────────────────────────────────────
// WORDS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/words?lang=fr[&type=verb]
router.get('/words', (req, res) => {
  const { lang, type } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  let words = getWords(userId(req), lang);
  if (type) words = words.filter(w => w.type === type);
  res.json(words);
});

// POST /api/words
router.post('/words', (req, res) => {
  const { lang, type, literal, translation, definition, article, infinitive, conjugation, declensions, verbGroup } = req.body;
  if (!lang || !type || !literal || !translation)
    return res.status(400).json({ error: 'lang, type, literal, translation required.' });
  if (!TYPES.includes(type))
    return res.status(400).json({ error: `type must be one of: ${TYPES.join(', ')}` });

  const words = getWords(userId(req), lang);
  if (words.find(w => w.id === literal))
    return res.status(409).json({ error: 'Word already exists.' });

  const word = {
    id: uuidv4(),
    type,
    literal: literal.trim(),
    translation: translation.trim(),
    definition: definition ? definition.trim() : '',
    langCode: lang,
    difficulty: 5000,
    createdAt: new Date().toISOString()
  };
  if (type === 'noun') word.article = article ? article.trim() : '';
  if (type === 'verb') {
    word.infinitive  = infinitive  ? infinitive.trim()  : '';
    word.conjugation = conjugation || {};
    if (verbGroup !== undefined) word.verbGroup = verbGroup;
  }
  if (declensions !== undefined) word.declensions = declensions;

  words.push(word);
  saveWords(userId(req), lang, words);
  res.status(201).json({ ok: true, word });
});

// PUT /api/words/:id
router.put('/words/:id', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  const words = getWords(userId(req), lang);
  const idx   = words.findIndex(w => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Word not found.' });

  const w = words[idx];
  ['translation','definition','article','infinitive','conjugation','declensions','verbGroup'].forEach(k => {
    if (req.body[k] !== undefined) w[k] = req.body[k];
  });
  w.updatedAt = new Date().toISOString();
  saveWords(userId(req), lang, words);
  res.json({ ok: true, word: w });
});

// DELETE /api/words/:id
router.delete('/words/:id', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  let words = getWords(userId(req), lang);
  const before = words.length;
  words = words.filter(w => w.id !== req.params.id);
  if (words.length === before) return res.status(404).json({ error: 'Word not found.' });
  saveWords(userId(req), lang, words);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHRASES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/phrases?lang=fr
router.get('/phrases', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  res.json(getPhrases(userId(req), lang));
});

// GET /api/phrases/random?lang=fr
router.get('/phrases/random', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  const phrases = getPhrases(userId(req), lang);
  if (!phrases.length) return res.status(404).json({ error: 'No phrases yet for this language.' });
  res.json(phrases[Math.floor(Math.random() * phrases.length)]);
});

// POST /api/phrases
router.post('/phrases', (req, res) => {
  const { lang, text, translation, helpNote } = req.body;
  if (!lang || !text || !translation)
    return res.status(400).json({ error: 'lang, text, translation required.' });

  const phrases = getPhrases(userId(req), lang);
  const phrase = {
    id: uuidv4(),
    langCode: lang,
    text: text.trim(),
    translation: translation.trim(),
    helpNote: helpNote ? helpNote.trim() : '',
    difficulty: 5000,
    createdAt: new Date().toISOString()
  };
  phrases.push(phrase);
  savePhrases(userId(req), lang, phrases);
  res.status(201).json({ ok: true, phrase });
});

// PUT /api/phrases/:id
router.put('/phrases/:id', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  const phrases = getPhrases(userId(req), lang);
  const idx     = phrases.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Phrase not found.' });

  ['text','translation','helpNote'].forEach(k => {
    if (req.body[k] !== undefined) phrases[idx][k] = req.body[k];
  });
  phrases[idx].updatedAt = new Date().toISOString();
  savePhrases(userId(req), lang, phrases);
  res.json({ ok: true, phrase: phrases[idx] });
});

// DELETE /api/phrases/:id
router.delete('/phrases/:id', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  let phrases = getPhrases(userId(req), lang);
  const before = phrases.length;
  phrases = phrases.filter(p => p.id !== req.params.id);
  if (phrases.length === before) return res.status(404).json({ error: 'Phrase not found.' });
  savePhrases(userId(req), lang, phrases);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ – Words
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/quiz?lang=fr[&type=verb,noun][&direction=random]
router.get('/quiz', (req, res) => {
  const { lang, direction = 'random' } = req.query;
  const types = req.query.types ? req.query.types.split(',') : TYPES;
  if (!lang) return res.status(400).json({ error: 'lang required' });

  let pool = getWords(userId(req), lang).filter(w => types.includes(w.type));
  if (pool.length < 2) return res.status(400).json({ error: 'Add at least 2 words to start!' });

  // Sort by difficulty desc (harder words appear more often → weighted shuffle)
  pool.sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0));
  // Weighted random pick from first 60% of sorted pool
  const topN    = Math.max(2, Math.ceil(pool.length * 0.6));
  const topPool = pool.slice(0, topN);
  const question = topPool[Math.floor(Math.random() * topPool.length)];

  const showNative = direction === 'native' ? true
                   : direction === 'target' ? false
                   : Math.random() < 0.5;

  const display = (question.article && question.article.trim())
    ? `${question.article} ${question.literal}`
    : (question.type === 'verb' && question.infinitive ? question.infinitive : question.literal);

  const promptText  = showNative ? question.translation : display;
  const answerText  = showNative ? display : question.translation;

  // Build 3 decoys
  const others = pool.filter(w => w.id !== question.id);
  shuffle(others);
  const decoys = others.slice(0, 3).map(w => showNative
    ? ((w.article ? w.article + ' ' : '') + (w.type==='verb'&&w.infinitive ? w.infinitive : w.literal))
    : w.translation
  );

  const choices = shuffle([answerText, ...decoys]);

  res.json({
    id:         question.id,
    type:       question.type,
    literal:    question.literal,
    definition: question.definition || '',
    article:    question.article    || '',
    infinitive: question.infinitive || '',
    verbGroup:  question.verbGroup  || '',
    declensions: question.declensions || {},
    langCode:   question.langCode,
    promptText,
    answerText,
    choices,
    showNative,
    helpNote:   question.helpNote || ''
  });
});

// POST /api/quiz/answer
router.post('/quiz/answer', (req, res) => {
  const { lang, id, answer, expectedAnswer } = req.body;
  if (!lang || !id) return res.status(400).json({ error: 'lang and id required.' });

  const words = getWords(userId(req), lang);
  const idx   = words.findIndex(w => w.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Word not found.' });

  const w       = words[idx];
  const display = (w.article ? w.article + ' ' : '') + (w.type==='verb'&&w.infinitive ? w.infinitive : w.literal);
  const correct = answer && (
    w.translation.trim().toLowerCase() === answer.trim().toLowerCase() ||
    display.trim().toLowerCase()        === answer.trim().toLowerCase()
  );

  w.difficulty = correct
    ? Math.max(0,    (w.difficulty || 5000) - 3000)
    : Math.min(10000,(w.difficulty || 5000) + 1000);
  saveWords(userId(req), lang, words);

  res.json({
    correct,
    correctAnswer: expectedAnswer || w.translation,
    message: correct ? '✓ Correct!' : '✗ Wrong. The answer was:'
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ – Phrases
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/quiz/phrase?lang=fr
router.get('/quiz/phrase', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  const phrases = getPhrases(userId(req), lang);
  if (!phrases.length) return res.status(404).json({ error: 'No phrases yet.' });
  const phrase = phrases[Math.floor(Math.random() * phrases.length)];
  res.json(phrase);
});

// POST /api/quiz/phrase/answer
router.post('/quiz/phrase/answer', (req, res) => {
  const { lang, id, correct } = req.body;
  if (!lang || !id) return res.status(400).json({ error: 'lang and id required.' });
  const phrases = getPhrases(userId(req), lang);
  const idx     = phrases.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Phrase not found.' });

  phrases[idx].difficulty = correct
    ? Math.max(0,    (phrases[idx].difficulty || 5000) - 3000)
    : Math.min(10000,(phrases[idx].difficulty || 5000) + 1000);
  savePhrases(userId(req), lang, phrases);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/stats?lang=fr
router.get('/stats', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });

  const words   = getWords(userId(req), lang);
  const phrases = getPhrases(userId(req), lang);

  const byType = {};
  TYPES.forEach(t => { byType[t] = words.filter(w => w.type === t).length; });

  res.json({
    totalWords:   words.length,
    totalPhrases: phrases.length,
    byType,
    mastered:     words.filter(w => (w.difficulty || 5000) < 1000).length,
    learning:     words.filter(w => (w.difficulty || 5000) >= 1000).length
  });
});

// ─────────────────────────────────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = router;
