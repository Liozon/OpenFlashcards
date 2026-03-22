// tts.js – Text to Speech helper (Web Speech API)
'use strict';

window.TTS = {
  speak: function(text, langCode) {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = langCode || 'fr-FR';
    utt.rate = 0.9;
    window.speechSynthesis.speak(utt);
  },
  button: function(text, langCode) {
    const btn = document.createElement('button');
    btn.className   = 'btn-icon';
    btn.title       = 'Listen';
    btn.textContent = '🔊';
    btn.style.fontSize = '.85rem';
    btn.addEventListener('click', () => TTS.speak(text, langCode));
    return btn;
  }
};
