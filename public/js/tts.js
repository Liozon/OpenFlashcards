// tts.js – TTS via Google Translate proxied through the app server
'use strict';

window.TTS = {

  // Retrieve per-language TTS speed config (falls back to defaults)
  _getSpeed: function (langCode, mode) {
    const langs = (window.App && App.config && App.config.targetLangs) || [];
    const cfg = langs.find(l => l.isoCode === langCode);
    if (mode === 'slow') return (cfg && cfg.ttsSpeedSlow  != null) ? cfg.ttsSpeedSlow  : 0.24;
    return                       (cfg && cfg.ttsSpeedNormal != null) ? cfg.ttsSpeedNormal : 1.0;
  },

  // Speaks the text via the server proxy → Google Translate TTS
  speak: function (text, langCode) {
    if (!text) return;
    const lang = langCode || 'fr';
    const speed = TTS._getSpeed(lang, 'normal');
    const speedSuffix = speed !== 1.0 ? '&speed=' + speed.toFixed(2) : '';
    const url = '/api/tts?lang=' + encodeURIComponent(lang) + '&q=' + encodeURIComponent(text) + speedSuffix;
    const audio = new Audio(url);
    audio.volume = 1;
    audio.play().catch(() => {
      // Fallback: Web Speech API si le proxy échoue
      TTS._webSpeech(text, lang, false);
    });
  },

  // Speaks slowly (for language learning)
  speakSlow: function (text, langCode) {
    if (!text) return;
    const lang = langCode || 'fr';
    const speed = TTS._getSpeed(lang, 'slow');
    const url = '/api/tts?lang=' + encodeURIComponent(lang) + '&q=' + encodeURIComponent(text) + '&speed=' + speed.toFixed(2);
    const audio = new Audio(url);
    audio.volume = 1;
    audio.play().catch(() => {
      // Fallback: Web Speech API si le proxy échoue
      TTS._webSpeech(text, lang, true);
    });
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

  // Create a clickable 🔊 button
  button: function (text, langCode, extraStyle) {
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
      TTS.speak(text, langCode);
    });
    return btn;
  },

  // Create a clickable 🐌 (slow playback) button
  buttonSlow: function (text, langCode, extraStyle) {
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
      TTS.speakSlow(text, langCode);
    });
    return btn;
  }
};
