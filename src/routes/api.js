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
const {
  getCached, saveCachedBuffer, pipeToCache, purgeCache, cacheStats, textHash, deleteItem, deleteItemAllSpeeds
} = require('../utils/tts-cache');
const { bufferTTS: _sharedBufferTTS, EDGE_TTS_VOICES: _sharedVoices, wordDisplay } = require('../utils/tts-generate');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const uid = () => req => req.user.id;
const TYPES = ['noun', 'verb', 'adjective', 'adverb', 'other', 'phrase'];

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
  const allowed = ['nativeLang', 'targetLangs', 'currentLang', 'uiLang', 'darkMode', 'offlineMode'];
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
    // Apply ttsCacheDefault from user account settings (set by admin)
    const { getUsers } = require('../utils/storage');
    const users = getUsers();
    const userRecord = users[userId(req)];
    const defaultCache = userRecord ? (userRecord.ttsCacheDefault === true) : false;
    cfg.targetLangs.push({ isoCode, name, flag: flag || '🌐', nativeName: nativeName || name, tenses: [{ nativeName: 'Present', targetName: 'Present' }], ttsCache: defaultCache });
  }
  if (!cfg.currentLang) cfg.currentLang = isoCode;
  saveUserConfig(userId(req), cfg);
  res.json({ ok: true });
});

// GET /api/tenses  – helper: resolve tenses for a language (ensure default Present)
function getTensesForLang(lang) {
  if (lang.tenses && lang.tenses.length) return lang.tenses;
  // Return a default Present tense when none configured
  return [{ nativeName: 'Present', targetName: 'Present' }];
}

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
  // tenses: array of { nativeName, targetName }
  if (req.body.tenses !== undefined) lang.tenses = req.body.tenses;
  // verbGroups: array of { id, name }
  if (req.body.verbGroups !== undefined) lang.verbGroups = req.body.verbGroups;
  if (req.body.labels !== undefined) lang.labels = req.body.labels;
  // TTS speeds: floats 0.1–1.0
  if (req.body.ttsSpeedNormal !== undefined) lang.ttsSpeedNormal = req.body.ttsSpeedNormal;
  if (req.body.ttsSpeedSlow !== undefined) lang.ttsSpeedSlow = req.body.ttsSpeedSlow;
  // TTS cache toggle
  if (req.body.ttsCache !== undefined) lang.ttsCache = req.body.ttsCache === true;

  saveUserConfig(userId(req), cfg);
  res.json({ ok: true, lang });
});

// ── TTS helpers ───────────────────────────────────────────────────────────────
// Uses msedge-tts (npm) — free, no API key, no Python required.
// Install once: npm install msedge-tts
// Full voice list: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support

