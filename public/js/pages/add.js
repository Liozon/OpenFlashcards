// pages/add.js
'use strict';

function renderAdd(el) {
  const lang = currentLang();
  if (!lang) { navigate('settings'); return; }

  const langData = currentLangData();
  const pronouns = (langData && langData.pronouns) ? langData.pronouns
    : ['1sg','2sg','3sg','1pl','2pl','3pl'];

  el.innerHTML = `
    <div class="page-title">➕ Add</div>
    <div class="add-tabs">
      <button class="add-tab active" data-tab="word" onclick="switchAddTab('word',this)">📝 Word</button>
      <button class="add-tab"        data-tab="phrase" onclick="switchAddTab('phrase',this)">💬 Phrase</button>
    </div>

    <!-- WORD FORM -->
    <div id="tabWord">
      <div class="type-selector" id="wordTypeSelector">
        <button class="type-btn active" data-type="noun"      onclick="selectWordType('noun',this)">📦 Noun</button>
        <button class="type-btn"        data-type="verb"       onclick="selectWordType('verb',this)">⚡ Verb</button>
        <button class="type-btn"        data-type="adjective"  onclick="selectWordType('adjective',this)">🎨 Adjective</button>
        <button class="type-btn"        data-type="adverb"     onclick="selectWordType('adverb',this)">💨 Adverb</button>
      </div>

      <div class="card">
        <div id="nounExtras" class="field-group">
          <label>${t('add_article')} <span class="optional">${t('vocab_optional')}</span></label>
          <input type="text" id="wArticle" placeholder="le, la, der, the…" autocomplete="off">
        </div>
        <div id="verbExtras" class="hidden">
          <div class="field-group">
            <label>${t('add_infinitive')} <span class="optional">${t('vocab_optional')}</span></label>
            <input type="text" id="wInfinitive" placeholder="aller, sein, to go…" autocomplete="off">
          </div>
          <details style="margin-bottom:16px">
            <summary style="cursor:pointer;font-weight:600;font-size:.9rem;color:var(--text-muted);margin-bottom:8px">
              Conjugation <span class="optional">(optional)</span>
            </summary>
            <div class="conjugation-grid" id="conjGrid"></div>
          </details>
        </div>

        <div class="field-group">
          <label>${t('add_word_label')} <strong>${langData ? (langData.flag||'') + ' ' + langData.name : lang}</strong> <span class="required">*</span></label>
          <input type="text" id="wLiteral" autocomplete="off" placeholder="${t('add_word_ph')}">
        </div>
        <div class="field-group">
          <label>${t('add_translation')} <span class="required">*</span></label>
          <input type="text" id="wTranslation" autocomplete="off" placeholder="${t('add_translation_ph')}">
        </div>
        <div class="field-group">
          <label>Definition <span class="optional">(optional)</span></label>
          <input type="text" id="wDefinition" autocomplete="off" placeholder="${t('add_definition_ph')}">
        </div>
        <div id="wordAddErr" class="alert alert-danger hidden"></div>
        <div id="wordAddOk"  class="alert alert-success hidden"></div>
        <button class="btn btn-primary btn-full" id="addWordBtn" onclick="submitWord()">
          ${t('add_btn_word')}
        </button>
      </div>
    </div>

    <!-- PHRASE FORM -->
    <div id="tabPhrase" class="hidden">
      <div class="card">
        <div class="field-group">
          <label>Phrase in <strong>${langData ? (langData.flag||'') + ' ' + langData.name : lang}</strong> <span class="required">*</span></label>
          <textarea id="pText" placeholder="${t('add_phrase_ph')}" rows="3"></textarea>
        </div>
        <div class="field-group">
          <label>Translation <span class="required">*</span></label>
          <input type="text" id="pTranslation" autocomplete="off" placeholder="${t('add_translation_ph')}">
        </div>
        <div class="field-group">
          <label>Note <span class="optional">(optional)</span></label>
          <input type="text" id="pNote" autocomplete="off" placeholder="Context or memory aid…">
        </div>
        <div id="phraseAddErr" class="alert alert-danger hidden"></div>
        <div id="phraseAddOk"  class="alert alert-success hidden"></div>
        <button class="btn btn-primary btn-full" id="addPhraseBtn" onclick="submitPhrase()">
          ${t('add_btn_phrase')}
        </button>
      </div>
    </div>`;

  // Build conjugation grid
  const conjGrid = document.getElementById('conjGrid');
  pronouns.forEach((p, i) => {
    conjGrid.innerHTML += `
      <div class="conj-item field-group">
        <label>${p}</label>
        <input type="text" id="conj_${i}" autocomplete="off" placeholder="…">
      </div>`;
  });

  // Enter key submits
  ['wLiteral','wTranslation','wDefinition','wArticle','wInfinitive'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.addEventListener('keydown', e => { if (e.key === 'Enter') submitWord(); });
  });
  ['pTranslation','pNote'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.addEventListener('keydown', e => { if (e.key === 'Enter') submitPhrase(); });
  });
}

