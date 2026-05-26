'use strict';

// ── Progress helpers ──────────────────────────────────────────────────────────
function wordMaxProgress(literal, infinitive) {
  const minProgressValue = 50;
  const maxProgressValue = 200;
  const coefficient = 5; // Increase to make longer words/phrases harder; decrease to flatten the curve
  const str = (infinitive && infinitive.trim()) ? infinitive.trim() : (literal || '');
  const n = str.length;
  return Math.max(minProgressValue, Math.min(maxProgressValue, Math.round(minProgressValue + Math.sqrt(n) * coefficient)));
}

function phraseMaxProgress(text) {
  const minProgressValue = 50;
  const maxProgressValue = 200;
  const wordCountCoefficient = 10; // Increase to make longer words/phrases harder; decrease to flatten the curve
  const lengthCoefficient = 8; // Increase to make longer words/phrases harder; decrease to flatten the curve
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const avgWordLength = wordCount > 0 ? words.reduce((sum, word) => sum + word.length, 0) / wordCount : 0;

  const score = minProgressValue +
    wordCount * wordCountCoefficient +
    avgWordLength * lengthCoefficient;

  return Math.max(minProgressValue, Math.min(maxProgressValue, Math.round(score)));
}


// Normalize a conjugation entry: string → {form, translation}
function normConj(entry) {
  if (!entry) return { form: '', translation: '' };
  if (typeof entry === 'string') return { form: entry, translation: '' };
  return { form: entry.form || '', translation: entry.translation || '' };
}

const router = require('express').Router();
const { randomUUID } = require('crypto');
const {
  getWords, saveWords,
  getPhrases, savePhrases,
  getUserConfig, saveUserConfig
} = require('../utils/storage');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const uid = () => req => req.user.id;
const TYPES = ['noun', 'verb', 'adjective', 'adverb'];

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
  const allowed = ['nativeLang', 'targetLangs', 'currentLang', 'uiLang', 'darkMode'];
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
    cfg.targetLangs.push({ isoCode, name, flag: flag || '🌐', nativeName: nativeName || name });
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
  if (req.body.labels !== undefined) lang.labels = req.body.labels;
  // TTS speeds: floats 0.1–1.0
  if (req.body.ttsSpeedNormal !== undefined) lang.ttsSpeedNormal = req.body.ttsSpeedNormal;
  if (req.body.ttsSpeedSlow !== undefined) lang.ttsSpeedSlow = req.body.ttsSpeedSlow;

  saveUserConfig(userId(req), cfg);
  res.json({ ok: true, lang });
});

// ── TTS helpers ───────────────────────────────────────────────────────────────
// Uses msedge-tts (npm) — free, no API key, no Python required.
// Install once: npm install msedge-tts
// Full voice list: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support

