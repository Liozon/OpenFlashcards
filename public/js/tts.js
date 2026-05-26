// tts.js – TTS via server proxy with disk-cache support
// Each call passes ?id=<UUID> so the server can store/serve the cached MP3.
// When the user changes TTS speed for a language, old cached files are purged.
'use strict';

window.TTS = {

  // Retrieve per-language TTS speed config (falls back to defaults)
  _getSpeed: function (langCode, mode) {
    const langs = (window.App && App.config && App.config.targetLangs) || [];
    const cfg = langs.find(l => l.isoCode === langCode);
    if (mode === 'slow') return (cfg && cfg.ttsSpeedSlow != null) ? cfg.ttsSpeedSlow : 0.24;
    return (cfg && cfg.ttsSpeedNormal != null) ? cfg.ttsSpeedNormal : 1.0;
  },

  // Build the TTS URL, always including id= for server-side caching.
  // prevSpeed: if provided (and different from current speed), tells the server to delete
  // the old cached file after writing the new one (lazy migration on first play).
  _url: function (text, langCode, mode, itemId, prevSpeed) {
    const speed = TTS._getSpeed(langCode, mode);
    const id = itemId || TTS._textId(text);
    let url = '/api/tts?lang=' + encodeURIComponent(langCode) +
      '&q=' + encodeURIComponent(text) +
      '&id=' + encodeURIComponent(id) +
      '&speed=' + speed.toFixed(2);
    if (prevSpeed != null && Math.abs(prevSpeed - speed) > 0.001) {
      url += '&prevSpeed=' + parseFloat(prevSpeed).toFixed(2);
    }
    return url;
  },

  // Deterministic client-side pseudo-ID from text (matches server-side textHash fallback)
  _textId: function (text) {
    // Simple djb2 hash → hex string (good enough for URL, not a security primitive)
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h) ^ text.charCodeAt(i);
    return (h >>> 0).toString(16);
  },

  // Play text via proxy (normal speed). itemId = word/phrase UUID for cache key.
  speak: function (text, langCode, itemId) {
    if (!text) return;
    const lang = langCode || 'fr';
    const url = TTS._url(text, lang, 'normal', itemId);
    const audio = new Audio(url);
    audio.volume = 1;
    audio.play().catch(() => TTS._webSpeech(text, lang, false));
  },

  // Play text slowly. itemId = word/phrase UUID for cache key.
  speakSlow: function (text, langCode, itemId) {
    if (!text) return;
    const lang = langCode || 'fr';
    const url = TTS._url(text, lang, 'slow', itemId);
    const audio = new Audio(url);
    audio.volume = 1;
    audio.play().catch(() => TTS._webSpeech(text, lang, true));
  },

  // Fallback Web Speech API
  _webSpeech: function (text, langCode, slow) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = langCode;
    utt.rate = slow ? TTS._getSpeed(langCode, 'slow') : TTS._getSpeed(langCode, 'normal');
    window.speechSynthesis.speak(utt);
  },

  // Create a clickable 🔊 button.  itemId is the word/phrase UUID.
  button: function (text, langCode, extraStyle, itemId) {
    const btn = document.createElement('button');
    btn.className = 'btn-tts';
    btn.innerHTML = '🔊';
    btn.style.cssText = 'background:none;border:1.5px solid var(--border);border-radius:8px;' +
      'padding:4px 9px;cursor:pointer;font-size:1rem;line-height:1;color:var(--text-muted);' +
      'transition:background .15s;flex-shrink:0;' + (extraStyle || '');
    btn.addEventListener('mouseenter', () => btn.style.background = 'var(--surface-2)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'none');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      TTS.speak(text, langCode, itemId);
    });
    return btn;
  },

  // Create a clickable 🐌 (slow playback) button.  itemId is the word/phrase UUID.
  buttonSlow: function (text, langCode, extraStyle, itemId) {
    const btn = document.createElement('button');
    btn.className = 'btn-tts btn-tts-slow';
    btn.innerHTML = '🐌';
    btn.style.cssText = 'background:none;border:1.5px solid var(--border);border-radius:8px;' +
      'padding:4px 9px;cursor:pointer;font-size:1rem;line-height:1;color:var(--text-muted);' +
      'transition:background .15s;flex-shrink:0;' + (extraStyle || '');
    btn.addEventListener('mouseenter', () => btn.style.background = 'var(--surface-2)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'none');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      TTS.speakSlow(text, langCode, itemId);
    });
    return btn;
  },

  // ── Cache management ──────────────────────────────────────────────────────

  /**
   * Fetch cache stats for a language.
   * Returns { files, sizeBytes, speeds: {...} }
   */
  getCacheStats: async function (langCode) {
    try {
      const r = await fetch('/api/tts/cache?lang=' + encodeURIComponent(langCode));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch { return { files: 0, sizeBytes: 0, speeds: {} }; }
  },

  /**
   * Purge the TTS cache for a language.
   * @param {string} langCode
   * @param {number|null} speed  – if provided, purges only the bucket for that speed value.
   *                               if null/undefined, purges the entire language cache.
   * Returns { ok, deleted } or null on error.
   */
  purgeCache: async function (langCode, speed) {
    try {
      let url = '/api/tts/cache?lang=' + encodeURIComponent(langCode);
      if (speed != null) url += '&speed=' + parseFloat(speed).toFixed(2);
      const r = await fetch(url, { method: 'DELETE' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch { return null; }
  }
};
