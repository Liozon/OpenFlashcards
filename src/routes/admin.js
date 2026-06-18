'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { getUsers, saveUsers, getUserConfig, saveUserConfig, getWords, getPhrases } = require('../utils/storage');
const { requireAdmin } = require('../middleware/auth');
const { purgeCache, cacheStats, getCached, saveCachedBuffer } = require('../utils/tts-cache');
const { bufferTTS, wordDisplay } = require('../utils/tts-generate');

router.use(requireAdmin);

// GET /admin/users
router.get('/users', (req, res) => {
  const users = getUsers();
  const safe = Object.values(users).map(u => ({
    id: u.id, username: u.username, role: u.role, createdAt: u.createdAt,
    ttsCacheDefault: u.ttsCacheDefault === true
  }));
  res.json(safe);
});

// POST /admin/users  – create user
router.post('/users', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || username.trim().length < 2)
    return res.status(400).json({ error: 'Username (min 2 chars) and password required.' });
  if (password.length < 4)
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });

  const users = getUsers();
  if (Object.values(users).find(u => u.username === username.trim()))
    return res.status(409).json({ error: 'Username already taken.' });

  const id = randomUUID();
  users[id] = {
    id,
    username: username.trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: role === 'admin' ? 'admin' : 'user',
    ttsCacheDefault: false,
    createdAt: new Date().toISOString()
  };
  saveUsers(users);
  res.status(201).json({ ok: true, id });
});

// PUT /admin/users/:id – reset password or change role
router.put('/users/:id', (req, res) => {
  const users = getUsers();
  const user = users[req.params.id];
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (req.body.password) {
    if (req.body.password.length < 4)
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    user.passwordHash = bcrypt.hashSync(req.body.password, 10);
  }
  if (req.body.role && ['admin', 'user'].includes(req.body.role)) {
    user.role = req.body.role;
  }
  saveUsers(users);
  res.json({ ok: true });
});

// DELETE /admin/users/:id
router.delete('/users/:id', (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: 'Cannot delete yourself.' });
  const users = getUsers();
  if (!users[req.params.id]) return res.status(404).json({ error: 'User not found.' });
  delete users[req.params.id];
  saveUsers(users);
  res.json({ ok: true });
});

// ── TTS Cache Admin Routes ────────────────────────────────────────────────────

// PUT /admin/users/:id/tts-cache-default  – toggle ttsCacheDefault flag
router.put('/users/:id/tts-cache-default', (req, res) => {
  const users = getUsers();
  const user = users[req.params.id];
  if (!user) return res.status(404).json({ error: 'User not found.' });
  user.ttsCacheDefault = req.body.enabled === true;
  saveUsers(users);
  res.json({ ok: true, ttsCacheDefault: user.ttsCacheDefault });
});

// GET /admin/users/:id/tts-cache/stats  – disk usage stats per lang
router.get('/users/:id/tts-cache/stats', (req, res) => {
  const users = getUsers();
  if (!users[req.params.id]) return res.status(404).json({ error: 'User not found.' });
  const cfg = getUserConfig(req.params.id);
  const langs = cfg.targetLangs || [];
  const result = {};
  let totalFiles = 0, totalBytes = 0;
  for (const lang of langs) {
    const s = cacheStats(req.params.id, lang.isoCode);
    result[lang.isoCode] = { ...s, name: lang.name, flag: lang.flag };
    totalFiles += s.files;
    totalBytes += s.sizeBytes;
  }
  res.json({ langs: result, totalFiles, totalBytes });
});

// GET /admin/users/:id/tts-cache/count  – count items to generate
router.get('/users/:id/tts-cache/count', (req, res) => {
  const users = getUsers();
  if (!users[req.params.id]) return res.status(404).json({ error: 'User not found.' });
  const cfg = getUserConfig(req.params.id);
  const langs = cfg.targetLangs || [];
  let total = 0;
  for (const lang of langs) {
    const words   = getWords(req.params.id, lang.isoCode);
    const phrases = getPhrases(req.params.id, lang.isoCode);
    total += (words.length + phrases.length) * 2;
  }
  res.json({ total });
});

// DELETE /admin/users/:id/tts-cache  – purge entire TTS cache for a user
router.delete('/users/:id/tts-cache', (req, res) => {
  const users = getUsers();
  if (!users[req.params.id]) return res.status(404).json({ error: 'User not found.' });
  const cfg = getUserConfig(req.params.id);
  const langs = cfg.targetLangs || [];
  let total = 0;
  for (const lang of langs) {
    total += purgeCache(req.params.id, lang.isoCode);
  }
  res.json({ ok: true, deleted: total });
});

// POST /admin/users/:id/tts-cache/generate  – SSE: generate full TTS cache for a user
router.post('/users/:id/tts-cache/generate', async (req, res) => {
  const users = getUsers();
  if (!users[req.params.id]) return res.status(404).json({ error: 'User not found.' });

  const uid = req.params.id;
  const cfg = getUserConfig(uid);
  const langs = cfg.targetLangs || [];

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
    const tasks = [];
    for (const lang of langs) {
      const speedNormal = lang.ttsSpeedNormal != null ? lang.ttsSpeedNormal : 1.0;
      const speedSlow   = lang.ttsSpeedSlow   != null ? lang.ttsSpeedSlow   : 0.24;
      const words   = getWords(uid, lang.isoCode);
      const phrases = getPhrases(uid, lang.isoCode);
      for (const w of words) {
        const display = wordDisplay(w);
        tasks.push({ text: display, id: w.id, mode: 'normal', speed: speedNormal, lang: lang.isoCode });
        tasks.push({ text: display, id: w.id, mode: 'slow',   speed: speedSlow,   lang: lang.isoCode });
      }
      for (const p of phrases) {
        tasks.push({ text: p.text, id: p.id, mode: 'normal', speed: speedNormal, lang: lang.isoCode });
        tasks.push({ text: p.text, id: p.id, mode: 'slow',   speed: speedSlow,   lang: lang.isoCode });
      }
    }

    const total = tasks.length;
    let done = 0;

    for (const task of tasks) {
      if (cancelled) break;
      try {
        if (!getCached(uid, task.lang, task.speed, task.id)) {
          const buf = await bufferTTS(task.text, task.lang, task.speed);
          saveCachedBuffer(uid, task.lang, task.speed, task.id, buf);
        }
      } catch (err) {
        console.error('[Admin TTS generate]', task.lang, task.text, err.message);
      }
      done++;
      send({ type: 'progress', done, total, mode: task.mode, text: task.text, lang: task.lang });
    }

    send({ type: 'done', done, total });
  } catch (err) {
    send({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
});

module.exports = router;
