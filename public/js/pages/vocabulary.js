// pages/vocabulary.js
'use strict';

let _vocabWords   = [];
let _vocabPhrases = [];
let _vocabFilter  = '';
let _vocabSearch  = '';

async function renderVocabulary(el) {
  const lang = currentLang();
  if (!lang) { navigate('settings'); return; }

  el.innerHTML = `
    <div class="page-title">📚 Vocabulary</div>
    <div class="vocab-controls">
      <input type="search" id="vocabSearch" class="search-input" placeholder="Search…">
      <div class="type-filter" id="vocabFilter">
        <button class="type-btn active" data-type="">All</button>
        <button class="type-btn" data-type="noun">📦 Nouns</button>
        <button class="type-btn" data-type="verb">⚡ Verbs</button>
        <button class="type-btn" data-type="adjective">🎨 Adj.</button>
        <button class="type-btn" data-type="adverb">💨 Adv.</button>
        <button class="type-btn" data-type="phrase">💬 Phrases</button>
      </div>
    </div>
    <div id="vocabGrid" class="word-grid"></div>
    <div id="vocabEmpty" class="hidden" style="text-align:center;padding:60px 20px;color:var(--text-muted)">
      <p style="font-size:2rem">📭</p>
      <p>No entries found.</p>
      <button class="btn btn-primary" style="margin-top:16px" onclick="navigate('add')">➕ Add your first word</button>
    </div>`;

  _vocabFilter = '';
  _vocabSearch = '';

  // Filter buttons
  document.getElementById('vocabFilter').querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#vocabFilter .type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _vocabFilter = btn.dataset.type;
      renderVocabGrid();
    });
  });

  // Search
  document.getElementById('vocabSearch').addEventListener('input', e => {
    _vocabSearch = e.target.value.trim().toLowerCase();
    renderVocabGrid();
  });

  // Load data
  document.getElementById('vocabGrid').innerHTML = '<div class="loading-state" style="grid-column:1/-1"><div class="spinner"></div></div>';
  try {
    [_vocabWords, _vocabPhrases] = await Promise.all([
      api('GET', '/api/words?lang=' + encodeURIComponent(lang)),
      api('GET', '/api/phrases?lang=' + encodeURIComponent(lang))
    ]);
    renderVocabGrid();
  } catch {
    document.getElementById('vocabGrid').innerHTML = '<p style="color:var(--danger)">Failed to load vocabulary.</p>';
  }
}

