/* offline-db.js – IndexedDB layer for OpenFlashcards offline mode
   Stores:
     - 'bundle'         : { id:'latest', data: <full bundle JSON>, syncedAt }
     - 'tts'            : { id: '<lang>/<speedKey>/<itemId>', audio: ArrayBuffer }
     - 'progress_queue' : { id: '<lang>/<type>/<itemId>', lang, type, itemId, delta }
       type = 'word' | 'phrase'
       delta = net signed integer (correct answers - wrong answers accumulated offline)
*/
'use strict';

(function () {
  const DB_NAME = 'openflashcards-offline';
  const DB_VERSION = 2;   // bumped: adds progress_queue store
  let _db = null;

  // ── IndexedDB helpers ────────────────────────────────────────────────────────
  function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('bundle')) db.createObjectStore('bundle', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('tts')) db.createObjectStore('tts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('progress_queue')) db.createObjectStore('progress_queue', { keyPath: 'id' });
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror = e => reject(e.target.error);
    });
  }
  function idbGet(store, key) {
    return openDB().then(db => new Promise((res, rej) => {
      const r = db.transaction(store, 'readonly').objectStore(store).get(key);
      r.onsuccess = e => res(e.target.result || null);
      r.onerror = e => rej(e.target.error);
    }));
  }
  function idbPut(store, value) {
    return openDB().then(db => new Promise((res, rej) => {
      const r = db.transaction(store, 'readwrite').objectStore(store).put(value);
      r.onsuccess = e => res(e.target.result);
      r.onerror = e => rej(e.target.error);
    }));
  }
  function idbClearStore(store) {
    return openDB().then(db => new Promise((res, rej) => {
      const r = db.transaction(store, 'readwrite').objectStore(store).clear();
      r.onsuccess = () => res(true);
      r.onerror = e => rej(e.target.error);
    }));
  }
  function idbCountStore(store) {
    return openDB().then(db => new Promise((res, rej) => {
      const r = db.transaction(store, 'readonly').objectStore(store).count();
      r.onsuccess = e => res(e.target.result);
      r.onerror = e => rej(e.target.error);
    }));
  }

  // ── TTS key helper ───────────────────────────────────────────────────────────
  function ttsKey(lang, speed, itemId) {
    return `${lang}/spd${Math.round(parseFloat(speed) * 100)}/${itemId}`;
  }

  // ── Progress queue helpers ───────────────────────────────────────────────────
  function progressKey(lang, type, itemId) {
    return `${lang}/${type}/${itemId}`;
  }

  function idbGetAll(store) {
    return openDB().then(db => new Promise((res, rej) => {
      const r = db.transaction(store, 'readonly').objectStore(store).getAll();
      r.onsuccess = e => res(e.target.result || []);
      r.onerror = e => rej(e.target.error);
    }));
  }

  // ── OfflineDB public API ─────────────────────────────────────────────────────
  window.OfflineDB = {
    saveBundle: async b => idbPut('bundle', { id: 'latest', data: b, syncedAt: new Date().toISOString() }),
    getBundle: async () => { const r = await idbGet('bundle', 'latest'); return r ? r.data : null; },
    getBundleMeta: async () => { const r = await idbGet('bundle', 'latest'); return r ? { syncedAt: r.syncedAt, langs: Object.keys(r.data.languages || {}) } : null; },
    saveTTS: async (lang, speed, itemId, buf) => idbPut('tts', { id: ttsKey(lang, speed, itemId), audio: buf, lang, speed, itemId, savedAt: Date.now() }),
    getTTS: async (lang, speed, itemId) => { const r = await idbGet('tts', ttsKey(lang, speed, itemId)); return r ? r.audio : null; },
    deleteTTS: async (lang, itemId) => {
      const baseKey = `${lang}/spd`;
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('tts', 'readwrite');
        const store = tx.objectStore('tts');
        const req = store.openCursor();
        let count = 0;
        req.onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) {
            if (cursor.key.startsWith(baseKey) && cursor.key.endsWith(`/${itemId}`)) {
              cursor.delete();
              count++;
            }
            cursor.continue();
          } else {
            resolve(count);
          }
        };
        req.onerror = e => reject(e.target.error);
      });
    },
    countTTS: async () => idbCountStore('tts'),
    clearAll: async () => { await idbClearStore('bundle'); await idbClearStore('tts'); await idbClearStore('progress_queue'); },
    clearTTS: async () => idbClearStore('tts'),

    // ── Progress queue (accumulated offline quiz answers) ──────────────────
    // Stores signed deltas: correct=+1, wrong=-1, accumulated per item.
    addProgressDelta: async (lang, type, itemId, delta) => {
      const key = progressKey(lang, type, itemId);
      const existing = await idbGet('progress_queue', key);
      return idbPut('progress_queue', {
        id: key, lang, type, itemId,
        delta: ((existing && existing.delta) || 0) + delta
      });
    },
    getProgressQueue: async () => idbGetAll('progress_queue'),
    clearProgressQueue: async () => idbClearStore('progress_queue'),
  };

  // ── Session persistence (survives page refresh offline) ──────────────────────
  // We save { user, config } to localStorage after every successful online boot.
  // On page load offline, we restore from there so checkAuth() doesn't force login.

  const SESSION_KEY = 'ofc_offline_session';

  window.OfflineSession = {
    save(user, config) {
      try { localStorage.setItem(SESSION_KEY, JSON.stringify({ user, config })); } catch { }
    },
    load() {
      try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
    },
    clear() {
      try { localStorage.removeItem(SESSION_KEY); } catch { }
    }
  };

  // ── Network detection ────────────────────────────────────────────────────────
  window.OfflineMode = {
    _online: navigator.onLine,
    _listeners: [],
    get isOnline() { return this._online; },
    get isOffline() { return !this._online; },
    init() {
      window.addEventListener('online', () => { this._online = true; this._emit(); this._syncBadge(); updateOfflineSyncBtn && updateOfflineSyncBtn(); });
      window.addEventListener('offline', () => { this._online = false; this._emit(); this._syncBadge(); updateOfflineSyncBtn && updateOfflineSyncBtn(); });
    },
    onChange(fn) { this._listeners.push(fn); },
    _emit() { this._listeners.forEach(fn => fn(this._online)); },
    _syncBadge() {
      const btn = document.getElementById('syncOfflineBtn');
      if (!btn) return;
      const enabled = window.App && window.App.config && window.App.config.offlineMode;
      btn.style.display = enabled ? '' : 'none';
      btn.classList.toggle('sync-btn-offline', !this._online);
      btn.title = window.t ? window.t(this._online ? 'offline_sync_now' : 'offline_no_connection') : 'Sync';
    }
  };

  // ── Quiz helpers (mirrors server logic) ─────────────────────────────────────
  function _wordMax(w) {
    const MIN = 50, MAX = 200, K = 5;
    const str = (w.infinitive && w.infinitive.trim()) ? w.infinitive.trim() : (w.literal || '');
    return Math.max(MIN, Math.min(MAX, Math.round(MIN + Math.sqrt(str.length) * K)));
  }
  function _phraseMax(p) {
    const MIN = 50, MAX = 200, WK = 10, LK = 8;
    const words = (p.text || '').trim().split(/\s+/).filter(Boolean);
    const wc = words.length;
    const avg = wc ? words.reduce((s, w) => s + w.length, 0) / wc : 0;
    return Math.max(MIN, Math.min(MAX, Math.round(MIN + wc * WK + avg * LK)));
  }
  function _normConj(e) {
    if (!e) return { form: '', translation: '' };
    return typeof e === 'string' ? { form: e, translation: '' } : { form: e.form || '', translation: e.translation || '' };
  }
  function _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function _buildQuizWord(words, lang, direction, types, labels) {
    const TYPES = ['noun', 'verb', 'adjective', 'adverb', 'other'];
    let pool = words.filter(w => (types && types.length ? types.includes(w.type) : TYPES.includes(w.type)));
    if (labels && labels.length) pool = pool.filter(w => labels.some(lid => (w.labels || []).includes(lid)));
    if (pool.length < 2) return null;

    const getMax = w => w.maxProgress || _wordMax(w);
    const unmastered = pool.filter(w => (w.progress || 0) < getMax(w));
    const active = unmastered.length >= 2 ? unmastered : pool;
    active.sort((a, b) => (a.progress || 0) / getMax(a) - (b.progress || 0) / getMax(b));
    const topN = Math.max(2, Math.ceil(active.length * 0.6));
    const question = active.slice(0, topN)[Math.floor(Math.random() * topN)];

    const showNative = direction === 'native' ? true : direction === 'target' ? false : Math.random() < 0.5;
    const display = (question.article ? question.article + ' ' : '') +
      (question.type === 'verb' && question.infinitive ? question.infinitive : question.literal);

    // Flatten conjugation: support both tense-keyed and flat formats
    function _flatConj(conj) {
      if (!conj) return {};
      const vals = Object.values(conj);
      if (vals.length && vals.some(v => v && typeof v === 'object' && !v.hasOwnProperty('form'))) {
        const tenseKeys = Object.keys(conj);
        const validTenses = tenseKeys.filter(k => {
          const tense = conj[k];
          return tense && typeof tense === 'object' && Object.values(tense).some(e => _normConj(e).form);
        });
        if (validTenses.length) {
          const pick = validTenses[Math.floor(Math.random() * validTenses.length)];
          return conj[pick];
        }
        return {};
      }
      return conj;
    }
    const flatConj = _flatConj(question.conjugation || {});
    const conjWithTrans = Object.entries(flatConj)
      .map(([pr, e]) => [pr, _normConj(e)])
      .filter(([, e]) => e.form && e.translation);
    let promptText, answerText, quizPronoun = null;
    if (conjWithTrans.length && Math.random() < 0.30) {
      const [pr, e] = conjWithTrans[Math.floor(Math.random() * conjWithTrans.length)];
      quizPronoun = pr;
      promptText = showNative ? e.translation : `${pr} ${e.form}`;
      answerText = showNative ? `${pr} ${e.form}` : e.translation;
    } else {
      promptText = showNative ? question.translation : display;
      answerText = showNative ? display : question.translation;
    }

    // Decoys
    const others = _shuffle(pool.filter(w => w.id !== question.id)).slice(0, 3).map(w => {
      const sep = w.article && (w.article.endsWith("'") || w.article.endsWith("\u2019")) ? '' : ' ';
      const wd = (w.article ? w.article + sep : '') + (w.type === 'verb' && w.infinitive ? w.infinitive : w.literal);
      return showNative ? wd : w.translation;
    });
    const choices = _shuffle([answerText, ...others]);

    return {
      id: question.id, type: question.type, quizPronoun,
      literal: question.literal, definition: question.definition || '',
      article: question.article || '', infinitive: question.infinitive || '',
      verbGroup: question.verbGroup || '', conjugation: question.conjugation || {},
      verbConjugationTranslation: question.verbConjugationTranslation || '',
      declensions: question.declensions || {}, langCode: lang,
      promptText, answerText, choices, showNative, helpNote: question.helpNote || ''
    };
  }

  function _buildQuizPhrase(phrases, lang, labels) {
    let pool = phrases;
    if (labels && labels.length) pool = pool.filter(p => labels.some(lid => (p.labels || []).includes(lid)));
    if (!pool.length) return null;
    const getMax = p => p.maxProgress || _phraseMax(p);
    const unmastered = pool.filter(p => (p.progress || 0) < getMax(p));
    const active = unmastered.length ? unmastered : pool;
    active.sort((a, b) => (a.progress || 0) / getMax(a) - (b.progress || 0) / getMax(b));
    const topN = Math.max(1, Math.ceil(active.length * 0.6));
    return active[Math.floor(Math.random() * topN)];
  }

  // ── _serveFromBundle: route offline API calls to IDB data ───────────────────
  function _serveFromBundle(apiPath, bundle, body) {
    const url = new URL(apiPath, window.location.origin);
    const p = url.pathname;
    const qs = url.searchParams;
    const lang = qs.get('lang') || (bundle.config && bundle.config.currentLang);
    const langData = (bundle.languages && bundle.languages[lang]) || {};

    // ── /api/config ──────────────────────────────────────────────────────────
    if (p === '/api/config') return bundle.config;

    // ── /api/words ───────────────────────────────────────────────────────────
    if (p === '/api/words') {
      const words = langData.words || [];
      const type = qs.get('type');
      return type ? words.filter(w => w.type === type) : words;
    }

    // ── /api/phrases ─────────────────────────────────────────────────────────
    if (p === '/api/phrases') return langData.phrases || [];

    // ── /api/phrases/random ──────────────────────────────────────────────────
    if (p === '/api/phrases/random') {
      const phrases = langData.phrases || [];
      return phrases.length ? phrases[Math.floor(Math.random() * phrases.length)] : null;
    }

    // ── /api/stats ───────────────────────────────────────────────────────────
    if (p === '/api/stats') {
      const words = langData.words || [];
      const phrases = langData.phrases || [];
      const byType = {};
      ['noun', 'verb', 'adjective', 'adverb', 'other'].forEach(tp => { byType[tp] = words.filter(w => w.type === tp).length; });
      return {
        totalWords: words.length, totalPhrases: phrases.length, byType,
        mastered: words.filter(w => (w.progress || 0) >= _wordMax(w)).length,
        learning: words.filter(w => (w.progress || 0) < _wordMax(w)).length
      };
    }

    // ── /api/quiz ────────────────────────────────────────────────────────────
    if (p === '/api/quiz') {
      const words = langData.words || [];
      const types = qs.get('types') ? qs.get('types').split(',') : null;
      const labels = qs.get('labels') ? qs.get('labels').split(',') : [];
      const dir = qs.get('direction') || 'random';
      const result = _buildQuizWord(words, lang, dir, types, labels);
      if (!result) throw { error: 'Add at least 2 words to start!' };
      return result;
    }

    // ── /api/quiz/answer (POST) ──────────────────────────────────────────────
    // body is passed as the third argument to _serveFromBundle (see interceptor)
    if (p === '/api/quiz/answer') {
      const { id, answer, expectedAnswer } = (arguments[2] || {});
      if (!id) return { ok: true };
      const words = langData.words || [];
      const word = words.find(w => w.id === id);
      if (!word) return { ok: true };

      const display = (word.article ? word.article + ' ' : '') +
        (word.type === 'verb' && word.infinitive ? word.infinitive : word.literal);
      const correct = answer && (
        word.translation.trim().toLowerCase() === answer.trim().toLowerCase() ||
        display.trim().toLowerCase() === answer.trim().toLowerCase() ||
        (expectedAnswer && expectedAnswer.trim().toLowerCase() === answer.trim().toLowerCase())
      );
      const delta = correct ? 1 : -1;
      const max = word.maxProgress || _wordMax(word);

      // Update in-memory bundle so next quiz question reflects current progress
      word.progress = Math.max(0, Math.min(max, (word.progress || 0) + delta));

      // Persist updated bundle and queue the delta for server sync
      OfflineDB.saveBundle(bundle).catch(() => { });
      OfflineDB.addProgressDelta(lang, 'word', id, delta)
        .then(() => { if (window.updateOfflineSyncBtn) updateOfflineSyncBtn(); })
        .catch(() => { });

      return {
        correct,
        correctAnswer: expectedAnswer || word.translation,
        message: correct ? '✓ Correct!' : '✗ Wrong. The answer was:'
      };
    }

    // ── /api/quiz/phrase ─────────────────────────────────────────────────────
    if (p === '/api/quiz/phrase') {
      const phrases = langData.phrases || [];
      const labels = qs.get('labels') ? qs.get('labels').split(',') : [];
      const result = _buildQuizPhrase(phrases, lang, labels);
      if (!result) throw { error: 'No phrases yet.' };
      return result;
    }

    // ── /api/quiz/phrase/answer (POST) ───────────────────────────────────────
    if (p === '/api/quiz/phrase/answer') {
      const { id, correct } = (arguments[2] || {});
      if (!id) return { ok: true };
      const phrases = langData.phrases || [];
      const phrase = phrases.find(ph => ph.id === id);
      if (!phrase) return { ok: true };

      const delta = correct ? 1 : -1;
      const max = phrase.maxProgress || _phraseMax(phrase);

      phrase.progress = Math.max(0, Math.min(max, (phrase.progress || 0) + delta));

      OfflineDB.saveBundle(bundle).catch(() => { });
      OfflineDB.addProgressDelta(lang, 'phrase', id, delta)
        .then(() => { if (window.updateOfflineSyncBtn) updateOfflineSyncBtn(); })
        .catch(() => { });

      return { ok: true };
    }

    // ── /api/labels ──────────────────────────────────────────────────────────
    if (p === '/api/labels') {
      // Labels are stored in config.targetLangs[].labels with { id, name, color }
      const langCfg = (bundle.config.targetLangs || []).find(l => l.isoCode === lang) || {};
      return langCfg.labels || [];
    }

    // ── /api/languages ───────────────────────────────────────────────────────
    if (p === '/api/languages') return bundle.config.targetLangs || [];

    // ── fallback ─────────────────────────────────────────────────────────────
    return {};
  }

  // ── Reliable offline detection ────────────────────────────────────────────────
  // navigator.onLine is unreliable on localhost: it stays true even when internet
  // is cut because the loopback interface is always up. We maintain our own flag,
  // seeded from navigator.onLine but updated on every real request outcome.
  let _detectedOffline = !navigator.onLine;

  function _isOffline() { return _detectedOffline; }
  function _markOnline() {
    if (!_detectedOffline) return;
    _detectedOffline = false;
    if (window.OfflineMode) { OfflineMode._online = true; }
    if (window.updateOfflineSyncBtn) updateOfflineSyncBtn();
  }
  function _markOffline() {
    if (_detectedOffline) return;
    _detectedOffline = true;
    if (window.OfflineMode) { OfflineMode._online = false; }
    if (window.updateOfflineSyncBtn) updateOfflineSyncBtn();
  }

  // Expose so app.js OfflineMode.isOnline stays accurate
  window._isReallyOffline = _isOffline;

  // ── API interceptor ──────────────────────────────────────────────────────────
  window._offlineApiInterceptor = async function (method, path, body) {
    const offlineEnabled = window.App && window.App.config && window.App.config.offlineMode;
    const isAuthMe = path === '/auth/me' || path.endsWith('/auth/me');
    const isAuthLogin = path === '/auth/login' || path.endsWith('/auth/login');
    const WRITES = ['POST', 'PUT', 'DELETE', 'PATCH'];

    // ── Helper: serve auth/data offline ─────────────────────────────────────
    async function _handleOffline() {
      if (isAuthMe && method.toUpperCase() === 'GET') {
        const sess = OfflineSession.load();
        if (sess && sess.user) return sess.user;
        throw { error: 'offline' };
      }
      if (isAuthLogin && method.toUpperCase() === 'POST') {
        const sess = OfflineSession.load();
        if (sess && sess.user && body && body.username === sess.user.username) {
          return { ok: true, user: sess.user };
        }
        throw { error: window.t ? window.t('offline_no_connection') : 'Cannot login while offline' };
      }
      if (offlineEnabled) {
        if (method.toUpperCase() === 'GET') {
          const bundle = await OfflineDB.getBundle();
          if (bundle) return _serveFromBundle(path, bundle, body);
          throw { error: 'No offline data. Please sync while online.' };
        }
        // Quiz answers: route through _serveFromBundle so progress is tracked
        if (path.includes('/quiz/answer') || path.includes('/quiz/phrase/answer')) {
          const bundle = await OfflineDB.getBundle();
          if (bundle) return _serveFromBundle(path, bundle, body);
          return { ok: true }; // no bundle yet, silently discard
        }
        if (WRITES.includes(method.toUpperCase())) {
          throw { error: window.t ? window.t('offline_readonly') : 'Offline: read-only mode' };
        }
      }
      throw { error: 'offline', offline: true };
    }

    // ── Fast-path if we already know we're offline ───────────────────────────
    if (_isOffline()) return _handleOffline();

    // ── Try network ──────────────────────────────────────────────────────────
    try {
      const result = await window._realApi(method, path, body);
      _markOnline();
      // Persist session after every successful /auth/me
      if (isAuthMe && result && result.id) {
        OfflineSession.save(result, window.App && window.App.config);
      }
      return result;
    } catch (err) {
      // Detect offline: TypeError = network fail; err.offline = SW 503 sentinel
      const isNetworkFailure = (err instanceof TypeError) ||
        (err && err.offline === true) ||
        (err && err.error === 'offline');
      if (isNetworkFailure) {
        _markOffline();
        return _handleOffline();
      }
      throw err;
    }
  };

  // ── TTS offline hook ─────────────────────────────────────────────────────────
  window._offlineTTSFetch = async function (lang, speed, itemId) {
    const buf = await OfflineDB.getTTS(lang, speed, itemId);
    if (!buf) return null;
    return URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
  };

  // ── Pre-load locale bundle into window._offlineLocaleBundle ─────────────────
  // This runs at script-parse time (before DOMContentLoaded), so i18n.js can
  // read window._offlineLocaleBundle synchronously when it loads English.
  // We use a self-resolving promise so the IDB read races against i18n.js's
  // setTimeout(0) delay built into _i18nReady.
  (async function _preloadLocales() {
    try {
      const bundle = await OfflineDB.getBundle();
      if (bundle && bundle.locales) {
        window._offlineLocaleBundle = bundle.locales;
        // Also warm the i18n memory cache for every locale we have
        Object.entries(bundle.locales).forEach(([code, locale]) => {
          if (!window._i18nCache) window._i18nCache = {};
          window._i18nCache[code] = locale;
        });
      }
    } catch { /* IDB not ready yet – i18n.js will handle gracefully */ }
  })();

  // ── Boot ─────────────────────────────────────────────────────────────────────
  // offline-db.js is loaded BEFORE app.js in index.html, so window.api is not
  // yet defined at parse time. We patch it in DOMContentLoaded — but WITHOUT
  // setTimeout, because app.js's DOMContentLoaded handler calls checkAuth()
  // synchronously and needs the patch to already be in place.
  // Since scripts execute in order, by the time ANY DOMContentLoaded fires,
  // ALL scripts have parsed → window.api is guaranteed to be defined.
  document.addEventListener('DOMContentLoaded', () => {
    if (window.api && !window._realApi) {
      window._realApi = window.api;
      window.api = window._offlineApiInterceptor;
      console.log('[offline-db] api() patched ✓');
    } else {
      console.warn('[offline-db] api patch skipped — api:', !!window.api, '| _realApi:', !!window._realApi);
    }
    OfflineMode.init();
  });

  // ── OfflineSync ──────────────────────────────────────────────────────────────
  window.OfflineSync = {
    _running: false,
    _abortCtrl: null,

    abort() {
      if (this._abortCtrl) this._abortCtrl.abort();
      this._running = false;
    },

    async syncBundle(onProgress) {
      onProgress && onProgress({ step: 'bundle', pct: 0 });
      const resp = await fetch('/api/offline/bundle', { credentials: 'same-origin' });
      if (!resp.ok) throw new Error('Bundle fetch failed: ' + resp.status);
      onProgress && onProgress({ step: 'bundle', pct: 50 });
      const data = await resp.json();
      await OfflineDB.saveBundle(data);
      onProgress && onProgress({ step: 'bundle', pct: 100, langs: Object.keys(data.languages || {}) });
      return data;
    },

    async generateTTSCache(lang, speedNormal, speedSlow, signal, onProgress) {
      onProgress && onProgress({ step: 'tts_generate', pct: 0, done: 0, total: 0 });
      const resp = await fetch('/api/tts/generate', {
        method: 'POST', credentials: 'same-origin', signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, speedNormal, speedSlow })
      });
      if (!resp.ok) throw new Error('TTS generate HTTP ' + resp.status);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim());
            if (evt.type === 'progress') {
              const pct = evt.total > 0 ? Math.round((evt.done / evt.total) * 100) : 0;
              onProgress && onProgress({ step: 'tts_generate', pct, done: evt.done, total: evt.total });
            } else if (evt.type === 'done') {
              onProgress && onProgress({ step: 'tts_generate', pct: 100, done: evt.done, total: evt.total });
              return evt.total;
            } else if (evt.type === 'error') {
              throw new Error('TTS generate: ' + evt.message);
            }
          } catch (e) { if (e.message && e.message.startsWith('TTS generate:')) throw e; }
        }
      }
      return 0;
    },

    async syncTTSFiles(lang, signal, onProgress) {
      onProgress && onProgress({ step: 'tts_manifest', pct: 0 });
      const mResp = await fetch(`/api/offline/tts-manifest?lang=${encodeURIComponent(lang)}`, { credentials: 'same-origin', signal });
      if (!mResp.ok) throw new Error('TTS manifest failed: ' + mResp.status);
      const { files } = await mResp.json();
      if (!files || !files.length) { onProgress && onProgress({ step: 'tts_download', pct: 100, done: 0, total: 0 }); return 0; }

      onProgress && onProgress({ step: 'tts_download', pct: 0, done: 0, total: files.length });
      const CONCURRENCY = 4;
      let done = 0, saved = 0;

      async function downloadOne(entry) {
        const r = await fetch(`/api/offline/tts/${encodeURIComponent(entry.lang)}/${encodeURIComponent(entry.speedKey)}/${encodeURIComponent(entry.itemId)}`, { credentials: 'same-origin', signal });
        if (!r.ok) return;
        const buf = await r.arrayBuffer();
        const speed = (parseInt((entry.speedKey || 'spd100').replace('spd', ''), 10) || 100) / 100;
        await OfflineDB.saveTTS(entry.lang, speed, entry.itemId, buf);
        saved++;
      }

      for (let i = 0; i < files.length; i += CONCURRENCY) {
        if (signal && signal.aborted) break;
        await Promise.all(files.slice(i, i + CONCURRENCY).map(downloadOne));
        done = Math.min(i + CONCURRENCY, files.length);
        onProgress && onProgress({ step: 'tts_download', pct: Math.round((done / files.length) * 100), done, total: files.length });
      }
      onProgress && onProgress({ step: 'tts_done', pct: 100, count: saved });
      return saved;
    },

    async fullSync(langs, configByLang, onProgress) {
      if (this._running) return;
      this._running = true;
      this._abortCtrl = new AbortController();
      const signal = this._abortCtrl.signal;
      try {
        // ── Step 1: push offline progress deltas BEFORE refreshing bundle ──────
        // Must happen first so the fresh bundle reflects the synced progress.
        const queue = await OfflineDB.getProgressQueue();
        if (queue.length > 0) {
          onProgress && onProgress({ phase: 'progress', pct: 0, count: queue.length });
          try {
            const resp = await fetch('/api/progress/sync', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ deltas: queue })
            });
            if (resp.ok) {
              await OfflineDB.clearProgressQueue();
              if (window.updateOfflineSyncBtn) updateOfflineSyncBtn();
              onProgress && onProgress({ phase: 'progress', pct: 100, count: queue.length });
            } else {
              console.warn('[OfflineSync] progress sync HTTP', resp.status);
            }
          } catch (e) {
            console.warn('[OfflineSync] progress sync failed:', e);
            // Non-fatal: continue with bundle refresh; deltas remain queued
          }
        }

        // ── Step 2: download fresh bundle (now includes synced progress) ──────
        const bundle = await this.syncBundle(p => onProgress && onProgress({ phase: 'data', ...p }));
        for (const lang of langs) {
          if (signal.aborted) break;
          const lc = configByLang[lang] || {};
          const speedNormal = lc.ttsSpeedNormal != null ? lc.ttsSpeedNormal : 1.0;
          const speedSlow = lc.ttsSpeedSlow != null ? lc.ttsSpeedSlow : 0.24;
          await this.generateTTSCache(lang, speedNormal, speedSlow, signal,
            p => onProgress && onProgress({ phase: 'tts_gen', lang, ...p }));
          if (signal.aborted) break;
          await this.syncTTSFiles(lang, signal,
            p => onProgress && onProgress({ phase: 'tts_dl', lang, ...p }));
        }
        // Save current session into localStorage so offline refresh works
        if (window.App && window.App.user && window.App.config) {
          OfflineSession.save(window.App.user, window.App.config);
        }
        return bundle;
      } finally { this._running = false; }
    }
  };

})();