// tts.js – TTS via Google Translate (même URL qu'utilisait l'app Java)
'use strict';

window.TTS = {

  // Joue le texte via Google Translate TTS (fiable, multilingue)
  speak: function(text, langCode) {
    if (!text) return;
    const lang = langCode || 'fr';
    // Google Translate TTS endpoint (public, pas de clé requise)
    const url = 'https://translate.google.com/translate_tts?ie=UTF-8&tl='
      + encodeURIComponent(lang)
      + '&q=' + encodeURIComponent(text)
      + '&client=tw-ob';
    // Utiliser un Audio element pour éviter les blocages CORS des fetch
    const audio = new Audio(url);
    audio.volume = 1;
    audio.play().catch(() => {
      // Fallback: Web Speech API si Google bloqué
      TTS._webSpeech(text, lang);
    });
  },

  // Fallback Web Speech API
  _webSpeech: function(text, langCode) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang  = langCode;
    utt.rate  = 0.9;
    window.speechSynthesis.speak(utt);
  },

  // Crée un bouton 🔊 cliquable
  button: function(text, langCode, extraStyle) {
    const btn = document.createElement('button');
    btn.className   = 'btn-tts';
    btn.title       = 'Listen / Écouter';
    btn.innerHTML   = '🔊';
    btn.style.cssText = 'background:none;border:1.5px solid var(--border);border-radius:8px;' +
      'padding:4px 9px;cursor:pointer;font-size:1rem;line-height:1;color:var(--text-muted);' +
      'transition:background .15s;flex-shrink:0;' + (extraStyle||'');
    btn.addEventListener('mouseenter', () => btn.style.background = 'var(--surface-2)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'none');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      TTS.speak(text, langCode);
    });
    return btn;
  }
};
