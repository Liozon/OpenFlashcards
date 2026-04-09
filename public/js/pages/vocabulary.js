// Client-side max progress formula (mirrors server)
function phraseMaxProgressClient(text) {
  const minProgressValue = 50;
  const maxProgressValue = 200;
  const wordCountCoefficient = 10; // Increase to make longer words/phrases harder; decrease to flatten the curve
  const lengthCoefficient = 8; // Increase to make longer words/phrases harder; decrease to flatten the curve
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const avgWordLength = wordCount > 0 ? words.reduce((sum, word) => sum + word.length, 0) / wordCount : 0;

  const score = minProgressValue +
    wordCount * wordCountCoefficient +
    avgWordLength * lengthCoefficient;

  return Math.max(minProgressValue, Math.min(maxProgressValue, Math.round(score)));
}

function wordMaxProgressClient(literal, infinitive) {
  const minProgressValue = 50;
  const maxProgressValue = 200;
  const coefficient = 5; // Increase to make longer words/phrases harder; decrease to flatten the curve
  const str = (infinitive && infinitive && infinitive.trim()) ? infinitive.trim() : (literal || '');
  const n = str.length;
  return Math.max(minProgressValue, Math.min(maxProgressValue, Math.round(minProgressValue + Math.sqrt(n) * coefficient)));
}


// Normalize a conjugation entry: old string format → new object format
function normConj(entry) {
  if (!entry) return { form: '', translation: '' };
  if (typeof entry === 'string') return { form: entry, translation: '' };
  return { form: entry.form || '', translation: entry.translation || '' };
}

// pages/vocabulary.js
'use strict';

let _vocabWords = [];
let _vocabPhrases = [];
let _vocabFilter = '';
let _vocabSearch = '';
let _vocabLabel = '';   // filter by label id

async function renderVocabulary(el) {
  const lang = currentLang();
  if (!lang) { navigate('settings'); return; }

  el.innerHTML = `
    <div class="page-title">${t('vocab_title')}</div>
    <div class="vocab-controls">
      <input type="search" id="vocabSearch" class="search-input" placeholder="${t('vocab_search')}">
      <div class="type-filter" id="vocabFilter">
        <button class="type-btn active" data-type="">${t('vocab_all')}</button>
        <button class="type-btn" data-type="noun">${t('vocab_nouns')}</button>
        <button class="type-btn" data-type="verb">${t('vocab_verbs')}</button>
        <button class="type-btn" data-type="adjective">${t('vocab_adj')}</button>
        <button class="type-btn" data-type="adverb">${t('vocab_adv')}</button>
        <button class="type-btn" data-type="phrase">${t('vocab_phrases')}</button>
      </div>
      <div id="labelFilterRow" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center"></div>
    </div>
    <div id="vocabGrid" class="word-grid"></div>
    <div id="vocabEmpty" class="hidden" style="text-align:center;padding:60px 20px;color:var(--text-muted)">
      <p style="font-size:2rem">📭</p>
      <p>${t('vocab_empty')}</p>
      <button class="btn btn-primary" style="margin-top:16px" onclick="navigate('add')">${t('vocab_add_first')}</button>
    </div>`;

  _vocabFilter = '';
  _vocabSearch = '';
  _vocabLabel = '';

  document.getElementById('vocabFilter').querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#vocabFilter .type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _vocabFilter = btn.dataset.type;
      renderVocabGrid();
    });
  });

  document.getElementById('vocabSearch').addEventListener('input', e => {
    _vocabSearch = e.target.value.trim().toLowerCase();
    renderVocabGrid();
  });

  document.getElementById('vocabGrid').innerHTML = '<div class="loading-state" style="grid-column:1/-1"><div class="spinner"></div></div>';
  try {
    [_vocabWords, _vocabPhrases] = await Promise.all([
      api('GET', '/api/words?lang=' + encodeURIComponent(lang)),
      api('GET', '/api/phrases?lang=' + encodeURIComponent(lang))
    ]);
    renderLabelFilterRow();
    renderVocabGrid();
  } catch {
    document.getElementById('vocabGrid').innerHTML = '<p style="color:var(--danger)">Failed to load vocabulary.</p>';
  }
}