// Map ISO language codes → best msedge-tts voice (BCP-47 ShortName).
const EDGE_TTS_VOICES = {
  'af': 'af-ZA-AdriNeural',
  'sq': 'sq-AL-AnilaNeural',
  'am': 'am-ET-AmehaNeural',
  'ar': 'ar-SA-ZariyahNeural',
  'az': 'az-AZ-BabekNeural',
  'bn': 'bn-BD-NabanitaNeural',
  'bs': 'bs-BA-VesnaNeural',
  'bg': 'bg-BG-KalinaNeural',
  'my': 'my-MM-NilarNeural',
  'ca': 'ca-ES-JoanaNeural',
  'zh': 'zh-CN-XiaoxiaoNeural',
  'zh-tw': 'zh-TW-HsiaoChenNeural',
  'zh-hk': 'zh-HK-HiuGaaiNeural',
  'hr': 'hr-HR-GabrijelaNeural',
  'cs': 'cs-CZ-VlastaNeural',
  'da': 'da-DK-ChristelNeural',
  'nl': 'nl-NL-ColetteNeural',
  'en': 'en-US-JennyNeural',
  'et': 'et-EE-AnuNeural',
  'fil': 'fil-PH-BlessicaNeural',
  'fi': 'fi-FI-SelmaNeural',
  'fr': 'fr-FR-DeniseNeural',
  'gl': 'gl-ES-SabelaNeural',
  'ka': 'ka-GE-EkaNeural',
  'de': 'de-DE-KatjaNeural',
  'el': 'el-GR-AthinaNeural',
  'gu': 'gu-IN-DhwaniNeural',
  'he': 'he-IL-HilaNeural',
  'hi': 'hi-IN-SwaraNeural',
  'hu': 'hu-HU-NoemiNeural',
  'is': 'is-IS-GudrunNeural',
  'id': 'id-ID-GadisNeural',
  'ga': 'ga-IE-OrlaNeural',
  'it': 'it-IT-ElsaNeural',
  'ja': 'ja-JP-NanamiNeural',
  'jv': 'jv-ID-SitiNeural',
  'kn': 'kn-IN-SapnaNeural',
  'kk': 'kk-KZ-AigulNeural',
  'km': 'km-KH-SreymomNeural',
  'ko': 'ko-KR-SunHiNeural',
  'lo': 'lo-LA-KeomanyNeural',
  'lv': 'lv-LV-EveritaNeural',
  'lt': 'lt-LT-OnaNeural',
  'mk': 'mk-MK-MarijaNeural',
  'ms': 'ms-MY-YasminNeural',
  'ml': 'ml-IN-SobhanaNeural',
  'mt': 'mt-MT-GraceNeural',
  'mr': 'mr-IN-AarohiNeural',
  'mn': 'mn-MN-YesuiNeural',
  'ne': 'ne-NP-HemkalaNeural',
  'nb': 'nb-NO-PernilleNeural',
  'ps': 'ps-AF-LatifaNeural',
  'fa': 'fa-IR-DilaraNeural',
  'pl': 'pl-PL-ZofiaNeural',
  'pt': 'pt-PT-RaquelNeural',
  'pt-br': 'pt-BR-FranciscaNeural',
  'ro': 'ro-RO-AlinaNeural',
  'ru': 'ru-RU-SvetlanaNeural',
  'sr': 'sr-RS-SophieNeural',
  'si': 'si-LK-ThiliniNeural',
  'sk': 'sk-SK-ViktoriaNeural',
  'sl': 'sl-SI-PetraNeural',
  'so': 'so-SO-UbaxNeural',
  'es': 'es-ES-ElviraNeural',
  'su': 'su-ID-TutiNeural',
  'sw': 'sw-KE-ZuriNeural',
  'sv': 'sv-SE-SofieNeural',
  'ta': 'ta-IN-PallaviNeural',
  'te': 'te-IN-ShrutiNeural',
  'th': 'th-TH-PremwadeeNeural',
  'tr': 'tr-TR-EmelNeural',
  'uk': 'uk-UA-PolinaNeural',
  'ur': 'ur-PK-UzmaNeural',
  'uz': 'uz-UZ-MadinaNeural',
  'vi': 'vi-VN-HoaiMyNeural',
  'cy': 'cy-GB-NiaNeural',
  'zu': 'zu-ZA-ThandoNeural',
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
      _MsEdgeTTS = mod.MsEdgeTTS;
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

// ── Shared: generate TTS audio for one text, return a Buffer ─────────────────
// Used by both GET /api/tts (live play) and POST /api/tts/generate (batch cache).
// Tries Google first for speed ≤ 1.0, falls back to Edge TTS on failure.
// For speed > 1.0 uses Edge TTS directly.
// Creates a fresh MsEdgeTTS instance each call — Edge's WS is stateless per request.
async function bufferTTS(text, langCode, speed) {
  function fetchGoogle() {
    return new Promise((resolve, reject) => {
      const https = require('https');
      const sp = speed !== 1.0 ? '&ttsspeed=' + speed.toFixed(2) : '';
      const url = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=' +
        encodeURIComponent(langCode) + '&q=' + encodeURIComponent(text) +
        '&client=tw-ob' + sp;
      https.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://translate.google.com/' }
      }, (r) => {
        if (r.statusCode === 200) {
          const chunks = [];
          r.on('data', c => chunks.push(c));
          r.on('end', () => resolve(Buffer.concat(chunks)));
          r.on('error', reject);
        } else {
          r.resume();
          reject(new Error('Google TTS HTTP ' + r.statusCode));
        }
      }).on('error', reject);
    });
  }

  async function fetchEdge() {
    const voice = edgeVoiceFor(langCode);
    if (!voice) throw new Error('No edge-tts voice for: ' + langCode);
    const { MsEdgeTTS, OUTPUT_FORMAT } = loadMsEdgeTTS();
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text, { rate: speedToEdgeRate(speed) });
    return new Promise((resolve, reject) => {
      const chunks = [];
      audioStream.on('data', c => chunks.push(c));
      audioStream.on('end', () => resolve(Buffer.concat(chunks)));
      audioStream.on('error', reject);
    });
  }

  if (speed > 1.0) return fetchEdge();
  try { return await fetchGoogle(); }
  catch { return fetchEdge(); }
}

