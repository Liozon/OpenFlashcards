// pages/add.js
'use strict';

function renderAdd(el) {
  const lang = currentLang();
  if (!lang) { navigate('settings'); return; }

  const langData = currentLangData();
  const pronouns = (langData && langData.pronouns) ? langData.pronouns : ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];
  const declensions = (langData && langData.declensions) ? langData.declensions : [];
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
    <div class="page-title">${t('add_title')}</div>
    <div class="add-tabs">
      <button class="add-tab active" data-tab="word"   onclick="switchAddTab('word',this)">${t('add_tab_word')}</button>
      <button class="add-tab"        data-tab="phrase" onclick="switchAddTab('phrase',this)">${t('add_tab_phrase')}</button>
    </div>

    <!-- WORD FORM -->
    <div id="tabWord">
      <div class="type-selector" id="wordTypeSelector">
        <button class="type-btn active" data-type="noun"      onclick="selectWordType('noun',this)">${t('add_type_noun')}</button>
        <button class="type-btn"        data-type="verb"       onclick="selectWordType('verb',this)">${t('add_type_verb')}</button>
        <button class="type-btn"        data-type="adjective"  onclick="selectWordType('adjective',this)">${t('add_type_adj')}</button>
        <button class="type-btn"        data-type="adverb"     onclick="selectWordType('adverb',this)">${t('add_type_adv')}</button>
      </div>

      <div class="card">
        <div id="nounExtras" class="field-group">
          <label>${t('add_article')} <span class="optional">${t('vocab_optional')}</span></label>
          <input type="text" id="wArticle" placeholder="${t('add_article_ph')}" autocomplete="off">
        </div>
        <div id="verbExtras" class="hidden">
          <div class="field-group">
            <label>${t('add_infinitive')} <span class="optional">${t('vocab_optional')}</span></label>
            <input type="text" id="wInfinitive" placeholder="${t('add_infinitive_ph')}" autocomplete="off">
          </div>
          ${vgOptions}
          <details style="margin-bottom:16px">
            <summary style="cursor:pointer;font-weight:600;font-size:.9rem;color:var(--text-muted);margin-bottom:8px">
              ${t('add_conjugation')} <span class="optional">${t('vocab_optional')}</span>
            </summary>
            <div style="font-size:.75rem;color:var(--text-faint);margin-bottom:4px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:0 2px">
              <span style="font-weight:600">${t('add_conj_pronoun')}</span>
              <span>${t('add_conj_form')}</span>
              <span>${t('add_conj_translation_ph')}</span>
            </div>
            <div class="conjugation-grid" id="conjGrid"></div>
            <div class="field-group" style="margin-top:8px">
              <label style="font-size:.88rem">${t('add_verb_conjugation_translation')} <span class="optional">${t('common_optional')}</span></label>
              <input type="text" id="wConjTranslation" autocomplete="off" placeholder="${t('add_verb_conjugation_translation_ph')}">
            </div>
          </details>
        </div>

        <div class="field-group">
          <label>${t('add_word_label')} <strong>${langData ? (langData.flag || '') + ' ' + langData.name : lang}</strong> <span class="required">*</span></label>
          <input type="text" id="wLiteral" autocomplete="off" placeholder="${t('add_word_ph')}">
          <small style="color:var(--text-faint);font-size:.8rem">${t('add_nominative_hint')}</small>
        </div>

        ${declensions.length ? `
        <details id="declensionsSection" style="margin-bottom:16px">
          <summary style="cursor:pointer;font-weight:600;font-size:.9rem;color:var(--text-muted);margin-bottom:8px">
            ${t('add_declensions')} <span class="optional">${t('vocab_optional')}</span>
          </summary>
          <div id="declGrid"></div>
        </details>` : ''}

        <div class="field-group">
          <label>${t('add_translation')} <span class="required">*</span></label>
          <input type="text" id="wTranslation" autocomplete="off" placeholder="${t('add_translation_ph')}">
        </div>
        <div class="field-group">
          <label>${t('add_definition')} <span class="optional">${t('vocab_optional')}</span></label>
          <input type="text" id="wDefinition" autocomplete="off" placeholder="${t('add_definition_ph')}">
        </div>
        <div id="wordLabelPickerContainer"></div>
        <div id="wordAddErr" class="alert alert-danger hidden"></div>
        <div id="wordAddOk"  class="alert alert-success hidden"></div>
        <button class="btn btn-primary btn-full" id="addWordBtn" onclick="submitWord()">${t('add_btn_word')}</button>
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
        <button class="btn btn-primary btn-full" id="addPhraseBtn" onclick="submitPhrase()">${t('add_btn_phrase')}</button>
      </div>
    </div>`;

  // Build conjugation grid
  const conjGrid = document.getElementById('conjGrid');
  if (conjGrid) {
    pronouns.forEach((p, i) => {
      conjGrid.innerHTML += `
        <div class="conj-item field-group">
          <label style="font-size:.82rem;font-weight:600">${p}</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="text" id="conj_${i}" autocomplete="off" placeholder="…" style="flex:1">
            <input type="text" id="conjtr_${i}" autocomplete="off" placeholder="${t('add_conj_translation_ph')}" style="flex:1;font-size:.85rem;color:var(--text-muted)">
          </div>
        </div>`;
    });
  }

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


  // Build label pickers
  const lang_ = currentLang();
  const langData_ = currentLangData();
  const allLabels_ = (langData_ && langData_.labels) ? langData_.labels : [];

  function buildAddPageLabelPicker(containerId, trackKey) {
    const container = document.getElementById(containerId);
    if (!container || !allLabels_.length) return;
    container.innerHTML =
      '<div style="margin-bottom:14px">' +
        '<label style="font-size:.88rem;font-weight:600;color:var(--text-muted)">' + t('labels_assign') + ' <span class="optional">' + t('common_optional') + '</span></label>' +
        '<div id="' + containerId + '-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">' +
          allLabels_.map(lb =>
            '<button type="button" class="label-pick-btn" data-lid="' + lb.id + '"' +
            ' style="padding:3px 10px;border-radius:12px;font-size:.78rem;cursor:pointer;background:transparent;border:1.5px solid ' + lb.color + ';color:' + lb.color + ';transition:.15s"' +
            ' onclick="this.classList.toggle(\'active\');this.style.background=this.classList.contains(\'active\')?\'' + lb.color + '33\':\'transparent\'">' + lb.name + '</button>'
          ).join('') +
        '</div>' +
      '</div>';
  }

  buildAddPageLabelPicker('wordLabelPickerContainer', 'word');
  buildAddPageLabelPicker('phraseLabelPickerContainer', 'phrase');

  window.getAddPageSelectedLabels = function() {
    const chips = document.getElementById('wordLabelPickerContainer-chips');
    return chips ? [...chips.querySelectorAll('.label-pick-btn.active')].map(b => b.dataset.lid) : [];
  };
  window.getAddPagePhraseSelectedLabels = function() {
    const chips = document.getElementById('phraseLabelPickerContainer-chips');
    return chips ? [...chips.querySelectorAll('.label-pick-btn.active')].map(b => b.dataset.lid) : [];
  };

  ['wLiteral', 'wTranslation', 'wDefinition', 'wArticle', 'wInfinitive'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.addEventListener('keydown', e => { if (e.key === 'Enter') submitWord(); });
  });
  ['pTranslation', 'pNote'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.addEventListener('keydown', e => { if (e.key === 'Enter') submitPhrase(); });
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
    body.infinitive = document.getElementById('wInfinitive')?.value.trim() || '';
    body.verbGroup = document.getElementById('wVerbGroup')?.value || '';
    const conj = {};
    const langData = currentLangData();
    const pronouns = (langData && langData.pronouns) ? langData.pronouns : ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];
    pronouns.forEach((p, i) => {
      const form = document.getElementById(`conj_${i}`)?.value.trim();
      const tr   = document.getElementById(`conjtr_${i}`)?.value.trim();
      if (form || tr) conj[p] = { form: form || '', translation: tr || '' };
    });
    body.conjugation = conj;
    body.verbConjugationTranslation = document.getElementById('wConjTranslation')?.value.trim() || '';
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

  const btn = document.getElementById('addWordBtn');
  btn.disabled = true;
  try {
    await api('POST', '/api/words', body);
    okEl.textContent = `${t('add_ok_word')} "${literal}"`;
    okEl.classList.remove('hidden');
  
  // Build label pickers
  const lang_ = currentLang();
  const langData_ = currentLangData();
  const allLabels_ = (langData_ && langData_.labels) ? langData_.labels : [];

  function buildAddPageLabelPicker(containerId, trackKey) {
    const container = document.getElementById(containerId);
    if (!container || !allLabels_.length) return;
    container.innerHTML =
      '<div style="margin-bottom:14px">' +
        '<label style="font-size:.88rem;font-weight:600;color:var(--text-muted)">' + t('labels_assign') + ' <span class="optional">' + t('common_optional') + '</span></label>' +
        '<div id="' + containerId + '-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">' +
          allLabels_.map(lb =>
            '<button type="button" class="label-pick-btn" data-lid="' + lb.id + '"' +
            ' style="padding:3px 10px;border-radius:12px;font-size:.78rem;cursor:pointer;background:transparent;border:1.5px solid ' + lb.color + ';color:' + lb.color + ';transition:.15s"' +
            ' onclick="this.classList.toggle(\'active\');this.style.background=this.classList.contains(\'active\')?\'' + lb.color + '33\':\'transparent\'">' + lb.name + '</button>'
          ).join('') +
        '</div>' +
      '</div>';
  }

  buildAddPageLabelPicker('wordLabelPickerContainer', 'word');
  buildAddPageLabelPicker('phraseLabelPickerContainer', 'phrase');

  window.getAddPageSelectedLabels = function() {
    const chips = document.getElementById('wordLabelPickerContainer-chips');
    return chips ? [...chips.querySelectorAll('.label-pick-btn.active')].map(b => b.dataset.lid) : [];
  };
  window.getAddPagePhraseSelectedLabels = function() {
    const chips = document.getElementById('phraseLabelPickerContainer-chips');
    return chips ? [...chips.querySelectorAll('.label-pick-btn.active')].map(b => b.dataset.lid) : [];
  };

  ['wLiteral', 'wTranslation', 'wDefinition', 'wArticle', 'wInfinitive'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.querySelectorAll('[id^="conj_"],[id^="conjtr_"]').forEach(el => el.value = '');
    document.querySelectorAll('[id^="decl_"]').forEach(el => el.value = '');
    const vgEl = document.getElementById('wVerbGroup');
    if (vgEl) vgEl.value = '';
    document.getElementById('wLiteral')?.focus();
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

  const btn = document.getElementById('addPhraseBtn');
  btn.disabled = true;
  try {
    await api('POST', '/api/phrases', { lang, text, translation, helpNote });
    okEl.textContent = t('add_ok_phrase');
    okEl.classList.remove('hidden');
    document.getElementById('pText').value = '';
    document.getElementById('pTranslation').value = '';
    document.getElementById('pNote').value = '';
    document.getElementById('pText').focus();
    setTimeout(() => okEl.classList.add('hidden'), 8000);
  } catch (e) {
    errEl.textContent = e.error || t('common_error'); errEl.classList.remove('hidden');
  }
  btn.disabled = false;
};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
