'use strict';
// ── Offline bundle & TTS export ───────────────────────────────────────────────
// GET /api/offline/bundle              → full JSON snapshot of user data
// GET /api/offline/tts-manifest?lang=  → list of available cached TTS files
// GET /api/offline/tts/:lang/:speedKey/:itemId → serve a single cached MP3

const router  = require('express').Router();
const fs      = require('fs');
const path    = require('path');
const { getWords, getPhrases, getNotebook, getUserConfig } = require('../utils/storage');
const { cacheStats } = require('../utils/tts-cache');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');

function userId(req) { return req.user.id; }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/offline/bundle
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bundle', async (req, res) => {
  try {
    const uid        = userId(req);
    const config     = getUserConfig(uid);
    const targetLangs = config.targetLangs || [];

    const languages = {};
    for (const lang of targetLangs) {
      const code = lang.isoCode;
      languages[code] = {
        words:   getWords(uid, code),
        phrases: getPhrases(uid, code),
        notebook: getNotebook(uid, code)
      };
    }

    // Bundle locale files
    const localesDir = path.join(__dirname, '..', '..', 'public', 'locales');
    const locales = {};
    if (fs.existsSync(localesDir)) {
      for (const f of fs.readdirSync(localesDir)) {
        if (!f.endsWith('.json')) continue;
        try { locales[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(localesDir, f), 'utf8')); }
        catch { /* skip */ }
      }
    }

    // TTS cache stats per language
    const ttsStats = {};
    for (const lang of targetLangs) {
      ttsStats[lang.isoCode] = cacheStats(uid, lang.isoCode);
    }

    res.json({ config, languages, locales, ttsStats, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[offline/bundle]', err);
    res.status(500).json({ error: 'Bundle generation failed', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/offline/tts-manifest?lang=fr   (no lang = all languages)
// Returns { files: [ { lang, speedKey, itemId, size } ], total }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tts-manifest', (req, res) => {
  const uid        = userId(req);
  const filterLang = req.query.lang || null;
  const config     = getUserConfig(uid);
  const targetLangs = (config.targetLangs || []).map(l => l.isoCode);
  const langs      = filterLang ? [filterLang] : targetLangs;

  const files = [];
  for (const lc of langs) {
    const ttsBase = path.join(DATA_DIR, uid, 'tts', lc);
    if (!fs.existsSync(ttsBase)) continue;
    for (const speedDir of fs.readdirSync(ttsBase, { withFileTypes: true })) {
      if (!speedDir.isDirectory()) continue;
      const speedPath = path.join(ttsBase, speedDir.name);
      for (const f of fs.readdirSync(speedPath)) {
        if (!f.endsWith('.mp3')) continue;
        let size = 0;
        try { size = fs.statSync(path.join(speedPath, f)).size; } catch {}
        files.push({ lang: lc, speedKey: speedDir.name, itemId: f.replace('.mp3', ''), size });
      }
    }
  }

  res.json({ files, total: files.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/offline/tts/:lang/:speedKey/:itemId
// Serve a single cached MP3 for client-side IDB storage
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tts/:lang/:speedKey/:itemId', (req, res) => {
  const uid      = userId(req);
  const { lang, speedKey, itemId } = req.params;

  // Sanitize – only allow safe path components
  if (!/^[a-zA-Z0-9_\-]+$/.test(lang) || !/^spd\d+$/.test(speedKey) || !/^[a-zA-Z0-9_\-]+$/.test(itemId)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  const filePath = path.join(DATA_DIR, uid, 'tts', lang, speedKey, itemId + '.mp3');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  fs.createReadStream(filePath).pipe(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/offline/tts-status?lang=fr   (kept for backward compat)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tts-status', (req, res) => {
  const uid  = userId(req);
  const lang = req.query.lang;
  if (!lang) return res.status(400).json({ error: 'lang required' });

  const stats   = cacheStats(uid, lang);
  const ttsBase = path.join(DATA_DIR, uid, 'tts', lang);
  const files   = {};

  if (fs.existsSync(ttsBase)) {
    for (const speedDir of fs.readdirSync(ttsBase, { withFileTypes: true })) {
      if (!speedDir.isDirectory()) continue;
      files[speedDir.name] = [];
      const speedPath = path.join(ttsBase, speedDir.name);
      for (const f of fs.readdirSync(speedPath)) {
        if (f.endsWith('.mp3')) files[speedDir.name].push(f.replace('.mp3', ''));
      }
    }
  }

  res.json({ lang, stats, files });
});

module.exports = router;