window._addWordType = 'noun';

window.selectWordType = function(type, btn) {
  window._addWordType = type;
  document.querySelectorAll('#wordTypeSelector .type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('nounExtras').classList.toggle('hidden', type !== 'noun');
  document.getElementById('verbExtras').classList.toggle('hidden', type !== 'verb');
};

window.switchAddTab = function(tab, btn) {
  document.querySelectorAll('.add-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tabWord').classList.toggle('hidden',   tab !== 'word');
  document.getElementById('tabPhrase').classList.toggle('hidden', tab !== 'phrase');
};

window.submitWord = async function() {
  const lang = currentLang();
  const type = window._addWordType;

  const literal     = document.getElementById('wLiteral')?.value.trim();
  const translation = document.getElementById('wTranslation')?.value.trim();
  const definition  = document.getElementById('wDefinition')?.value.trim();
  const errEl = document.getElementById('wordAddErr');
  const okEl  = document.getElementById('wordAddOk');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  if (!literal || !translation) {
    errEl.textContent = t('add_err_word');
    errEl.classList.remove('hidden');
    return;
  }

  const body = { lang, type, literal, translation, definition };
  if (type === 'noun') body.article = document.getElementById('wArticle')?.value.trim() || '';
  if (type === 'verb') {
    body.infinitive = document.getElementById('wInfinitive')?.value.trim() || '';
    const conj = {};
    const langData = currentLangData();
    const pronouns = (langData && langData.pronouns) ? langData.pronouns : ['1sg','2sg','3sg','1pl','2pl','3pl'];
    pronouns.forEach((p, i) => {
      const val = document.getElementById(`conj_${i}`)?.value.trim();
      if (val) conj[p] = val;
    });
    body.conjugation = conj;
  }

  const btn = document.getElementById('addWordBtn');
  btn.disabled = true;
  try {
    await api('POST', '/api/words', body);
    okEl.textContent = `${t('add_ok_word').replace('✓','')} "${literal}" ${t('add_ok_word').includes('!') ? '!' : ''}`;
    okEl.classList.remove('hidden');
    // Reset form
    ['wLiteral','wTranslation','wDefinition','wArticle','wInfinitive'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.querySelectorAll('[id^="conj_"]').forEach(el => el.value = '');
    document.getElementById('wLiteral')?.focus();
    setTimeout(() => okEl.classList.add('hidden'), 3000);
  } catch(e) {
    errEl.textContent = e.error || 'Failed to add word.';
    errEl.classList.remove('hidden');
  }
  btn.disabled = false;
};

window.submitPhrase = async function() {
  const lang        = currentLang();
  const text        = document.getElementById('pText')?.value.trim();
  const translation = document.getElementById('pTranslation')?.value.trim();
  const helpNote    = document.getElementById('pNote')?.value.trim();
  const errEl = document.getElementById('phraseAddErr');
  const okEl  = document.getElementById('phraseAddOk');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  if (!text || !translation) {
    errEl.textContent = t('add_err_phrase');
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('addPhraseBtn');
  btn.disabled = true;
  try {
    await api('POST', '/api/phrases', { lang, text, translation, helpNote });
    okEl.textContent = t('add_ok_phrase');
    okEl.classList.remove('hidden');
    document.getElementById('pText').value        = '';
    document.getElementById('pTranslation').value = '';
    document.getElementById('pNote').value        = '';
    document.getElementById('pText').focus();
    setTimeout(() => okEl.classList.add('hidden'), 3000);
  } catch(e) {
    errEl.textContent = e.error || 'Failed to add phrase.';
    errEl.classList.remove('hidden');
  }
  btn.disabled = false;
};