// Map ISO language codes → best msedge-tts voice (BCP-47 ShortName).
const EDGE_TTS_VOICES = {
  'af':    'af-ZA-AdriNeural',
  'sq':    'sq-AL-AnilaNeural',
  'am':    'am-ET-AmehaNeural',
  'ar':    'ar-SA-ZariyahNeural',
  'az':    'az-AZ-BabekNeural',
  'bn':    'bn-BD-NabanitaNeural',
  'bs':    'bs-BA-VesnaNeural',
  'bg':    'bg-BG-KalinaNeural',
  'my':    'my-MM-NilarNeural',
  'ca':    'ca-ES-JoanaNeural',
  'zh':    'zh-CN-XiaoxiaoNeural',
  'zh-tw': 'zh-TW-HsiaoChenNeural',
  'zh-hk': 'zh-HK-HiuGaaiNeural',
  'hr':    'hr-HR-GabrijelaNeural',
  'cs':    'cs-CZ-VlastaNeural',
  'da':    'da-DK-ChristelNeural',
  'nl':    'nl-NL-ColetteNeural',
  'en':    'en-US-JennyNeural',
  'et':    'et-EE-AnuNeural',
  'fil':   'fil-PH-BlessicaNeural',
  'fi':    'fi-FI-SelmaNeural',
  'fr':    'fr-FR-DeniseNeural',
  'gl':    'gl-ES-SabelaNeural',
  'ka':    'ka-GE-EkaNeural',
  'de':    'de-DE-KatjaNeural',
  'el':    'el-GR-AthinaNeural',
  'gu':    'gu-IN-DhwaniNeural',
  'he':    'he-IL-HilaNeural',
  'hi':    'hi-IN-SwaraNeural',
  'hu':    'hu-HU-NoemiNeural',
  'is':    'is-IS-GudrunNeural',
  'id':    'id-ID-GadisNeural',
  'ga':    'ga-IE-OrlaNeural',
  'it':    'it-IT-ElsaNeural',
  'ja':    'ja-JP-NanamiNeural',
  'jv':    'jv-ID-SitiNeural',
  'kn':    'kn-IN-SapnaNeural',
  'kk':    'kk-KZ-AigulNeural',
  'km':    'km-KH-SreymomNeural',
  'ko':    'ko-KR-SunHiNeural',
  'lo':    'lo-LA-KeomanyNeural',
  'lv':    'lv-LV-EveritaNeural',
  'lt':    'lt-LT-OnaNeural',
  'mk':    'mk-MK-MarijaNeural',
  'ms':    'ms-MY-YasminNeural',
  'ml':    'ml-IN-SobhanaNeural',
  'mt':    'mt-MT-GraceNeural',
  'mr':    'mr-IN-AarohiNeural',
  'mn':    'mn-MN-YesuiNeural',
  'ne':    'ne-NP-HemkalaNeural',
  'nb':    'nb-NO-PernilleNeural',
  'ps':    'ps-AF-LatifaNeural',
  'fa':    'fa-IR-DilaraNeural',
  'pl':    'pl-PL-ZofiaNeural',
  'pt':    'pt-PT-RaquelNeural',
  'pt-br': 'pt-BR-FranciscaNeural',
  'ro':    'ro-RO-AlinaNeural',
  'ru':    'ru-RU-SvetlanaNeural',
  'sr':    'sr-RS-SophieNeural',
  'si':    'si-LK-ThiliniNeural',
  'sk':    'sk-SK-ViktoriaNeural',
  'sl':    'sl-SI-PetraNeural',
  'so':    'so-SO-UbaxNeural',
  'es':    'es-ES-ElviraNeural',
  'su':    'su-ID-TutiNeural',
  'sw':    'sw-KE-ZuriNeural',
  'sv':    'sv-SE-SofieNeural',
  'ta':    'ta-IN-PallaviNeural',
  'te':    'te-IN-ShrutiNeural',
  'th':    'th-TH-PremwadeeNeural',
  'tr':    'tr-TR-EmelNeural',
  'uk':    'uk-UA-PolinaNeural',
  'ur':    'ur-PK-UzmaNeural',
  'uz':    'uz-UZ-MadinaNeural',
  'vi':    'vi-VN-HoaiMyNeural',
  'cy':    'cy-GB-NiaNeural',
  'zu':    'zu-ZA-ThandoNeural',
};

// Convert numeric speed (0.1–3.0, 1.0 = normal) to SSML prosody rate string.
// msedge-tts accepts "+50%" / "-30%" relative values.
function speedToEdgeRate(speed) {
  const pct = Math.round((speed - 1) * 100);
  return (pct >= 0 ? '+' : '') + pct + '%';
}

// Resolve ISO lang code → ShortName voice, stripping region subtag as fallback.
function edgeVoiceFor(langCode) {
  const lc = langCode.toLowerCase();
  if (EDGE_TTS_VOICES[lc]) return EDGE_TTS_VOICES[lc];
  const base = lc.split('-')[0];
  return EDGE_TTS_VOICES[base] || null;
}