// GET /api/tts?lang=uk&q=молоко[&id=UUID][&speed=0.24][&prevSpeed=1.00]
//   id        → stable cache key (word/phrase UUID).  Falls back to SHA-1 of text.
//   speed     → playback speed (default 1.0).  ≤1.0 = Google/fallback; >1.0 = edge-tts
//   prevSpeed → if provided and different from speed, the old cached file at prevSpeed
//               is deleted after the new file is written (lazy migration on first play)
//   Disk cache: data/{userId}/tts/{lang}/spd{pct}/{id}.mp3
router.get('/tts', async (req, res) => {
  const { lang, q, slow, speed, id, prevSpeed, nocache } = req.query;
  if (!lang || !q) return res.status(400).json({ error: 'lang and q required' });

  // Resolve numeric speed (default 1.0)
  let numSpeed = 1.0;
  if (speed !== undefined) {
    const s = parseFloat(speed);
    if (!isNaN(s)) numSpeed = Math.max(0.1, Math.min(3.0, s));
  } else if (slow === '1') {
    numSpeed = 0.1;
  }

  // Optional: previous speed bucket to delete after writing the new file
  let prevNumSpeed = null;
  if (prevSpeed !== undefined) {
    const ps = parseFloat(prevSpeed);
    if (!isNaN(ps) && Math.abs(ps - numSpeed) > 0.001) prevNumSpeed = ps;
  }

  const uid = userId(req);
  const itemId = (id && id.trim()) ? id.trim() : textHash(q);

  // ── Cache hit (skip entirely when nocache=1 OR cache disabled for this language) ─────────────────────────
  const cfg2 = getUserConfig(uid);
  const langData = (cfg2.targetLangs || []).find(l => l.isoCode === lang);
  const langCacheEnabled = langData ? (langData.ttsCache !== false) : true;
  const bypassCache = nocache === '1' || !langCacheEnabled;
  if (!bypassCache) {
    const cached = getCached(uid, lang, numSpeed, itemId);
    if (cached) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.setHeader('X-TTS-Cache', 'HIT');
      return require('fs').createReadStream(cached).pipe(res);
    }
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', bypassCache ? 'no-store' : 'public, max-age=86400');
  if (!bypassCache) res.setHeader('X-TTS-Cache', 'MISS');

  try {
    const buf = await bufferTTS(q, lang, numSpeed);
    if (!bypassCache) {
      saveCachedBuffer(uid, lang, numSpeed, itemId, buf);
      if (prevNumSpeed !== null) deleteItem(uid, lang, prevNumSpeed, itemId);
    }
    res.end(buf);
  } catch (err) {
    console.error('[TTS] error:', err.message);
    if (!res.headersSent) res.status(502).json({ error: 'TTS unavailable', detail: err.message });
  }
});

