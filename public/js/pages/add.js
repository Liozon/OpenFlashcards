// pages/add.js
'use strict';

function renderAdd(el) {
  window._addWordType = 'noun';
  const lang = currentLang();
  if (!lang) { navigate('settings'); return; }

  // Block writes when offline
  if (window.App && App.config && App.config.offlineMode && !navigator.onLine) {
    el.innerHTML = `<div class="page-title">➕ ${t('nav_add')}</div>
      <div class="card" style="text-align:center;padding:32px 20px">
        <div style="font-size:3rem;margin-bottom:12px">📴</div>
        <h3 style="margin-bottom:8px">${t('offline_no_connection')}</h3>
        <p style="color:var(--text-muted)">${t('offline_readonly')}</p>
      </div>`;
    return;
  }

  const langData = currentLangData();
  const pronouns = (langData && langData.pronouns) ? langData.pronouns : ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];
  const declensions = (langData && langData.declensions) ? langData.declensions : [];
  const tenses = (langData && langData.tenses && langData.tenses.length) ? langData.tenses : [{ nativeName: 'Present', targetName: 'Present' }];
  const verbGroups = (langData && langData.verbGroups) ? langData.verbGroups : [];

  const vgOptions = verbGroups.length
    ? `<div class="field-group" id="verbGroupField">
        <label>${t('add_verb_group')} <span class="optional">${t('vocab_optional')}</span></label>
        <select id="wVerbGroup" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)">
          <option value="">—</option>
          ${verbGroups.map(g => `<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('')}
        </select>
      </div>`
    : '';

  el.innerHTML = `
    <div class="page-title">➕ ${t('add_title')}</div>
    <div class="add-tabs">
      <button class="add-tab active" data-tab="word"   onclick="switchAddTab('word',this)">📝 ${t('add_tab_word')}</button>
      <button class="add-tab"        data-tab="phrase" onclick="switchAddTab('phrase',this)">💬 ${t('add_tab_phrase')}</button>
    </div>

    <div class="toggle-row" style="margin-bottom:16px;gap:10px" id="autoTranslateRow">
      <label class="toggle-switch">
        <input type="checkbox" id="autoTranslateToggle">
        <span class="toggle-slider"></span>
      </label>
      <span>${t('add_auto_translate')}</span>
    </div>

    <!-- WORD FORM -->
    <div id="tabWord">
      <div class="type-selector" id="wordTypeSelector">
        <button class="type-btn active" data-type="noun"      onclick="selectWordType('noun',this)">📦 ${t('add_type_noun')}</button>
        <button class="type-btn"        data-type="verb"       onclick="selectWordType('verb',this)">⚡ ${t('add_type_verb')}</button>
        <button class="type-btn"        data-type="adjective"  onclick="selectWordType('adjective',this)">🎨 ${t('add_type_adj')}</button>
        <button class="type-btn"        data-type="adverb"     onclick="selectWordType('adverb',this)">💨 ${t('add_type_adv')}</button>
        <button class="type-btn"        data-type="other"     onclick="selectWordType('other',this)">🧩 ${t('add_type_other')}</button>
      </div>

      <div class="card">
        <div id="nounExtras" class="field-group">
          <label>${t('add_article')} <span class="optional">${t('vocab_optional')}</span></label>
          <input type="text" id="wArticle" placeholder="${t('add_article_ph')}" autocomplete="off">
        </div>

        <div class="field-group">
          <label><span id="wTypeLabel">${t('add_word_label')}</span> <strong>${langData ? (langData.flag || '') + ' ' + langData.name : lang}</strong> <span class="required">*</span></label>
          <input type="text" id="wLiteral" autocomplete="off" placeholder="${t('add_word_ph')}">
          <small style="color:var(--text-faint);font-size:.8rem">${t('add_nominative_hint')}</small>
        </div>

        <div class="field-group">
          <label>${t('add_translation')} <span class="required">*</span></label>
          <input type="text" id="wTranslation" autocomplete="off" placeholder="${t('add_translation_ph')}">
        </div>

        <div id="verbExtras" class="hidden">
          ${vgOptions}
          <div id="tenseConjSections">
            ${tenses.map((tense, ti) => `
            <details style="margin-bottom:12px" class="tense-conj-detail">
              <summary style="cursor:pointer;font-weight:600;font-size:.9rem;color:var(--text-muted);margin-bottom:6px">
                ${esc(tense.targetName || tense.nativeName)} <span style="color:var(--text-faint);font-weight:400;font-size:.8rem">/ ${esc(tense.nativeName)}</span> <span class="optional">${t('vocab_optional')}</span>
              </summary>
              <div style="font-size:.75rem;color:var(--text-faint);margin-bottom:4px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:0 2px">
                <span style="font-weight:600">${t('add_conj_pronoun')}</span>
                <span>${t('add_conj_form')}</span>
                <span>${t('add_conj_translation_ph')}</span>
              </div>
              <div class="conjugation-grid" id="conjGrid_${ti}"></div>
            </details>
            `).join('')}
          </div>
        </div>

        ${declensions.length ? `
        <details id="declensionsSection" style="margin-bottom:16px">
          <summary style="cursor:pointer;font-weight:600;font-size:.9rem;color:var(--text-muted);margin-bottom:8px">
            📐 ${t('add_declensions')} <span class="optional">${t('vocab_optional')}</span>
          </summary>
          <div id="declGrid"></div>
        </details>` : ''}

        <div class="field-group">
          <label>${t('add_definition')} <span class="optional">${t('vocab_optional')}</span></label>
          <input type="text" id="wDefinition" autocomplete="off" placeholder="${t('add_definition_ph')}">
        </div>
        <div id="wordLabelPickerContainer"></div>
        <div id="wordAddErr" class="alert alert-danger hidden"></div>
        <div id="wordAddOk"  class="alert alert-success hidden"></div>
        <button class="btn btn-primary btn-full" id="addWordBtn" onclick="submitWord()">➕ ${t('add_btn_word')}</button>
      </div>
    </div>

    <!-- PHRASE FORM -->
    <div id="tabPhrase" class="hidden">
      <div class="card">
        <div class="field-group">
          <label>${t('add_phrase_label')} <strong>${langData ? (langData.flag || '') + ' ' + langData.name : lang}</strong> <span class="required">*</span></label>
          <textarea id="pText" placeholder="${t('add_phrase_ph')}" rows="3"></textarea>
        </div>
        <div class="field-group">
          <label>${t('add_translation')} <span class="required">*</span></label>
          <input type="text" id="pTranslation" autocomplete="off" placeholder="${t('add_translation_ph')}">
        </div>
        <div class="field-group">
          <label>${t('add_phrase_note')} <span class="optional">${t('vocab_optional')}</span></label>
          <input type="text" id="pNote" autocomplete="off" placeholder="${t('add_phrase_note_ph')}">
        </div>
        <div id="phraseLabelPickerContainer"></div>
        <div id="phraseAddErr" class="alert alert-danger hidden"></div>
        <div id="phraseAddOk"  class="alert alert-success hidden"></div>
        <button class="btn btn-primary btn-full" id="addPhraseBtn" onclick="submitPhrase()">➕ ${t('add_btn_phrase')}</button>
      </div>
    </div>`;

  // ── Label pickers ──────────────────────────────────────────────────────────
  // Inject the label picker widget into both the word and phrase containers.
  // buildLabelPicker / toggleLabelPick / showCreateLabelInline /
  // confirmCreateLabelInline are all defined in vocabulary.js which loads first.
  const wordLabelContainer = document.getElementById('wordLabelPickerContainer');
  if (wordLabelContainer && typeof buildLabelPicker === 'function') {
    wordLabelContainer.innerHTML = buildLabelPicker([], 'wordLabelPickerContainer');
  }

  const phraseLabelContainer = document.getElementById('phraseLabelPickerContainer');
  if (phraseLabelContainer && typeof buildLabelPicker === 'function') {
    phraseLabelContainer.innerHTML = buildLabelPicker([], 'phraseLabelPickerContainer');
  }

  // Expose getters used by submitWord / submitPhrase
  window.getAddPageSelectedLabels = function () {
    const chips = document.getElementById('wordLabelPickerContainer-chips');
    if (!chips) return [];
    return [...chips.querySelectorAll('.label-pick-btn.active')].map(b => b.dataset.lid).filter(Boolean);
  };
  window.getAddPagePhraseSelectedLabels = function () {
    const chips = document.getElementById('phraseLabelPickerContainer-chips');
    if (!chips) return [];
    return [...chips.querySelectorAll('.label-pick-btn.active')].map(b => b.dataset.lid).filter(Boolean);
  };

  // Build conjugation grids per tense
  tenses.forEach((tense, ti) => {
    const conjGrid = document.getElementById(`conjGrid_${ti}`);
    if (conjGrid) {
      pronouns.forEach((p, pi) => {
        conjGrid.innerHTML += `
          <div class="conj-item field-group">
            <label style="font-size:.82rem;font-weight:600">${esc(p)}</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="text" id="conj_${ti}_${pi}" autocomplete="off" placeholder="…" style="flex:1">
              <input type="text" id="conjtr_${ti}_${pi}" autocomplete="off" placeholder="${t('add_conj_translation_ph')}" style="flex:1;font-size:.85rem;color:var(--text-muted)">
            </div>
          </div>`;
      });
    }
  });

  // Build declensions grid
  const declGrid = document.getElementById('declGrid');
  if (declGrid && declensions.length) {
    declensions.forEach((d, i) => {
      declGrid.innerHTML += `
        <div class="field-group" style="margin-bottom:10px">
          <label style="font-size:.85rem">${esc(d.nativeName)}${d.targetName ? ' <span style="color:var(--text-faint)">/ ' + esc(d.targetName) + '</span>' : ''}</label>
          <input type="text" id="decl_${i}" autocomplete="off" placeholder="…">
        </div>`;
    });
  }


  ['wLiteral', 'wTranslation', 'wDefinition', 'wArticle'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.addEventListener('keydown', e => { if (e.key === 'Enter') submitWord(); });
  });
  ['pTranslation', 'pNote'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.addEventListener('keydown', e => { if (e.key === 'Enter') submitPhrase(); });
  });

  // ── Auto-translate toggle ──────────────────────────────────────────────────
  const autoToggle = document.getElementById('autoTranslateToggle');
  if (autoToggle) {
    const saved = localStorage.getItem('add_auto_translate') === 'true';
    autoToggle.checked = saved;
    window._addAutoTranslate = saved;
    autoToggle.addEventListener('change', () => {
      window._addAutoTranslate = autoToggle.checked;
      localStorage.setItem('add_auto_translate', autoToggle.checked);
      if (autoToggle.checked) {
        _triggerAutoTranslate();
      } else {
        _purgeAutoOverlays();
      }
    });
  }

  // ── Auto-translate input handlers (word fields) ────────────────────────────
  ['wLiteral', 'wTranslation'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.addEventListener('input', () => {
      _lastEditedField = id;
      _scheduleWordTranslate();
    });
  });

  // ── Auto-translate input handlers (phrase fields) ──────────────────────────
  ['pText', 'pTranslation'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.addEventListener('input', () => {
      _lastEditedField = id;
      _schedulePhraseTranslate();
    });
  });
}

// ── Auto-translate helpers ────────────────────────────────────────────────────
if (!window._autoTranslateTimers) window._autoTranslateTimers = {};
if (!window._autoTranslateVersions) window._autoTranslateVersions = {};
let _lastEditedField = null;

function _getTranslateLangs() {
  const uiLang = (App.config && App.config.uiLang) || 'en';
  const targetLang = currentLang();
  return { uiLang, targetLang };
}

async function _translateGoogle(text, src, tgt) {
  if (!text.trim()) return { main: '', alternatives: [] };
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' +
    encodeURIComponent(src) + '&tl=' + encodeURIComponent(tgt) +
    '&dt=t&dt=at&q=' + encodeURIComponent(text);
  const res = await fetch(url);
  const data = await res.json();
  const segs = data[0];
  const main = segs ? segs.map(s => s[0]).join('') : '';
  const alternatives = _extractAltsGoogle(data, main);
  return { main, alternatives };
}

function _fetchSuggestions(text) {
  if (!text.trim() || text.split(/\s+/).length < 2) return Promise.resolve([]);
  return new Promise(resolve => {
    const callbackName = '_atsCb' + Date.now();
    const script = document.createElement('script');
    script.src = 'https://suggestqueries.google.com/complete/search?client=firefox&q=' +
      encodeURIComponent(text) + '&callback=' + callbackName;
    const timeout = setTimeout(() => {
      cleanup();
      resolve([]);
    }, 4000);
    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    window[callbackName] = function (data) {
      cleanup();
      if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
        resolve(data[1].filter(s => typeof s === 'string' && s.length > text.length).slice(0, 6));
      } else {
        resolve([]);
      }
    };
    document.head.appendChild(script);
  });
}

function _extractAltsGoogle(data, main) {
  const seen = new Set();
  function _validAlt(v) {
    if (!v || v === main || v.length <= 1 || v.length > 40) return false;
    if (/[#_/\\[\]{}()<>|]/.test(v)) return false;
    return true;
  }
  try {
    const d5 = data[5];
    if (Array.isArray(d5)) {
      for (const entry of d5) {
        if (Array.isArray(entry) && Array.isArray(entry[2])) {
          for (const variant of entry[2]) {
            if (Array.isArray(variant) && typeof variant[0] === 'string') seen.add(variant[0]);
          }
        }
      }
    }
  } catch (e) { }
  try {
    const f7 = data[7];
    if (Array.isArray(f7) && typeof f7[0] === 'string' && f7.length <= 15) {
      f7.forEach(v => seen.add(v));
    }
  } catch (e) { }
  return [...seen].filter(v => _validAlt(v)).slice(0, 10);
}

function _scheduleWordTranslate() {
  if (!window._addAutoTranslate) return;
  const id = 'word';
  if (window._autoTranslateTimers[id]) clearTimeout(window._autoTranslateTimers[id]);
  if (!window._autoTranslateVersions[id]) window._autoTranslateVersions[id] = 0;
  window._autoTranslateVersions[id]++;
  const ver = window._autoTranslateVersions[id];

  window._autoTranslateTimers[id] = setTimeout(async () => {
    const { uiLang, targetLang } = _getTranslateLangs();
    let sourceText, srcLang, tgtLang, targetId;
    if (_lastEditedField === 'wTranslation') {
      sourceText = document.getElementById('wTranslation')?.value.trim();
      srcLang = uiLang; tgtLang = targetLang; targetId = 'wLiteral';
    } else if (_lastEditedField === 'wLiteral') {
      sourceText = document.getElementById('wLiteral')?.value.trim();
      srcLang = targetLang; tgtLang = uiLang; targetId = 'wTranslation';
    } else {
      return;
    }
    if (!sourceText) return;

    _clearOverlays(targetId);
    _clearOverlays(_lastEditedField);
    const [result, suggestions] = await Promise.all([
      _translateGoogle(sourceText, srcLang, tgtLang),
      _fetchSuggestions(sourceText),
    ]);
    if (ver !== window._autoTranslateVersions[id]) return;
    if (!result.main) return;

    _applyTranslation(targetId, result.main, result.alternatives);
    if (suggestions.length) {
      _showSuggestions(_lastEditedField, suggestions, sourceText);
    }
  }, 500);
}

function _schedulePhraseTranslate() {
  if (!window._addAutoTranslate) return;
  const id = 'phrase';
  if (window._autoTranslateTimers[id]) clearTimeout(window._autoTranslateTimers[id]);
  if (!window._autoTranslateVersions[id]) window._autoTranslateVersions[id] = 0;
  window._autoTranslateVersions[id]++;
  const ver = window._autoTranslateVersions[id];

  window._autoTranslateTimers[id] = setTimeout(async () => {
    const { uiLang, targetLang } = _getTranslateLangs();
    let sourceText, srcLang, tgtLang, targetId;
    if (_lastEditedField === 'pTranslation') {
      sourceText = document.getElementById('pTranslation')?.value.trim();
      srcLang = uiLang; tgtLang = targetLang; targetId = 'pText';
    } else if (_lastEditedField === 'pText') {
      sourceText = document.getElementById('pText')?.value.trim();
      srcLang = targetLang; tgtLang = uiLang; targetId = 'pTranslation';
    } else {
      return;
    }
    if (!sourceText) return;

    _clearOverlays(targetId);
    _clearOverlays(_lastEditedField);
    const [result, suggestions] = await Promise.all([
      _translateGoogle(sourceText, srcLang, tgtLang),
      _fetchSuggestions(sourceText),
    ]);
    if (ver !== window._autoTranslateVersions[id]) return;
    if (!result.main) return;

    _applyPhraseTranslation(targetId, result.main, result.alternatives);
    if (suggestions.length) {
      _showSuggestions(_lastEditedField, suggestions, sourceText);
    }
  }, 500);
}

function _clearOverlays(fieldId) {
  if (!fieldId) return;
  const old = document.getElementById(fieldId + '_variants');
  if (old) old.remove();
  const oldSug = document.getElementById(fieldId + '_suggestions');
  if (oldSug) oldSug.remove();
}

function _purgeAutoOverlays() {
  ['wLiteral', 'wTranslation', 'pText', 'pTranslation'].forEach(_clearOverlays);
}

function _triggerAutoTranslate() {
  const wordTab = document.getElementById('tabWord');
  const phraseTab = document.getElementById('tabPhrase');
  if (wordTab && !wordTab.classList.contains('hidden')) {
    const lit = document.getElementById('wLiteral');
    const tran = document.getElementById('wTranslation');
    if (lit && lit.value.trim()) {
      _lastEditedField = 'wLiteral';
      _scheduleWordTranslate();
    } else if (tran && tran.value.trim()) {
      _lastEditedField = 'wTranslation';
      _scheduleWordTranslate();
    }
  }
  if (phraseTab && !phraseTab.classList.contains('hidden')) {
    const txt = document.getElementById('pText');
    const tran = document.getElementById('pTranslation');
    if (txt && txt.value.trim()) {
      _lastEditedField = 'pText';
      _schedulePhraseTranslate();
    } else if (tran && tran.value.trim()) {
      _lastEditedField = 'pTranslation';
      _schedulePhraseTranslate();
    }
  }
}

function _showSuggestions(fieldId, suggestions, srcText) {
  const el = document.getElementById(fieldId);
  if (!el || !suggestions.length) return;

  const old = document.getElementById(fieldId + '_suggestions');
  if (old) old.remove();

  const container = document.createElement('div');
  container.id = fieldId + '_suggestions';
  container.className = 'auto-translate-suggestions';
  container.innerHTML = suggestions.map(s => {
    const attr = s.replace(/"/g, '&quot;');
    return '<span class="ats-word" data-word="' + attr + '" data-field="' + fieldId + '">' + _highlightMatch(s, srcText) + '</span>';
  }).join('');

  el.parentNode.insertBefore(container, el.nextSibling);

  container.querySelectorAll('.ats-word').forEach(span => {
    span.addEventListener('click', function () {
      const field = document.getElementById(this.dataset.field);
      if (!field) return;
      field.value = this.dataset.word;
      _clearOverlays(this.dataset.field);
      field.focus();
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

function _highlightMatch(text, query) {
  if (!query) return esc(text);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return esc(text);
  return esc(text.slice(0, idx)) + '<strong>' + esc(text.slice(idx, idx + query.length)) + '</strong>' + esc(text.slice(idx + query.length));
}

function _applyTranslation(targetId, main, alternatives) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.value = main;

  // Remove old variant container
  const old = document.getElementById(targetId + '_variants');
  if (old) old.remove();

  if (!alternatives.length) return;

  const container = document.createElement('div');
  container.id = targetId + '_variants';
  container.className = 'auto-translate-variants';
  container.innerHTML = alternatives.map((w, i) => {
    const attr = w.replace(/"/g, '&quot;');
    return (i === 0 ? '' : '<span class="atv-sep"> | </span>') +
      '<span class="atv-word" data-word="' + attr + '" data-target="' + targetId + '">' + w + '</span>';
  }).join('');

  el.parentNode.insertBefore(container, el.nextSibling);

  container.querySelectorAll('.atv-word').forEach(span => {
    span.addEventListener('click', function () {
      const target = document.getElementById(this.dataset.target);
      if (target) {
        target.value = this.dataset.word;
      }
      this.closest('.auto-translate-variants')?.remove();
    });
  });
}

function _applyPhraseTranslation(targetId, main, alternatives) {
  // Same as _applyTranslation but for textarea
  const el = document.getElementById(targetId);
  if (!el) return;
  el.value = main;

  const old = document.getElementById(targetId + '_variants');
  if (old) old.remove();

  if (!alternatives.length) return;

  const container = document.createElement('div');
  container.id = targetId + '_variants';
  container.className = 'auto-translate-variants';
  container.innerHTML = alternatives.map((w, i) => {
    const attr = w.replace(/"/g, '&quot;');
    return (i === 0 ? '' : '<span class="atv-sep"> | </span>') +
      '<span class="atv-word" data-word="' + attr + '" data-target="' + targetId + '">' + w + '</span>';
  }).join('');

  el.parentNode.insertBefore(container, el.nextSibling);

  container.querySelectorAll('.atv-word').forEach(span => {
    span.addEventListener('click', function () {
      const target = document.getElementById(this.dataset.target);
      if (target) {
        target.value = this.dataset.word;
      }
      this.closest('.auto-translate-variants')?.remove();
    });
  });
}

window._addWordType = 'noun';

window.selectWordType = function (type, btn) {
  window._addWordType = type;
  document.querySelectorAll('#wordTypeSelector .type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('nounExtras').classList.toggle('hidden', type !== 'noun');
  document.getElementById('verbExtras').classList.toggle('hidden', type !== 'verb');
  const declSect = document.getElementById('declensionsSection');
  if (declSect) declSect.style.display = type === 'verb' ? 'none' : '';
  const labelSpan = document.getElementById('wTypeLabel');
  if (labelSpan) labelSpan.textContent = type === 'verb' ? (t('add_infinitive_label') || 'Infinitive in') : (t('add_word_label') || 'Word in');
};

window.switchAddTab = function (tab, btn) {
  document.querySelectorAll('.add-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tabWord').classList.toggle('hidden', tab !== 'word');
  document.getElementById('tabPhrase').classList.toggle('hidden', tab !== 'phrase');
};

window.submitWord = async function () {
  const lang = currentLang();
  const type = window._addWordType;
  const literal = document.getElementById('wLiteral')?.value.trim();
  const translation = document.getElementById('wTranslation')?.value.trim();
  const definition = document.getElementById('wDefinition')?.value.trim();
  const errEl = document.getElementById('wordAddErr');
  const okEl = document.getElementById('wordAddOk');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  if (!literal || !translation) {
    errEl.textContent = t('add_err_word'); errEl.classList.remove('hidden'); return;
  }

  const body = { lang, type, literal, translation, definition };
  if (type === 'noun') body.article = document.getElementById('wArticle')?.value.trim() || '';
  if (type === 'verb') {
    body.verbGroup = document.getElementById('wVerbGroup')?.value || '';
    const langData = currentLangData();
    const tenses = (langData && langData.tenses && langData.tenses.length) ? langData.tenses : [{ nativeName: 'Present', targetName: 'Present' }];
    const pronouns = (langData && langData.pronouns) ? langData.pronouns : ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];
    const conj = {};
    tenses.forEach((tense, ti) => {
      const tenseConj = {};
      pronouns.forEach((p, pi) => {
        const form = document.getElementById(`conj_${ti}_${pi}`)?.value.trim();
        const tr = document.getElementById(`conjtr_${ti}_${pi}`)?.value.trim();
        if (form || tr) tenseConj[p] = { form: form || '', translation: tr || '' };
      });
      if (Object.keys(tenseConj).length) conj[String(ti)] = tenseConj;
    });
    body.conjugation = conj;
  }

  const langData = currentLangData();
  const declensions = (langData && langData.declensions) ? langData.declensions : [];
  if (declensions.length) {
    const declObj = {};
    declensions.forEach((d, i) => {
      const val = document.getElementById(`decl_${i}`)?.value.trim();
      if (val) declObj[i] = { nativeName: d.nativeName, targetName: d.targetName, value: val };
    });
    if (Object.keys(declObj).length) body.declensions = declObj;
  }

  body.labels = (window.getAddPageSelectedLabels ? window.getAddPageSelectedLabels() : []);

  const btn = document.getElementById('addWordBtn');
  btn.disabled = true;
  try {
    await api('POST', '/api/words', body);
    okEl.textContent = `✓ ${t('add_ok_word')} "${literal}"`;
    okEl.classList.remove('hidden');

    ['wLiteral', 'wTranslation', 'wDefinition', 'wArticle'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.querySelectorAll('[id^="conj_"],[id^="conjtr_"]').forEach(el => { if (el) el.value = ''; });
    document.querySelectorAll('[id^="decl_"]').forEach(el => el.value = '');
    const vgEl = document.getElementById('wVerbGroup');
    if (vgEl) vgEl.value = '';
    document.getElementById('wLiteral')?.focus();
    document.querySelectorAll('#wordLabelPickerContainer-chips .label-pick-btn').forEach(b => { b.classList.remove('active'); b.style.background = 'transparent'; b.style.color = b.dataset.color; });
    setTimeout(() => okEl.classList.add('hidden'), 8000);
  } catch (e) {
    errEl.textContent = e.error || t('common_error'); errEl.classList.remove('hidden');
  }
  btn.disabled = false;
};

window.submitPhrase = async function () {
  const lang = currentLang();
  const text = document.getElementById('pText')?.value.trim();
  const translation = document.getElementById('pTranslation')?.value.trim();
  const helpNote = document.getElementById('pNote')?.value.trim();
  const errEl = document.getElementById('phraseAddErr');
  const okEl = document.getElementById('phraseAddOk');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  if (!text || !translation) {
    errEl.textContent = t('add_err_phrase'); errEl.classList.remove('hidden'); return;
  }

  const phraseLabels = (window.getAddPagePhraseSelectedLabels ? window.getAddPagePhraseSelectedLabels() : []);

  const btn = document.getElementById('addPhraseBtn');
  btn.disabled = true;
  try {
    await api('POST', '/api/phrases', { lang, text, translation, helpNote, labels: phraseLabels });
    okEl.textContent = `✓ ${t('add_ok_phrase')}`;
    okEl.classList.remove('hidden');
    document.getElementById('pText').value = '';
    document.getElementById('pTranslation').value = '';
    document.getElementById('pNote').value = '';
    document.getElementById('pText').focus();
    document.querySelectorAll('#phraseLabelPickerContainer-chips .label-pick-btn').forEach(b => { b.classList.remove('active'); b.style.background = 'transparent'; b.style.color = b.dataset.color; });
    setTimeout(() => okEl.classList.add('hidden'), 8000);
  } catch (e) {
    errEl.textContent = e.error || t('common_error'); errEl.classList.remove('hidden');
  }
  btn.disabled = false;
};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}