function renderVocabGrid() {
  const grid  = document.getElementById('vocabGrid');
  const empty = document.getElementById('vocabEmpty');
  if (!grid) return;

  const showPhrases = !_vocabFilter || _vocabFilter === 'phrase';
  const showWords   = !_vocabFilter || _vocabFilter !== 'phrase';

  let items = [];
  if (showWords) {
    items = items.concat(_vocabWords.filter(w => {
      const matchType = !_vocabFilter || w.type === _vocabFilter;
      const matchSearch = !_vocabSearch ||
        w.literal.toLowerCase().includes(_vocabSearch) ||
        w.translation.toLowerCase().includes(_vocabSearch) ||
        (w.definition||'').toLowerCase().includes(_vocabSearch);
      return matchType && matchSearch;
    }).map(w => ({ ...w, _kind: 'word' })));
  }
  if (showPhrases) {
    items = items.concat(_vocabPhrases.filter(p =>
      !_vocabSearch ||
      p.text.toLowerCase().includes(_vocabSearch) ||
      p.translation.toLowerCase().includes(_vocabSearch)
    ).map(p => ({ ...p, _kind: 'phrase' })));
  }

  if (!items.length) {
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  grid.classList.remove('hidden');
  grid.innerHTML = items.map(item =>
    item._kind === 'word' ? buildWordCard(item) : buildPhraseCard(item)
  ).join('');
}

function buildWordCard(w) {
  const labels  = { noun: t('vocab_noun'), verb: t('vocab_verb'), adjective: t('vocab_adjective'), adverb: t('vocab_adverb') };
  const display = (w.article ? w.article + ' ' : '') + (w.type==='verb'&&w.infinitive ? w.infinitive : w.literal);
  const mastered = (w.difficulty||5000) < 1000;
  const diffPct  = Math.max(5, 100 - Math.round((w.difficulty||5000)/100));

  const div = document.createElement('div');
  div.className = 'word-card';
  div.id = 'wc-' + w.id;
  div.innerHTML =
    '<div class="word-card-header">' +
      '<div>' +
        '<span class="badge badge-' + w.type + '">' + (labels[w.type]||w.type) + '</span>' +
        (mastered ? '<span style="margin-left:6px;font-size:.8rem" title="Mastered">⭐</span>' : '') +
      '</div>' +
      '<div class="word-actions">' +
        '<span id="tts-' + w.id + '"></span>' +
        '<button class="btn btn-sm btn-secondary" onclick="editWord(\'' + w.id + '\',\'' + w.langCode + '\')" title="Edit">✏️</button>' +
        '<button class="btn btn-sm btn-danger"    onclick="deleteWord(\'' + w.id + '\',\'' + w.langCode + '\')" title="Delete">🗑</button>' +
      '</div>' +
    '</div>' +
    '<div class="word-literal">' + esc(display) + '</div>' +
    '<div class="word-trans">'   + esc(w.translation) + '</div>' +
    (w.definition ? '<div class="word-def">' + esc(w.definition) + '</div>' : '') +
    '<div class="difficulty-bar"><div class="difficulty-fill" style="width:' + diffPct + '%"></div></div>' +
    (w.verbGroup ? '<div style="font-size:.78rem;color:var(--text-faint);margin-top:4px">📚 ' + esc(w.verbGroup) + '</div>' : '') +
    (w.declensions && Object.keys(w.declensions).length ? '<div style="font-size:.78rem;color:var(--text-faint);margin-top:2px">📐 ' + Object.keys(w.declensions).length + ' declension(s)</div>' : '');

  // Attach TTS button via DOM (avoids HTML injection issues)
  const ttsSlot = div.querySelector('#tts-' + w.id);
  if (ttsSlot) ttsSlot.replaceWith(TTS.button(display, w.langCode));

  return div.outerHTML;
}

function buildPhraseCard(p) {
  const div = document.createElement('div');
  div.className = 'word-card';
  div.id = 'pc-' + p.id;
  div.innerHTML =
    '<div class="word-card-header">' +
      '<span class="badge badge-phrase">💬 ' + t('vocab_phrase') + '</span>' +
      '<div class="word-actions">' +
        '<span id="ptts-' + p.id + '"></span>' +
        '<button class="btn btn-sm btn-secondary" onclick="editPhrase(\'' + p.id + '\',\'' + p.langCode + '\')" title="Edit">✏️</button>' +
        '<button class="btn btn-sm btn-danger"    onclick="deletePhrase(\'' + p.id + '\',\'' + p.langCode + '\')" title="Delete">🗑</button>' +
      '</div>' +
    '</div>' +
    '<div class="word-literal" style="font-size:1rem">' + esc(p.text) + '</div>' +
    '<div class="word-trans">' + esc(p.translation) + '</div>' +
    (p.helpNote ? '<div class="word-def">' + esc(p.helpNote) + '</div>' : '');

  const ttsSlot = div.querySelector('#ptts-' + p.id);
  if (ttsSlot) ttsSlot.replaceWith(TTS.button(p.text, p.langCode));

  return div.outerHTML;
}

window.editWord = function(id, lang) {
  const w = _vocabWords.find(x => x.id === id);
  if (!w) return;
  const isVerb = w.type === 'verb';
  const isNoun = w.type === 'noun';

  const langData    = (App.config.targetLangs || []).find(l => l.isoCode === lang) || {};
  const declensions = langData.declensions || [];
  const verbGroups  = langData.verbGroups  || [];
  const existingDecl = w.declensions || {};

  const vgHtml = (isVerb && verbGroups.length)
    ? `<div class="field-group">
        <label>Verb group <span class="optional">(optional)</span></label>
        <select id="meVerbGroup" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)">
          <option value="">— Select a group —</option>
          ${verbGroups.map(g => `<option value="${esc(g.name)}" ${(w.verbGroup||'')===(g.name)?'selected':''}>${esc(g.name)}</option>`).join('')}
        </select>
      </div>` : '';

  const declHtml = declensions.length
    ? `<details style="margin-bottom:14px">
        <summary style="cursor:pointer;font-weight:600;font-size:.9rem;color:var(--text-muted);margin-bottom:8px">
          📐 Declensions <span style="font-size:.8rem;font-weight:400">(optional)</span>
        </summary>
        ${declensions.map((d, i) => `
          <div class="field-group" style="margin-bottom:8px">
            <label style="font-size:.85rem">${esc(d.nativeName)}${d.targetName ? ' <span style="color:var(--text-faint)">/ ' + esc(d.targetName) + '</span>' : ''}</label>
            <input type="text" id="meDecl_${i}" value="${esc((existingDecl[i]||{}).value||'')}" autocomplete="off" placeholder="…">
          </div>`).join('')}
      </details>` : '';

  openModal('Edit word', `
    ${isNoun ? `<div class="field-group"><label>Article</label><input id="meArticle" value="${esc(w.article||'')}"></div>` : ''}
    ${isVerb ? `<div class="field-group"><label>Infinitive</label><input id="meInfinitive" value="${esc(w.infinitive||'')}"></div>` : ''}
    ${vgHtml}
    <div class="field-group"><label>Word (Nominative)</label><input id="meLiteral" value="${esc(w.literal)}" readonly style="opacity:.6"></div>
    ${declHtml}
    <div class="field-group"><label>Translation <span class="required">*</span></label><input id="meTranslation" value="${esc(w.translation)}"></div>
    <div class="field-group"><label>Definition <span class="optional">(optional)</span></label><input id="meDefinition" value="${esc(w.definition||'')}"></div>
    <div id="meErr" class="alert alert-danger hidden"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="saveWordEdit('${id}','${lang}')">Save</button>`
  );
};

window.saveWordEdit = async function(id, lang, type) {
  const body = {
    translation: document.getElementById('meTranslation').value.trim(),
    definition:  document.getElementById('meDefinition')?.value?.trim() || ''
  };
  const artEl = document.getElementById('meArticle');
  const infEl = document.getElementById('meInfinitive');
  const vgEl  = document.getElementById('meVerbGroup');
  if (artEl) body.article    = artEl.value.trim();
  if (infEl) body.infinitive = infEl.value.trim();
  if (vgEl)  body.verbGroup  = vgEl.value;

  // Collect declensions
  const langData = (App.config.targetLangs || []).find(l => l.isoCode === lang) || {};
  const declensions = langData.declensions || [];
  if (declensions.length) {
    const declObj = {};
    declensions.forEach((d, i) => {
      const val = document.getElementById(`meDecl_${i}`)?.value?.trim();
      if (val) declObj[i] = { nativeName: d.nativeName, targetName: d.targetName, value: val };
    });
    body.declensions = declObj;
  }

  if (!body.translation) {
    document.getElementById('meErr').textContent = 'Translation required. Provide a translation.';
    document.getElementById('meErr').classList.remove('hidden');
    return;
  }
  try {
    await api('PUT', `/api/words/${id}?lang=${encodeURIComponent(lang)}`, body);
    closeModal();
    toast(t('vocab_updated'));
    const idx = _vocabWords.findIndex(w => w.id === id);
    if (idx !== -1) { _vocabWords[idx] = { ..._vocabWords[idx], ...body }; renderVocabGrid(); }
  } catch(e) {
    document.getElementById('meErr').textContent = e.error || 'Failed to save.';
    document.getElementById('meErr').classList.remove('hidden');
  }
};

window.deleteWord = async function(id, lang) {
  if (!confirm('Delete this word?')) return;
  try {
    await api('DELETE', `/api/words/${id}?lang=${encodeURIComponent(lang)}`);
    _vocabWords = _vocabWords.filter(w => w.id !== id);
    renderVocabGrid();
    toast(t('vocab_deleted'));
  } catch(e) { toast(e.error||'Failed to delete.','danger'); }
};

window.editPhrase = function(id, lang) {
  const p = _vocabPhrases.find(x => x.id === id);
  if (!p) return;
  openModal('Edit phrase', `
    <div class="field-group"><label>Phrase (target language) <span class="required">*</span></label>
      <textarea id="mePText">${esc(p.text)}</textarea></div>
    <div class="field-group"><label>Translation <span class="required">*</span></label>
      <input id="mePTrans" value="${esc(p.translation)}"></div>
    <div class="field-group"><label>Note <span class="optional">(optional)</span></label>
      <input id="mePNote" value="${esc(p.helpNote||'')}"></div>
    <div id="mePErr" class="alert alert-danger hidden"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="savePhraseEdit('${id}','${lang}')">Save</button>`
  );
};

window.savePhraseEdit = async function(id, lang) {
  const body = {
    text:        document.getElementById('mePText').value.trim(),
    translation: document.getElementById('mePTrans').value.trim(),
    helpNote:    document.getElementById('mePNote').value.trim()
  };
  if (!body.text || !body.translation) {
    document.getElementById('mePErr').textContent = 'Phrase and translation required.';
    document.getElementById('mePErr').classList.remove('hidden');
    return;
  }
  try {
    await api('PUT', `/api/phrases/${id}?lang=${encodeURIComponent(lang)}`, body);
    closeModal();
    toast(t('vocab_phrase_updated'));
    const idx = _vocabPhrases.findIndex(p => p.id === id);
    if (idx !== -1) { _vocabPhrases[idx] = { ..._vocabPhrases[idx], ...body }; renderVocabGrid(); }
  } catch(e) {
    document.getElementById('mePErr').textContent = e.error||'Failed to save.';
    document.getElementById('mePErr').classList.remove('hidden');
  }
};

window.deletePhrase = async function(id, lang) {
  if (!confirm('Delete this phrase?')) return;
  try {
    await api('DELETE', `/api/phrases/${id}?lang=${encodeURIComponent(lang)}`);
    _vocabPhrases = _vocabPhrases.filter(p => p.id !== id);
    renderVocabGrid();
    toast(t('vocab_deleted'));
  } catch(e) { toast(e.error||'Failed to delete.','danger'); }
};

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