function renderLabelFilterRow() {
  const lang = currentLang();
  const langData = (App.config.targetLangs || []).find(l => l.isoCode === lang) || {};
  const labels = langData.labels || [];
  const row = document.getElementById('labelFilterRow');
  if (!row) return;
  if (!labels.length) { row.innerHTML = ''; return; }

  row.innerHTML =
    `<span style="font-size:.78rem;color:var(--text-faint)">${t('labels_filter')}:</span>` +
    `<button class="label-chip active" data-lid="" style="background:var(--surface-2)">${t('vocab_all')}</button>` +
    labels.map(lb =>
      `<button class="label-chip" data-lid="${esc(lb.id)}" style="background:${esc(lb.color)}20;border-color:${esc(lb.color)};color:${esc(lb.color)}">${esc(lb.name)}</button>`
    ).join('');

  row.querySelectorAll('.label-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      row.querySelectorAll('.label-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _vocabLabel = btn.dataset.lid;
      renderVocabGrid();
    });
  });
}

function renderVocabGrid() {
  const grid = document.getElementById('vocabGrid');
  const empty = document.getElementById('vocabEmpty');
  if (!grid) return;

  const showPhrases = !_vocabFilter || _vocabFilter === 'phrase';
  const showWords = !_vocabFilter || _vocabFilter !== 'phrase';

  let items = [];
  if (showWords) {
    items = items.concat(_vocabWords.filter(w => {
      const matchType = !_vocabFilter || w.type === _vocabFilter;
      const matchSearch = !_vocabSearch ||
        w.literal.toLowerCase().includes(_vocabSearch) ||
        w.translation.toLowerCase().includes(_vocabSearch) ||
        (w.definition || '').toLowerCase().includes(_vocabSearch);
      const matchLabel = !_vocabLabel || (w.labels || []).includes(_vocabLabel);
      return matchType && matchSearch && matchLabel;
    }).map(w => ({ ...w, _kind: 'word' })));
  }
  if (showPhrases) {
    items = items.concat(_vocabPhrases.filter(p =>
      (!_vocabSearch ||
        p.text.toLowerCase().includes(_vocabSearch) ||
        p.translation.toLowerCase().includes(_vocabSearch)) &&
      (!_vocabLabel || (p.labels || []).includes(_vocabLabel))
    ).map(p => ({ ...p, _kind: 'phrase' })));
  }

  if (!items.length) {
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  grid.classList.remove('hidden');

  // Build DOM directly to keep TTS buttons alive
  grid.innerHTML = '';
  items.forEach(item => {
    const cardEl = item._kind === 'word' ? buildWordCard(item) : buildPhraseCard(item);
    grid.appendChild(cardEl);
  });
}

function getLabels() {
  const lang = currentLang();
  const langData = (App.config.targetLangs || []).find(l => l.isoCode === lang) || {};
  return langData.labels || [];
}

function buildWordCard(w) {
  const labels = { noun: t('vocab_noun'), verb: t('vocab_verb'), adjective: t('vocab_adjective'), adverb: t('vocab_adverb') };
  const display = (w.article ? w.article + ' ' : '') + (w.type === 'verb' && w.infinitive ? w.infinitive : w.literal);
  const progress = w.progress || 0;
  const maxProg = w.maxProgress || wordMaxProgressClient(w.literal, w.infinitive);
  const mastered = progress >= maxProg;
  const diffPct = Math.round((progress / maxProg) * 100);
  const allLabels = getLabels();
  const wordLabelIds = w.labels || [];

  const div = document.createElement('div');
  div.className = 'word-card';
  div.id = 'wc-' + w.id;

  // Label chips
  const labelHtml = wordLabelIds.length
    ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">' +
    wordLabelIds.map(lid => {
      const lb = allLabels.find(l => l.id === lid);
      return lb
        ? `<span style="font-size:.72rem;padding:2px 7px;border-radius:10px;background:${esc(lb.color)}20;border:1px solid ${esc(lb.color)};color:${esc(lb.color)}">${esc(lb.name)}</span>`
        : '';
    }).join('') +
    '</div>'
    : '';

  div.innerHTML =
    '<div class="word-card-header">' +
    '<div>' +
    '<span class="badge badge-' + w.type + '">' + (labels[w.type] || w.type) + '</span>' +

    '</div>' +
    '<div class="word-actions">' +
    '<span id="tts-' + w.id + '"></span>' +
    '<button class="btn btn-sm btn-secondary" onclick="editWord(\'' + w.id + '\',\'' + w.langCode + '\')" title="' + t('vocab_edit') + '">✏️</button>' +
    '<button class="btn btn-sm btn-danger"    onclick="deleteWord(\'' + w.id + '\',\'' + w.langCode + '\')" title="' + t('vocab_delete') + '">🗑</button>' +
    '</div>' +
    '</div>' +
    '<div class="word-literal">' + esc(display) + '</div>' +
    '<div class="word-trans">' + esc(w.translation) + '</div>' +
    (w.definition ? '<div class="word-def">' + esc(w.definition) + '</div>' : '') +
    (mastered
      ? '<div class="mastered-badge">' + t('vocab_mastered') + '</div>'
      : '<div class="progress-bar-wrap" title="' + progress + ' / ' + maxProg + '">' +
      '<div class="progress-bar-fill" style="width:' + diffPct + '%"></div>' +
      '</div>') +
    (w.verbGroup ? '<div style="font-size:.78rem;color:var(--text-faint);margin-top:4px">📚 ' + esc(w.verbGroup) + '</div>' : '') +
    (w.type !== 'verb' && w.declensions && Object.keys(w.declensions).length ? '<div style="font-size:.78rem;color:var(--text-faint);margin-top:2px">📐 ' + Object.keys(w.declensions).length + ' case(s)</div>' : '') +
    labelHtml;

  // TTS button via DOM to avoid HTML injection issues
  const ttsSlot = div.querySelector('#tts-' + w.id);
  if (ttsSlot) ttsSlot.replaceWith(TTS.button(display, w.langCode));

  return div;
}

function buildPhraseCard(p) {
  const allLabels = getLabels();
  const phraseLabelIds = p.labels || [];

  const div = document.createElement('div');
  div.className = 'word-card';
  div.id = 'pc-' + p.id;

  const labelHtml = phraseLabelIds.length
    ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">' +
    phraseLabelIds.map(lid => {
      const lb = allLabels.find(l => l.id === lid);
      return lb
        ? `<span style="font-size:.72rem;padding:2px 7px;border-radius:10px;background:${esc(lb.color)}20;border:1px solid ${esc(lb.color)};color:${esc(lb.color)}">${esc(lb.name)}</span>`
        : '';
    }).join('') +
    '</div>'
    : '';

  div.innerHTML =
    '<div class="word-card-header">' +
    '<span class="badge badge-phrase">💬 ' + t('vocab_phrase') + '</span>' +
    '<div class="word-actions">' +
    '<span id="ptts-' + p.id + '"></span>' +
    '<button class="btn btn-sm btn-secondary" onclick="editPhrase(\'' + p.id + '\',\'' + p.langCode + '\')" title="' + t('vocab_edit') + '">✏️</button>' +
    '<button class="btn btn-sm btn-danger"    onclick="deletePhrase(\'' + p.id + '\',\'' + p.langCode + '\')" title="' + t('vocab_delete') + '">🗑</button>' +
    '</div>' +
    '</div>' +
    '<div class="word-literal" style="font-size:1rem">' + esc(p.text) + '</div>' +
    '<div class="word-trans">' + esc(p.translation) + '</div>' +
    (p.helpNote ? '<div class="word-def">' + esc(p.helpNote) + '</div>' : '') +
    ((() => {
      const pProg = p.progress || 0;
      const pMax = p.maxProgress || phraseMaxProgressClient(p.text);
      const pMast = pProg >= pMax;
      const pPct = Math.round((pProg / pMax) * 100);
      return pMast
        ? '<div class="mastered-badge">' + t('vocab_mastered') + '</div>'
        : '<div class="progress-bar-wrap" title="' + pProg + ' / ' + pMax + '">' +
        '<div class="progress-bar-fill" style="width:' + pPct + '%"></div>' +
        '</div>';
    })()) +
    labelHtml;

  const ttsSlot = div.querySelector('#ptts-' + p.id);
  if (ttsSlot) ttsSlot.replaceWith(TTS.button(p.text, p.langCode));

  return div;
}

// ── Label picker widget ────────────────────────────────────────────────────────
function buildLabelPicker(selectedIds, containerId) {
  const lang = currentLang();
  const allLabels = getLabels();

  return `<div id="${containerId}" style="margin-bottom:14px">
    <label style="font-size:.88rem;font-weight:600;color:var(--text-muted)">${t('labels_assign')} <span class="optional">${t('common_optional')}</span></label>
    <div id="${containerId}-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;min-height:28px">
      ${allLabels.map(lb => {
    const active = selectedIds.includes(lb.id);
    return `<button type="button" class="label-pick-btn ${active ? 'active' : ''}"
          data-lid="${esc(lb.id)}"
          style="padding:3px 10px;border-radius:12px;font-size:.78rem;cursor:pointer;
            background:${active ? esc(lb.color) + '33' : 'transparent'};
            border:1.5px solid ${esc(lb.color)};color:${esc(lb.color)};transition:.15s"
          onclick="toggleLabelPick(this,'${containerId}-chips')">${esc(lb.name)}</button>`;
  }).join('')}
      <button type="button" class="btn btn-sm btn-secondary"
        style="padding:2px 8px;font-size:.75rem"
        onclick="showCreateLabelInline('${containerId}-chips','${lang}')">${t('labels_create_new')}</button>
    </div>
  </div>`;
}

window.toggleLabelPick = function (btn, chipsId) {
  btn.classList.toggle('active');
  const lb_color = btn.style.color;
  if (btn.classList.contains('active')) {
    btn.style.background = lb_color + '33';
  } else {
    btn.style.background = 'transparent';
  }
};

window.showCreateLabelInline = function (chipsId, lang) {
  const chips = document.getElementById(chipsId);
  if (!chips) return;
  // Don't add duplicates
  if (chips.querySelector('.new-label-input')) return;

  const COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e91e63'];
  let colorIdx = 0;

  const wrapper = document.createElement('div');
  wrapper.className = 'new-label-input';
  wrapper.style.cssText = 'display:flex;gap:4px;align-items:center;margin-top:4px;width:100%';
  wrapper.innerHTML =
    `<input type="text" placeholder="${t('labels_add_ph')}" style="flex:1;padding:4px 8px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text);font-size:.82rem" id="newLabelNameInline">` +
    `<button type="button" id="newLabelColorBtn" style="width:22px;height:22px;border-radius:50%;border:2px solid var(--border);cursor:pointer;background:${COLORS[0]};flex-shrink:0" title="Pick color"></button>` +
    `<button type="button" class="btn btn-sm btn-primary" style="padding:3px 8px;font-size:.78rem" onclick="confirmCreateLabelInline('${chipsId}','${lang}')">✓</button>` +
    `<button type="button" class="btn btn-sm btn-secondary" style="padding:3px 8px;font-size:.78rem" onclick="this.closest('.new-label-input').remove()">✕</button>`;

  chips.appendChild(wrapper);

  const colorBtn = wrapper.querySelector('#newLabelColorBtn');
  colorBtn.addEventListener('click', () => {
    colorIdx = (colorIdx + 1) % COLORS.length;
    colorBtn.style.background = COLORS[colorIdx];
    colorBtn._color = COLORS[colorIdx];
  });
  colorBtn._color = COLORS[0];
  colorBtn._colors = COLORS;

  wrapper.querySelector('#newLabelNameInline').focus();
};

window.confirmCreateLabelInline = async function (chipsId, lang) {
  const chips = document.getElementById(chipsId);
  const wrapper = chips && chips.querySelector('.new-label-input');
  if (!wrapper) return;
  const nameEl = wrapper.querySelector('#newLabelNameInline');
  const colorBtn = wrapper.querySelector('#newLabelColorBtn');
  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) return;
  const color = colorBtn ? (colorBtn._color || '#6c757d') : '#6c757d';
  try {
    const result = await api('POST', '/api/labels', { lang, name, color });
    await loadConfig();
    // Add button to chips
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'label-pick-btn active';
    btn.dataset.lid = result.label.id;
    btn.style.cssText = `padding:3px 10px;border-radius:12px;font-size:.78rem;cursor:pointer;background:${color}33;border:1.5px solid ${color};color:${color};transition:.15s`;
    btn.textContent = name;
    btn.onclick = function () { window.toggleLabelPick(this, chipsId); };
    chips.insertBefore(btn, wrapper);
    wrapper.remove();
  } catch (e) {
    toast(e.error || t('common_error'), 'danger');
  }
};