// Lazy-load msedge-tts to avoid crashing at startup if the package isn't
// installed yet (the route will simply return 502 instead).
let _MsEdgeTTS = null;
let _OUTPUT_FORMAT = null;
function loadMsEdgeTTS() {
  if (!_MsEdgeTTS) {
    try {
      const mod = require('msedge-tts');
      _MsEdgeTTS    = mod.MsEdgeTTS;
      _OUTPUT_FORMAT = mod.OUTPUT_FORMAT;
    } catch {
      throw new Error('msedge-tts not installed — run: npm install msedge-tts');
    }
  }
  return { MsEdgeTTS: _MsEdgeTTS, OUTPUT_FORMAT: _OUTPUT_FORMAT };
}

// Stream MP3 audio from msedge-tts into the Express response.
async function edgeTTS(text, langCode, speed, res) {
  const voice = edgeVoiceFor(langCode);
  if (!voice) throw new Error(`No msedge-tts voice for language: ${langCode}`);

  const { MsEdgeTTS, OUTPUT_FORMAT } = loadMsEdgeTTS();
  const rate = speedToEdgeRate(speed);

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

  if (!res.headersSent) {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }

  // toStream() returns { audioStream, metadataStream, requestId } — not a stream directly
  const { audioStream } = tts.toStream(text, { rate });
  await new Promise((resolve, reject) => {
    audioStream.on('close', resolve);
    audioStream.on('error', reject);
    audioStream.pipe(res, { end: true });
  });
}