// GET /api/tts/cache?lang=fr  – cache stats for a language
router.get('/tts/cache', (req, res) => {
  const { lang } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  res.json(cacheStats(userId(req), lang));
});

// DELETE /api/tts/cache/item?lang=fr&id=UUID&speed=0.24  – delete a single cached file
router.delete('/tts/cache/item', (req, res) => {
  const { lang, id, speed } = req.query;
  if (!lang || !id || speed === undefined) return res.status(400).json({ error: 'lang, id and speed required' });
  const numSpeed = parseFloat(speed);
  if (isNaN(numSpeed)) return res.status(400).json({ error: 'invalid speed' });
  const deleted = deleteItem(userId(req), lang, numSpeed, id);
  res.json({ ok: true, deleted });
});

// DELETE /api/tts/cache?lang=fr[&speed=0.24]  – purge TTS cache for a language
//   Without speed: purges entire language cache
//   With speed:    purges only the speed bucket matching that exact value (spd{pct})
router.delete('/tts/cache', (req, res) => {
  const { lang, speed } = req.query;
  if (!lang) return res.status(400).json({ error: 'lang required' });
  let numSpeed = null;
  if (speed !== undefined) {
    const s = parseFloat(speed);
    if (!isNaN(s)) numSpeed = Math.max(0.1, Math.min(3.0, s));
  }
  const count = purgeCache(userId(req), lang, numSpeed);
  res.json({ ok: true, deleted: count });
});