function getSelectedLabels(chipsId) {
  const chips = document.getElementById(chipsId);
  if (!chips) return [];
  return [...chips.querySelectorAll('.label-pick-btn.active')].map(b => b.dataset.lid).filter(Boolean);
}

// ── Edit word ──────────────────────────────────────────────────────────────────
window.editWord = function (id, lang) {
  const w = _vocabWords.find(x => x.id === id);
  if (!w) return;
  const isVerb = w.type === 'verb';
  const isNoun = w.type === 'noun';

  const langData = (App.config.targetLangs || []).find(l => l.isoCode === lang) || {};
  const declensions = langData.declensions || [];
  const verbGroups = langData.verbGroups || [];
  const existingDecl = w.declensions || {};
  const existingConj = w.conjugation || {};
  const nativeLang = App.config.nativeLang || 'en';

  const vgHtml = (isVerb && verbGroups.length)
    ? `<div class="field-group">
        <label>${t('add_verb_group')} <span class="optional">(optional)</span></label>
        <select id="meVerbGroup" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)">
          <option value="">— —</option>
          ${verbGroups.map(g => `<option value="${esc(g.name)}" ${(w.verbGroup || '') === (g.name) ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
        </select>
      </div>` : '';

  // Conjugation section for verbs — per-pronoun form + translation
  const pronounKeys = Object.keys(existingConj);
  const conjHtml = isVerb && pronounKeys.length
    ? `<details style="margin-bottom:14px">
        <summary style="cursor:pointer;font-weight:600;font-size:.9rem;color:var(--text-muted);margin-bottom:8px">
          ${t('add_conjugation')} <span style="font-size:.8rem;font-weight:400">(optional)</span>
        </summary>
        <div style="font-size:.75rem;color:var(--text-faint);margin-bottom:6px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:0 2px">
          <span style="font-weight:600">${t('add_conj_pronoun')}</span>
          <span>${t('add_conj_form')}</span>
          <span>${t('add_conj_translation_ph')}</span>
        </div>
        ${pronounKeys.map(p => {
      const e = normConj(existingConj[p]);
      return `<div class="field-group" style="margin-bottom:6px">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;align-items:center">
              <label style="font-size:.82rem;font-weight:600;margin:0">${esc(p)}</label>
              <input type="text" id="meConj_${esc(p)}" value="${esc(e.form)}" autocomplete="off" placeholder="…" style="padding:6px 8px">
              <input type="text" id="meCT_${esc(p)}" value="${esc(e.translation)}" autocomplete="off" placeholder="${t('add_conj_translation_ph')}" style="padding:6px 8px;font-size:.82rem;color:var(--text-muted)">
            </div>
          </div>`;
    }).join('')}
      </details>` : '';

  // Declensions only for non-verbs
  const declHtml = !isVerb && declensions.length
    ? `<details style="margin-bottom:14px">
        <summary style="cursor:pointer;font-weight:600;font-size:.9rem;color:var(--text-muted);margin-bottom:8px">
          ${t('add_declensions')} <span style="font-size:.8rem;font-weight:400">(optional)</span>
        </summary>
        ${declensions.map((d, i) => `
          <div class="field-group" style="margin-bottom:8px">
            <label style="font-size:.85rem">${esc(d.nativeName)}${d.targetName ? ' <span style="color:var(--text-faint)">/ ' + esc(d.targetName) + '</span>' : ''}</label>
            <input type="text" id="meDecl_${i}" value="${esc((existingDecl[i] || {}).value || '')}" autocomplete="off" placeholder="…">
          </div>`).join('')}
      </details>` : '';

  const labelPickerHtml = buildLabelPicker(w.labels || [], 'meLabelPicker');

  openModal(t('vocab_edit_word'), `
    ${isNoun ? `<div class="field-group"><label>${t('vocab_article')}</label><input id="meArticle" value="${esc(w.article || '')}"></div>` : ''}
    ${isVerb ? `<div class="field-group"><label>${t('vocab_infinitive')}</label><input id="meInfinitive" value="${esc(w.infinitive || '')}"></div>` : ''}
    ${vgHtml}
    <div class="field-group"><label>${t('vocab_word')} (Nominative) <span class="required">*</span></label><input id="meLiteral" value="${esc(w.literal)}"></div>
    ${conjHtml}
    ${declHtml}
    <div class="field-group"><label>${t('vocab_translation')} <span class="required">*</span></label><input id="meTranslation" value="${esc(w.translation)}"></div>
    <div class="field-group"><label>${t('vocab_definition')} <span class="optional">(optional)</span></label><input id="meDefinition" value="${esc(w.definition || '')}"></div>
    ${labelPickerHtml}
    <div id="meErr" class="alert alert-danger hidden"></div>`,
    `<button class="btn btn-secondary btn-sm" style="color:var(--danger);border-color:var(--danger);margin-right:auto" onclick="resetWordProgress('${id}','${lang}')">↺ ${t('vocab_reset_progress')}</button>
     <button class="btn btn-secondary" onclick="closeModal()">${t('vocab_cancel')}</button>
     <button class="btn btn-primary" onclick="saveWordEdit('${id}','${lang}')">${t('vocab_save')}</button>`
  );
};

window.saveWordEdit = async function (id, lang) {
  const literalEl = document.getElementById('meLiteral');
  const newLiteral = literalEl ? literalEl.value.trim() : null;
  if (!newLiteral) {
    document.getElementById('meErr').textContent = t('add_err_word');
    document.getElementById('meErr').classList.remove('hidden');
    return;
  }

  const body = {
    literal: newLiteral,
    translation: document.getElementById('meTranslation').value.trim(),
    definition: document.getElementById('meDefinition')?.value?.trim() || '',
    labels: getSelectedLabels('meLabelPicker-chips')
  };
  const artEl = document.getElementById('meArticle');
  const infEl = document.getElementById('meInfinitive');
  const vgEl = document.getElementById('meVerbGroup');
  const conjTrEl = document.getElementById('meConjTranslation');
  if (artEl) body.article = artEl.value.trim();
  if (infEl) body.infinitive = infEl.value.trim();
  if (vgEl) body.verbGroup = vgEl.value;
  if (conjTrEl) body.verbConjugationTranslation = conjTrEl.value.trim();

  // Collect conjugation edits (per-pronoun form + translation)
  const w = _vocabWords.find(x => x.id === id);
  if (w && w.conjugation) {
    const conj = {};
    Object.keys(w.conjugation).forEach(p => {
      const formEl = document.getElementById('meConj_' + p);
      const trEl = document.getElementById('meCT_' + p);
      const form = formEl ? formEl.value.trim() : normConj(w.conjugation[p]).form;
      const tr = trEl ? trEl.value.trim() : normConj(w.conjugation[p]).translation;
      if (form || tr) conj[p] = { form, translation: tr };
    });
    body.conjugation = conj;
  }

  // Collect declensions
  const langData = (App.config.targetLangs || []).find(l => l.isoCode === lang) || {};
  const declensions = langData.declensions || [];
  if (declensions.length && w && w.type !== 'verb') {
    const declObj = {};
    declensions.forEach((d, i) => {
      const val = document.getElementById(`meDecl_${i}`)?.value?.trim();
      if (val) declObj[i] = { nativeName: d.nativeName, targetName: d.targetName, value: val };
    });
    body.declensions = declObj;
  }

  if (!body.translation) {
    document.getElementById('meErr').textContent = t('add_err_word');
    document.getElementById('meErr').classList.remove('hidden');
    return;
  }
  try {
    await api('PUT', `/api/words/${id}?lang=${encodeURIComponent(lang)}`, body);
    closeModal();
    toast(t('vocab_updated'));
    const idx = _vocabWords.findIndex(x => x.id === id);
    if (idx !== -1) { _vocabWords[idx] = { ..._vocabWords[idx], ...body }; renderVocabGrid(); }
  } catch (e) {
    document.getElementById('meErr').textContent = e.error || 'Failed to save.';
    document.getElementById('meErr').classList.remove('hidden');
  }
};


window.resetWordProgress = async function (id, lang) {
  try {
    await api('PUT', `/api/words/${id}?lang=${encodeURIComponent(lang)}`, { progress: 0 });
    closeModal();
    toast(t('vocab_progress_reset'));
    const idx = _vocabWords.findIndex(x => x.id === id);
    if (idx !== -1) { _vocabWords[idx].progress = 0; renderVocabGrid(); }
  } catch (e) { toast(e.error || t('common_error'), 'danger'); }
};

window.deleteWord = async function (id, lang) {
  if (!confirm('Delete this word?')) return;
  try {
    await api('DELETE', `/api/words/${id}?lang=${encodeURIComponent(lang)}`);
    _vocabWords = _vocabWords.filter(w => w.id !== id);
    renderVocabGrid();
    toast(t('vocab_deleted'));
  } catch (e) { toast(e.error || 'Failed to delete.', 'danger'); }
};

window.editPhrase = function (id, lang) {
  const p = _vocabPhrases.find(x => x.id === id);
  if (!p) return;
  const labelPickerHtml = buildLabelPicker(p.labels || [], 'mePLabelPicker');
  openModal(t('vocab_edit_phrase'), `
    <div class="field-group"><label>${t('vocab_phrase_target')} <span class="required">*</span></label>
      <textarea id="mePText">${esc(p.text)}</textarea></div>
    <div class="field-group"><label>${t('vocab_translation')} <span class="required">*</span></label>
      <input id="mePTrans" value="${esc(p.translation)}"></div>
    <div class="field-group"><label>${t('vocab_note')} <span class="optional">(optional)</span></label>
      <input id="mePNote" value="${esc(p.helpNote || '')}"></div>
    ${labelPickerHtml}
    <div id="mePErr" class="alert alert-danger hidden"></div>`,
    `<button class="btn btn-secondary btn-sm" style="color:var(--danger);border-color:var(--danger);margin-right:auto" onclick="resetPhraseProgress('${id}','${lang}')">↺ ${t('vocab_reset_progress')}</button>
     <button class="btn btn-secondary" onclick="closeModal()">${t('vocab_cancel')}</button>
     <button class="btn btn-primary" onclick="savePhraseEdit('${id}','${lang}')">${t('vocab_save')}</button>`
  );
};

window.savePhraseEdit = async function (id, lang) {
  const body = {
    text: document.getElementById('mePText').value.trim(),
    translation: document.getElementById('mePTrans').value.trim(),
    helpNote: document.getElementById('mePNote').value.trim(),
    labels: getSelectedLabels('mePLabelPicker-chips')
  };
  if (!body.text || !body.translation) {
    document.getElementById('mePErr').textContent = t('add_err_phrase');
    document.getElementById('mePErr').classList.remove('hidden');
    return;
  }
  try {
    await api('PUT', `/api/phrases/${id}?lang=${encodeURIComponent(lang)}`, body);
    closeModal();
    toast(t('vocab_phrase_updated'));
    const idx = _vocabPhrases.findIndex(p => p.id === id);
    if (idx !== -1) { _vocabPhrases[idx] = { ..._vocabPhrases[idx], ...body }; renderVocabGrid(); }
  } catch (e) {
    document.getElementById('mePErr').textContent = e.error || 'Failed to save.';
    document.getElementById('mePErr').classList.remove('hidden');
  }
};


window.resetPhraseProgress = async function (id, lang) {
  try {
    await api('PUT', `/api/phrases/${id}?lang=${encodeURIComponent(lang)}`, { progress: 0 });
    closeModal();
    toast(t('vocab_progress_reset'));
    const idx = _vocabPhrases.findIndex(x => x.id === id);
    if (idx !== -1) { _vocabPhrases[idx].progress = 0; renderVocabGrid(); }
  } catch (e) { toast(e.error || t('common_error'), 'danger'); }
};

window.deletePhrase = async function (id, lang) {
  if (!confirm('Delete this phrase?')) return;
  try {
    await api('DELETE', `/api/phrases/${id}?lang=${encodeURIComponent(lang)}`);
    _vocabPhrases = _vocabPhrases.filter(p => p.id !== id);
    renderVocabGrid();
    toast(t('vocab_deleted'));
  } catch (e) { toast(e.error || 'Failed to delete.', 'danger'); }
};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