// GET /api/tts?lang=uk&q=молоко  – proxy TTS
//   speed <= 1.0  → Google Translate (free, no install required)
//   speed >  1.0  → edge-tts directly  (supports up to +100%, i.e. speed=2.0)
//   if Google fails (non-200 or network error) → fallback to edge-tts
router.get('/tts', async (req, res) => {
  const { lang, q, slow, speed } = req.query;
  if (!lang || !q) return res.status(400).json({ error: 'lang and q required' });

  // Resolve numeric speed (default 1.0)
  let numSpeed = 1.0;
  if (speed !== undefined) {
    const s = parseFloat(speed);
    if (!isNaN(s)) numSpeed = Math.max(0.1, Math.min(3.0, s));
  } else if (slow === '1') {
    numSpeed = 0.1;
  }

  // ── Path A: speed > 1.0  →  edge-tts directly (Google ignores > 1.0) ──────
  if (numSpeed > 1.0) {
    try {
      await edgeTTS(q, lang, numSpeed, res);
    } catch (err) {
      console.error('[TTS] edge-tts error:', err.message);
      if (!res.headersSent) res.status(502).json({ error: 'edge-tts failed', detail: err.message });
    }
    return;
  }

  // ── Path B: speed <= 1.0  →  try Google first, fallback to edge-tts ───────
  const https = require('https');
  const speedParam = numSpeed !== 1.0 ? `&ttsspeed=${numSpeed.toFixed(2)}` : '';
  const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}&client=tw-ob${speedParam}`;

  const request = https.get(googleUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; OpenFlashcards/1.0)',
      'Referer': 'https://translate.google.com/'
    }
  }, async (upstream) => {
    if (upstream.statusCode === 200) {
      res.setHeader('Content-Type', upstream.headers['content-type'] || 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      upstream.pipe(res);
    } else {
      // Google returned an error → fallback to edge-tts
      upstream.resume(); // drain the response body
      try {
        await edgeTTS(q, lang, numSpeed, res);
      } catch (err) {
        console.error('[TTS] edge-tts fallback error:', err.message);
        if (!res.headersSent) res.status(502).json({ error: 'TTS unavailable' });
      }
    }
  });

  request.on('error', async () => {
    // Google network error → fallback to edge-tts
    try {
      await edgeTTS(q, lang, numSpeed, res);
    } catch (err) {
      console.error('[TTS] edge-tts fallback error:', err.message);
      if (!res.headersSent) res.status(502).json({ error: 'TTS unavailable' });
    }
  });
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
  const { lang, type, literal, translation, definition, article, infinitive, conjugation, declensions, verbGroup, labels, verbConjugationTranslation } = req.body;
  if (!lang || !type || !literal || !translation)
    return res.status(400).json({ error: 'lang, type, literal, translation required.' });
  if (!TYPES.includes(type))
    return res.status(400).json({ error: `type must be one of: ${TYPES.join(', ')}` });

  const words = getWords(userId(req), lang);
  if (words.find(w => w.id === literal))
    return res.status(409).json({ error: 'Word already exists.' });

  const word = {
    id: randomUUID(),
    type,
    literal: literal.trim(),
    translation: translation.trim(),
    definition: definition ? definition.trim() : '',
    langCode: lang,
    progress: 0,
    maxProgress: wordMaxProgress(literal, infinitive),
    createdAt: new Date().toISOString()
  };
  if (type === 'noun') word.article = article ? article.trim() : '';
  if (type === 'verb') {
    word.infinitive = infinitive ? infinitive.trim() : '';
    word.conjugation = conjugation || {};
    if (verbGroup !== undefined) word.verbGroup = verbGroup;
  }
  if (declensions !== undefined) word.declensions = declensions;
  if (labels !== undefined) word.labels = labels;
  if (verbConjugationTranslation !== undefined) word.verbConjugationTranslation = verbConjugationTranslation;

  words.push(word);
  saveWords(userId(req), lang, words);
  res.status(201).json({ ok: true, word });
});

// PUT /api/words/:id
router.put('/words/:id', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  const words = getWords(userId(req), lang);
  const idx = words.findIndex(w => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Word not found.' });

  const w = words[idx];
  ['translation', 'definition', 'article', 'infinitive', 'conjugation', 'declensions', 'verbGroup', 'literal', 'labels', 'verbConjugationTranslation', 'progress', 'maxProgress'].forEach(k => {
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
  const { lang, text, translation, helpNote, labels } = req.body;
  if (!lang || !text || !translation)
    return res.status(400).json({ error: 'lang, text, translation required.' });

  const phrases = getPhrases(userId(req), lang);
  const phrase = {
    id: randomUUID(),
    langCode: lang,
    text: text.trim(),
    translation: translation.trim(),
    helpNote: helpNote ? helpNote.trim() : '',
    labels: labels || [],
    progress: 0,
    maxProgress: phraseMaxProgress(text),
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
  const idx = phrases.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Phrase not found.' });

  ['text', 'translation', 'helpNote', 'labels', 'progress', 'maxProgress'].forEach(k => {
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

// GET /api/quiz?lang=fr[&type=verb,noun][&direction=random][&labels=id1,id2]
router.get('/quiz', (req, res) => {
  const { lang, direction = 'random' } = req.query;
  const types = req.query.types ? req.query.types.split(',') : TYPES;
  const labels = req.query.labels ? req.query.labels.split(',') : [];
  if (!lang) return res.status(400).json({ error: 'lang required' });

  let pool = getWords(userId(req), lang).filter(w => types.includes(w.type));
  if (labels.length) pool = pool.filter(w => labels.some(lid => (w.labels || []).includes(lid)));
  if (pool.length < 2) return res.status(400).json({ error: 'Add at least 2 words to start!' });

  // Sort by progress ratio asc (least learned first → prioritised)
  // Mastered words (progress >= maxProgress) are excluded unless pool is too small
  const getMax = w => w.maxProgress || wordMaxProgress(w.literal, w.infinitive);
  const unmastered = pool.filter(w => (w.progress || 0) < getMax(w));
  const activePool = unmastered.length >= 2 ? unmastered : pool;
  activePool.sort((a, b) => {
    const ra = (a.progress || 0) / getMax(a);
    const rb = (b.progress || 0) / getMax(b);
    return ra - rb;
  });
  const topN = Math.max(2, Math.ceil(activePool.length * 0.6));
  const topPool = activePool.slice(0, topN);
  const question = topPool[Math.floor(Math.random() * topPool.length)];

  const showNative = direction === 'native' ? true
    : direction === 'target' ? false
      : Math.random() < 0.5;

  // For verbs with conjugation: randomly decide to quiz on a specific conjugated form
  let display = (question.article && question.article.trim())
    ? `${question.article} ${question.literal}`
    : (question.type === 'verb' && question.infinitive ? question.infinitive : question.literal);

  let promptText, answerText;
  let quizPronoun = null;  // set if quizzing on a specific conjugated form

  const conjEntries = question.type === 'verb'
    ? Object.entries(question.conjugation || {}).filter(([, e]) => normConj(e).form)
    : [];

  // 30% chance to quiz on a conjugated form (when verb has conjugations AND translations)
  const conjWithTranslation = conjEntries.filter(([, e]) => normConj(e).translation);
  const useConjForm = conjWithTranslation.length > 0 && Math.random() < 0.30;

  if (useConjForm) {
    const [pronoun, entry] = conjWithTranslation[Math.floor(Math.random() * conjWithTranslation.length)];
    const e = normConj(entry);
    quizPronoun = pronoun;
    // Show: native translation → target conjugated form, or vice versa
    if (showNative) {
      promptText = e.translation;
      answerText = `${pronoun} ${e.form}`;
    } else {
      promptText = `${pronoun} ${e.form}`;
      answerText = e.translation;
    }
  } else {
    promptText = showNative ? question.translation : display;
    answerText = showNative ? display : question.translation;
  }

  // Build 3 decoys
  const others = pool.filter(w => w.id !== question.id);
  shuffle(others);
  const decoys = others.slice(0, 3).map(w => {
    const wDisplay = (w.article ? w.article + ' ' : '') + (w.type === 'verb' && w.infinitive ? w.infinitive : w.literal);
    return showNative ? wDisplay : w.translation;
  });

  const choices = shuffle([answerText, ...decoys]);

  res.json({
    id: question.id,
    type: question.type,
    quizPronoun: quizPronoun,
    literal: question.literal,
    definition: question.definition || '',
    article: question.article || '',
    infinitive: question.infinitive || '',
    verbGroup: question.verbGroup || '',
    conjugation: question.conjugation || {},
    verbConjugationTranslation: question.verbConjugationTranslation || '',
    declensions: question.declensions || {},
    langCode: question.langCode,
    promptText,
    answerText,
    choices,
    showNative,
    helpNote: question.helpNote || ''
  });
});

// POST /api/quiz/answer
router.post('/quiz/answer', (req, res) => {
  const { lang, id, answer, expectedAnswer } = req.body;
  if (!lang || !id) return res.status(400).json({ error: 'lang and id required.' });

  const words = getWords(userId(req), lang);
  const idx = words.findIndex(w => w.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Word not found.' });

  const w = words[idx];
  const display = (w.article ? w.article + ' ' : '') + (w.type === 'verb' && w.infinitive ? w.infinitive : w.literal);
  const correct = answer && (
    w.translation.trim().toLowerCase() === answer.trim().toLowerCase() ||
    display.trim().toLowerCase() === answer.trim().toLowerCase()
  );

  if (correct) {
    w.progress = Math.min((w.maxProgress || wordMaxProgress(w.literal, w.infinitive)), (w.progress || 0) + 1);
  } else {
    w.progress = Math.max(0, (w.progress || 0) - 1);
  }
  // Keep maxProgress in sync (recalc if missing)
  if (!w.maxProgress) w.maxProgress = wordMaxProgress(w.literal, w.infinitive);
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

// GET /api/quiz/phrase?lang=fr[&labels=id1,id2]
router.get('/quiz/phrase', (req, res) => {
  const { lang } = req.query;
  const labels = req.query.labels ? req.query.labels.split(',') : [];
  if (!lang) return res.status(400).json({ error: 'lang required' });
  let phrases = getPhrases(userId(req), lang);
  if (labels.length) phrases = phrases.filter(p => labels.some(lid => (p.labels || []).includes(lid)));
  if (!phrases.length) return res.status(404).json({ error: 'No phrases yet.' });
  const phrase = phrases[Math.floor(Math.random() * phrases.length)];
  res.json(phrase);
});

// POST /api/quiz/phrase/answer
router.post('/quiz/phrase/answer', (req, res) => {
  const { lang, id, correct } = req.body;
  if (!lang || !id) return res.status(400).json({ error: 'lang and id required.' });
  const phrases = getPhrases(userId(req), lang);
  const idx = phrases.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Phrase not found.' });

  const ph = phrases[idx];
  if (correct) {
    ph.progress = Math.min((ph.maxProgress || phraseMaxProgress(ph.text)), (ph.progress || 0) + 1);
  } else {
    ph.progress = Math.max(0, (ph.progress || 0) - 1);
  }
  if (!ph.maxProgress) ph.maxProgress = phraseMaxProgress(ph.text);
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

  const words = getWords(userId(req), lang);
  const phrases = getPhrases(userId(req), lang);

  const byType = {};
  TYPES.forEach(t => { byType[t] = words.filter(w => w.type === t).length; });

  res.json({
    totalWords: words.length,
    totalPhrases: phrases.length,
    byType,
    mastered: words.filter(w => {
      const mx = w.maxProgress || wordMaxProgress(w.literal, w.infinitive);
      return (w.progress || 0) >= mx;
    }).length,
    learning: words.filter(w => {
      const mx = w.maxProgress || wordMaxProgress(w.literal, w.infinitive);
      return (w.progress || 0) < mx;
    }).length
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


// ─────────────────────────────────────────────────────────────────────────────
// LABELS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/labels?lang=fr  – list all user labels for a language
router.get('/labels', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  const cfg = getUserConfig(userId(req));
  const langData = (cfg.targetLangs || []).find(l => l.isoCode === lang) || {};
  res.json(langData.labels || []);
});

// POST /api/labels  – create a label
router.post('/labels', (req, res) => {
  const { lang, name, color } = req.body;
  if (!lang || !name) return res.status(400).json({ error: 'lang and name required' });
  const cfg = getUserConfig(userId(req));
  const langData = (cfg.targetLangs || []).find(l => l.isoCode === lang);
  if (!langData) return res.status(404).json({ error: 'Language not found.' });
  if (!langData.labels) langData.labels = [];
  if (langData.labels.find(lb => lb.name.toLowerCase() === name.toLowerCase()))
    return res.status(409).json({ error: 'Label already exists.' });
  const label = { id: randomUUID(), name: name.trim(), color: color || '#6c757d' };
  langData.labels.push(label);
  saveUserConfig(userId(req), cfg);
  res.status(201).json({ ok: true, label });
});

// PUT /api/labels/:id  – rename / recolor a label
router.put('/labels/:id', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  const cfg = getUserConfig(userId(req));
  const langData = (cfg.targetLangs || []).find(l => l.isoCode === lang);
  if (!langData) return res.status(404).json({ error: 'Language not found.' });
  const label = (langData.labels || []).find(lb => lb.id === req.params.id);
  if (!label) return res.status(404).json({ error: 'Label not found.' });
  if (req.body.name !== undefined) label.name = req.body.name.trim();
  if (req.body.color !== undefined) label.color = req.body.color;
  saveUserConfig(userId(req), cfg);
  res.json({ ok: true, label });
});

// DELETE /api/labels/:id  – delete a label and remove it from all words
router.delete('/labels/:id', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  const cfg = getUserConfig(userId(req));
  const langData = (cfg.targetLangs || []).find(l => l.isoCode === lang);
  if (!langData) return res.status(404).json({ error: 'Language not found.' });
  const before = (langData.labels || []).length;
  langData.labels = (langData.labels || []).filter(lb => lb.id !== req.params.id);
  if (langData.labels.length === before) return res.status(404).json({ error: 'Label not found.' });
  saveUserConfig(userId(req), cfg);

  // Remove label from all words
  const words = getWords(userId(req), lang);
  words.forEach(w => {
    if (w.labels) w.labels = w.labels.filter(lid => lid !== req.params.id);
  });
  saveWords(userId(req), lang, words);

  res.json({ ok: true });
});

module.exports = router;