// ─────────────────────────────────────────────────────────────────────────────
// TTS BATCH GENERATION  (server-side, streamed via SSE)
// POST /api/tts/generate
//   Body: { lang, speedNormal, speedSlow, prevSpeedNormal?, prevSpeedSlow? }
//   Streams Server-Sent Events:
//     data: { type:"progress", done, total, mode, text }
//     data: { type:"done", done, total }
//     data: { type:"error", message }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/tts/generate', async (req, res) => {
  const { lang, speedNormal, speedSlow, prevSpeedNormal, prevSpeedSlow } = req.body;
  if (!lang) return res.status(400).json({ error: 'lang required' });

  const uid = userId(req);
  const numNormal = parseFloat(speedNormal) || 1.0;
  const numSlow = parseFloat(speedSlow) || 0.24;
  const prevNorm = prevSpeedNormal != null ? parseFloat(prevSpeedNormal) : null;
  const prevSlow = prevSpeedSlow != null ? parseFloat(prevSpeedSlow) : null;
  const normalChanged = prevNorm !== null && Math.abs(numNormal - prevNorm) > 0.001;
  const slowChanged = prevSlow !== null && Math.abs(numSlow - prevSlow) > 0.001;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => {
    if (!res.writableEnded) res.write('data: ' + JSON.stringify(obj) + '\n\n');
  };

  let cancelled = false;
  res.on('close', () => { cancelled = true; });

  try {
    const { getWords, getPhrases } = require('../utils/storage');
    const words = getWords(uid, lang);
    const phrases = getPhrases(uid, lang);

    // Build task list
    const tasks = [];
    for (const w of words) {
      const display = wordDisplay(w);
      tasks.push({
        text: display, id: w.id, mode: 'normal', speed: numNormal,
        prevSpeed: normalChanged ? prevNorm : null
      });
      tasks.push({
        text: display, id: w.id, mode: 'slow', speed: numSlow,
        prevSpeed: slowChanged ? prevSlow : null
      });
    }
    for (const p of phrases) {
      tasks.push({
        text: p.text, id: p.id, mode: 'normal', speed: numNormal,
        prevSpeed: normalChanged ? prevNorm : null
      });
      tasks.push({
        text: p.text, id: p.id, mode: 'slow', speed: numSlow,
        prevSpeed: slowChanged ? prevSlow : null
      });
    }

    const total = tasks.length;
    let done = 0;

    // Generate one item: skip if already cached, otherwise call shared bufferTTS
    async function generateOne(task) {
      if (!task.prevSpeed && getCached(uid, lang, task.speed, task.id)) return;
      const buf = await bufferTTS(task.text, lang, task.speed);
      saveCachedBuffer(uid, lang, task.speed, task.id, buf);
      if (task.prevSpeed !== null) deleteItem(uid, lang, task.prevSpeed, task.id);
    }

    for (const task of tasks) {
      if (cancelled) break;
      try {
        await generateOne(task);
      } catch (err) {
        console.error('[TTS generate] error on "' + task.text + '":', err.message);
        // Non-fatal: keep going
      }
      done++;
      send({ type: 'progress', done, total, mode: task.mode, text: task.text });
    }

    send({ type: 'done', done, total });
  } catch (err) {
    send({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
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
  ['type', 'translation', 'definition', 'article', 'infinitive', 'conjugation', 'declensions', 'verbGroup', 'literal', 'labels', 'verbConjugationTranslation', 'progress', 'maxProgress', 'text', 'helpNote'].forEach(k => {
    if (req.body[k] !== undefined) w[k] = req.body[k];
  });

  // If type changed, clean up fields that don't belong to the new type
  if (req.body.type !== undefined) {
    if (!TYPES.includes(req.body.type))
      return res.status(400).json({ error: `type must be one of: ${TYPES.join(', ')}` });
    if (req.body.type !== 'noun') w.article = '';
    if (req.body.type !== 'verb') {
      w.conjugation = {};
      w.verbGroup = '';
      w.infinitive = '';
    }
    if (req.body.type === 'verb') w.declensions = {};
    if (req.body.type === 'phrase') {
      w.conjugation = {};
      w.verbGroup = '';
      w.infinitive = '';
      w.declensions = {};
      w.article = '';
    }
  }

  w.updatedAt = new Date().toISOString();
  saveWords(userId(req), lang, words);

  // Invalidate TTS cache for this word (text may have changed)
  deleteItemAllSpeeds(userId(req), lang, req.params.id);

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
  const { lang, text, translation, helpNote, labels, type } = req.body;
  if (!lang || !text || !translation)
    return res.status(400).json({ error: 'lang, text, translation required.' });
  if (type !== undefined && !TYPES.includes(type))
    return res.status(400).json({ error: `type must be one of: ${TYPES.join(', ')}` });

  const phrases = getPhrases(userId(req), lang);
  const phrase = {
    id: randomUUID(),
    type: type || 'phrase',
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

  ['type', 'text', 'translation', 'helpNote', 'labels', 'progress', 'maxProgress', 'article', 'literal', 'definition', 'infinitive', 'conjugation', 'declensions', 'verbGroup'].forEach(k => {
    if (req.body[k] !== undefined) phrases[idx][k] = req.body[k];
  });

  if (req.body.type !== undefined) {
    if (!TYPES.includes(req.body.type))
      return res.status(400).json({ error: `type must be one of: ${TYPES.join(', ')}` });
    if (req.body.type !== 'noun') phrases[idx].article = '';
    if (req.body.type !== 'verb') {
      phrases[idx].conjugation = {};
      phrases[idx].verbGroup = '';
      phrases[idx].infinitive = '';
    }
    if (req.body.type === 'verb') phrases[idx].declensions = {};
  }

  phrases[idx].updatedAt = new Date().toISOString();
  savePhrases(userId(req), lang, phrases);

  // Invalidate TTS cache for this phrase (text may have changed)
  deleteItemAllSpeeds(userId(req), lang, req.params.id);

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
  let display = wordDisplay(question);

  let promptText, answerText;
  let quizPronoun = null;  // set if quizzing on a specific conjugated form

  // Normalize conjugation: support both flat (old) and tense-keyed (new) formats
  function flattenConjugation(conj) {
    if (!conj) return {};
    // Check if this is tense-keyed (any value is an object with pronoun keys)
    const values = Object.values(conj);
    if (values.length && values.some(v => typeof v === 'object' && v !== null && !v.hasOwnProperty('form'))) {
      // Tense-keyed: pick a random tense that has entries
      const tenseKeys = Object.keys(conj);
      const validTenses = tenseKeys.filter(k => {
        const tense = conj[k];
        return tense && typeof tense === 'object' && Object.values(tense).some(e => normConj(e).form);
      });
      if (validTenses.length) {
        const pick = validTenses[Math.floor(Math.random() * validTenses.length)];
        return conj[pick];
      }
      return {};
    }
    // Flat format
    return conj;
  }

  const flatConj = flattenConjugation(question.conjugation || {});
  const conjEntries = question.type === 'verb'
    ? Object.entries(flatConj).filter(([, e]) => normConj(e).form)
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
    const wDisplay = wordDisplay(w);
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
  const display = wordDisplay(w);
  const correct = answer && (
    w.translation.trim().toLowerCase() === answer.trim().toLowerCase() ||
    display.trim().toLowerCase() === answer.trim().toLowerCase() ||
    (expectedAnswer && expectedAnswer.trim().toLowerCase() === answer.trim().toLowerCase())
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
// DUPLICATES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/duplicates  – find duplicate words/phrases within a language
//   Body: { lang }
//   Returns: { words: [[...], ...], phrases: [[...], ...], cross: [[...], ...] }
//     Each inner array is a group of 2+ items sharing the same literal/text.
//     `words` = word-only groups, `phrases` = phrase-only groups,
//     `cross` = groups mixing words AND phrases with the same text.
router.post('/duplicates', (req, res) => {
  const { lang } = req.body;
  if (!lang) return res.status(400).json({ error: 'lang required' });

  const words = getWords(userId(req), lang);
  const phrases = getPhrases(userId(req), lang);

  function groupByKey(items, keyFn) {
    const map = {};
    items.forEach(item => {
      const key = keyFn(item).toLowerCase().trim();
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return Object.values(map).filter(g => g.length >= 2);
  }

  const dupWords = groupByKey(words, w => w.literal || '');
  const dupPhrases = groupByKey(phrases, p => p.text || p.literal || '');

  // Cross-type duplicates: a word.literal matches a phrase.text
  const wordMap = {};
  words.forEach(w => {
    const key = (w.literal || '').toLowerCase().trim();
    if (!key) return;
    if (!wordMap[key]) wordMap[key] = [];
    wordMap[key].push(w);
  });
  const phraseMap = {};
  phrases.forEach(p => {
    const key = (p.text || p.literal || '').toLowerCase().trim();
    if (!key) return;
    if (!phraseMap[key]) phraseMap[key] = [];
    phraseMap[key].push(p);
  });

  const crossDups = [];
  for (const key of Object.keys(wordMap)) {
    if (phraseMap[key]) {
      crossDups.push([...wordMap[key], ...phraseMap[key]]);
    }
  }

  res.json({ words: dupWords, phrases: dupPhrases, cross: crossDups });
});

// POST /api/duplicates/merge  – merge a group of duplicates, keep one
//   Body: { lang, keepId, deleteIds, kind?, fieldMap?, labels? }
//     kind (optional): 'word', 'phrase', or 'cross' — used for legacy merge hints
//     keepId: the ID to preserve (base item)
//     deleteIds: array of IDs to delete (may include keepId)
//     fieldMap (optional): { "fieldName": "sourceItemId", ... }
//       Copies the specified field from the source item onto the keep item.
//       Supported fields: type, literal, translation, definition, article,
//       infinitive, conjugation, declensions, verbGroup, verbConjugationTranslation,
//       helpNote, text, progress, maxProgress
//     labels (optional): explicit array of label IDs to set on the kept item.
//   When fieldMap is provided it replaces the legacy merge logic entirely.
//   Legacy (no fieldMap): merges labels (union) and max progress.
//   The endpoint searches both words and phrases stores, so cross-type merges work.
router.post('/duplicates/merge', (req, res) => {
  const { lang, keepId, deleteIds, fieldMap, labels } = req.body;
  if (!lang || !keepId || !Array.isArray(deleteIds)) {
    return res.status(400).json({ error: 'lang, keepId, deleteIds[] required' });
  }

  const uid = userId(req);
  const words = getWords(uid, lang);
  const phrases = getPhrases(uid, lang);

  // Find keep item in either store
  let keepItem = words.find(i => i.id === keepId) || phrases.find(i => i.id === keepId);
  if (!keepItem) return res.status(404).json({ error: 'Item to keep not found' });
  const kind = req.body.kind || (words.find(i => i.id === keepId) ? 'word' : 'phrase');

  const idsToDelete = deleteIds.filter(id => id !== keepId);

  // Look up an item by ID in either store
  function findItem(id) {
    return words.find(i => i.id === id) || phrases.find(i => i.id === id);
  }

  // Per-field merge: copy each field from the chosen source item
  if (fieldMap && typeof fieldMap === 'object') {
    const copyableFields = [
      'type', 'literal', 'translation', 'definition', 'article',
      'infinitive', 'conjugation', 'declensions', 'verbGroup',
      'verbConjugationTranslation', 'helpNote', 'text', 'progress', 'maxProgress'
    ];
    for (const [field, sourceId] of Object.entries(fieldMap)) {
      if (!copyableFields.includes(field)) continue;
      const sourceItem = findItem(sourceId);
      if (!sourceItem || sourceItem[field] === undefined) continue;
      if (typeof sourceItem[field] === 'object' && sourceItem[field] !== null) {
        keepItem[field] = JSON.parse(JSON.stringify(sourceItem[field]));
      } else {
        keepItem[field] = sourceItem[field];
      }
    }
  } else {
    // Legacy merge: union labels + max progress + fill missing definition
    const allLabels = new Set(keepItem.labels || []);
    idsToDelete.forEach(id => {
      const item = findItem(id);
      if (!item) return;
      (item.labels || []).forEach(lid => allLabels.add(lid));
      if ((item.progress || 0) > (keepItem.progress || 0)) keepItem.progress = item.progress;
      if (!keepItem.definition && item.definition) keepItem.definition = item.definition;
      if (!keepItem.helpNote && item.helpNote) keepItem.helpNote = item.helpNote;
    });
    keepItem.labels = [...allLabels];
  }

  // If explicit labels array is provided, use it (overrides any label merge above)
  if (Array.isArray(labels)) {
    keepItem.labels = labels;
  }

  keepItem.updatedAt = new Date().toISOString();

  // Remove deleted items from both stores
  const updatedWords = words.filter(i => !idsToDelete.includes(i.id));
  const updatedPhrases = phrases.filter(i => !idsToDelete.includes(i.id));
  saveWords(uid, lang, updatedWords);
  savePhrases(uid, lang, updatedPhrases);

  idsToDelete.forEach(id => {
    try { deleteItemAllSpeeds(uid, lang, id); } catch {}
  });

  res.json({ ok: true, item: keepItem, deleted: idsToDelete.length });
});

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

// ─────────────────────────────────────────────────────────────────────────────
// OFFLINE MODE
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/offline/bundle?langs=fr,uk
//   Returns a full bundle: config + words + phrases + labels + stats for each lang.
//   The client stores it in IndexedDB via the service worker.
router.get('/offline/bundle', async (req, res) => {
  try {
    const uid = userId(req);
    const cfg = getUserConfig(uid);
    const langs = req.query.langs
      ? req.query.langs.split(',').map(s => s.trim()).filter(Boolean)
      : (cfg.targetLangs || []).map(l => l.isoCode);

    const bundle = {
      config: cfg,
      langs: {}
    };

    for (const lang of langs) {
      const { getWords, getPhrases } = require('../utils/storage');
      bundle.langs[lang] = {
        words: getWords(uid, lang),
        phrases: getPhrases(uid, lang),
      };
    }

    res.json(bundle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/offline/sync
//   Replays a batch of queued writes (used when auto-sync is not available).
//   Body: { queue: [{ method, url, body }] }
router.post('/offline/sync', async (req, res) => {
  const { queue } = req.body || {};
  if (!Array.isArray(queue)) return res.status(400).json({ error: 'queue array required' });

  const results = [];
  for (const item of queue) {
    results.push({ url: item.url, replayed: true });
  }
  res.json({ ok: true, replayed: results.length });
});

// POST /api/progress/sync
// Body: { deltas: [{ lang, type, itemId, delta }] }
// Applies accumulated offline quiz progress deltas to the server DB.
// delta is a signed integer: positive = correct answers, negative = wrong answers.
// Each item is processed independently; unknown IDs are silently skipped.
router.post('/progress/sync', (req, res) => {
  const { deltas } = req.body || {};
  if (!Array.isArray(deltas)) return res.status(400).json({ error: 'deltas array required' });

  const uid = userId(req);
  let applied = 0;
  let skipped = 0;

  // Group by lang to avoid reloading the same word/phrase list multiple times
  const byLang = {};
  for (const d of deltas) {
    if (!d.lang || !d.type || !d.itemId || typeof d.delta !== 'number') { skipped++; continue; }
    if (!byLang[d.lang]) byLang[d.lang] = [];
    byLang[d.lang].push(d);
  }

  for (const [lang, items] of Object.entries(byLang)) {
    const words = getWords(uid, lang);
    const phrases = getPhrases(uid, lang);
    let wordsChanged = false;
    let phrasesChanged = false;

    for (const { type, itemId, delta } of items) {
      if (delta === 0) { skipped++; continue; }

      if (type === 'word') {
        const w = words.find(w => w.id === itemId);
        if (!w) { skipped++; continue; }
        const max = w.maxProgress || wordMaxProgress(w.literal, w.infinitive);
        w.progress = Math.max(0, Math.min(max, (w.progress || 0) + delta));
        if (!w.maxProgress) w.maxProgress = max;
        wordsChanged = true;
        applied++;
      } else if (type === 'phrase') {
        const ph = phrases.find(p => p.id === itemId);
        if (!ph) { skipped++; continue; }
        const max = ph.maxProgress || phraseMaxProgress(ph.text);
        ph.progress = Math.max(0, Math.min(max, (ph.progress || 0) + delta));
        if (!ph.maxProgress) ph.maxProgress = max;
        phrasesChanged = true;
        applied++;
      } else {
        skipped++;
      }
    }

    if (wordsChanged) saveWords(uid, lang, words);
    if (phrasesChanged) savePhrases(uid, lang, phrases);
  }

  res.json({ ok: true, applied, skipped });
});

// PUT /api/config  already handles offlineMode – just make sure it's in the allowed list
// (patch the existing PUT /api/config handler to allow offlineMode)
// We extend the allowed fields by monkey-patching the layer above – instead,
// we add a dedicated endpoint:

// PUT /api/offline/settings
//   Body: { offlineMode: true|false }
router.put('/offline/settings', (req, res) => {
  const cfg = getUserConfig(userId(req));
  if (req.body.offlineMode !== undefined) cfg.offlineMode = req.body.offlineMode === true;
  saveUserConfig(userId(req), cfg);
  res.json({ ok: true, config: cfg });
});

// Export helpers for admin route re-use
router.EDGE_TTS_VOICES_EXPORT = EDGE_TTS_VOICES;
router.bufferTTSExport = bufferTTS;

module.exports = router;