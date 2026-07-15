// notebook.js – Notebook page with rich text editor, sidebar, tables, page linking
'use strict';

let NB = {};

function renderNotebook(el, params) {
  const lang = params.lang || window.currentLang();
  if (!lang) {
    el.innerHTML = '<p style="padding:40px;text-align:center;color:var(--text-muted)">' + window.t('notebook_no_lang') + '</p>';
    return;
  }

  // Clean up any previous notebook instance
  if (NB.autoSaveInterval) clearInterval(NB.autoSaveInterval);
  NB = { el, lang, notebook: null, sections: [], currentSectionId: null, currentPageId: null, searchQuery: '', dirty: false, editMode: false };

  el.innerHTML = getNotebookHTML();

  bindNotebookEvents();

  NB.pendingPageId = params.page || null;
  NB._langsLoaded = {}; // cache of loaded notebooks for quick switching

  loadNotebook(lang);
}

function getNotebookHTML() {
  const t = window.t;
  return `
    <div class="notebook-layout">
      <div class="nb-sidebar" id="nbSidebar">
        <div class="nb-sidebar-header">
          <select id="nbLangSelector" class="nb-lang-selector" title="${t('notebook_switch_lang')}"></select>
          <div class="nb-sidebar-actions">
            <button class="nb-tb-btn btn-sm" id="nbSearchToggle" title="${t('notebook_search')}">🔍</button>
            <button class="nb-tb-btn btn-sm" id="nbAddSection" title="${t('notebook_add_section')}">➕</button>
            <button class="nb-tb-btn btn-sm" id="nbToggleActions" title="Page actions">⚙️</button>
          </div>
        </div>
        <div class="nb-search-box hidden" id="nbSearchBox">
          <input type="text" id="nbSearchInput" placeholder="${t('notebook_search_placeholder')}" autocomplete="off">
          <div id="nbSearchResults" class="nb-search-results"></div>
        </div>
        <div class="nb-section-list" id="nbSectionList"></div>
      </div>
      <div class="nb-main" id="nbMain">
        <div class="nb-welcome" id="nbWelcome">
          <div class="nb-welcome-icon">📓</div>
          <h2>${t('notebook_welcome')}</h2>
          <p>${t('notebook_welcome_desc')}</p>
        </div>
        <div class="nb-editor-area hidden" id="nbEditorArea">
          <div class="nb-read-header hidden" id="nbReadHeader">
            <div>
              <h2 class="nb-read-title" id="nbReadTitle"></h2>
              <span class="nb-page-meta" id="nbReadMeta"></span>
            </div>
            <button class="btn btn-sm btn-primary" id="nbEditBtn">✏️</button>
          </div>
          <div class="nb-editor-toolbar" id="nbToolbar">
            <button class="nb-tb-btn" data-cmd="bold" title="${t('notebook_bold')}"><b>B</b></button>
            <button class="nb-tb-btn" data-cmd="italic" title="${t('notebook_italic')}"><i>I</i></button>
            <button class="nb-tb-btn" data-cmd="underline" title="${t('notebook_underline')}"><u>U</u></button>
            <button class="nb-tb-btn" data-cmd="strikeThrough" title="${t('notebook_strikethrough')}"><s>S</s></button>
            <span class="nb-tb-sep"></span>
            <button class="nb-tb-btn" data-cmd="heading1" title="H1">H1</button>
            <button class="nb-tb-btn" data-cmd="heading2" title="H2">H2</button>
            <button class="nb-tb-btn" data-cmd="heading3" title="H3">H3</button>
            <button class="nb-tb-btn" data-cmd="heading4" title="H4">H4</button>
            <span class="nb-tb-sep"></span>
            <button class="nb-tb-btn" data-cmd="insertUnorderedList" title="${t('notebook_bullet_list')}">≡</button>
            <button class="nb-tb-btn" data-cmd="insertOrderedList" title="${t('notebook_numbered_list')}">#</button>
            <button class="nb-tb-btn" data-cmd="taskList" title="${t('notebook_task_list')}">☑</button>
            <span class="nb-tb-sep"></span>
            <button class="nb-tb-btn" data-cmd="insertTable" title="${t('notebook_table')}">⊞</button>
            <button class="nb-tb-btn" data-cmd="insertCodeBlock" title="${t('notebook_code')}">{ }</button>
            <button class="nb-tb-btn" data-cmd="insertBlockquote" title="${t('notebook_quote')}">💬</button>
            <button class="nb-tb-btn" data-cmd="insertHorizontalRule" title="${t('notebook_divider')}">—</button>
            <span class="nb-tb-sep"></span>
            <button class="nb-tb-btn" data-cmd="link" title="${t('notebook_link')}">🌐🔗</button>
            <button class="nb-tb-btn" data-cmd="pageLink" title="${t('notebook_page_link')}">📓🔗</button>
            <button class="nb-tb-btn" data-cmd="vocabLink" title="${t('notebook_vocab_link')}">📚🔗</button>
            <span class="nb-tb-sep"></span>
            <input type="color" id="nbTextColor" class="nb-color-picker" value="#439b00" title="${t('notebook_text_color')}">
          </div>
          <div class="nb-page-header" id="nbPageHeader">
            <input type="text" id="nbPageTitle" class="nb-page-title-input" placeholder="${t('notebook_page_title_placeholder')}">
            <div class="nb-page-meta" id="nbPageMeta"></div>
          </div>
          <div class="nb-editor" id="nbEditor" contenteditable="true" data-placeholder="${t('notebook_page_content_placeholder')}"></div>
          <div class="nb-vocab-links-section hidden" id="nbVocabLinksSection">
            <div class="nb-vocab-links-header">
              <span>📝 ${t('notebook_linked_vocab')}</span>
            </div>
            <div class="nb-vocab-links-list" id="nbVocabLinksList"></div>
          </div>
          <div class="nb-editor-footer">
            <div class="nb-editor-footer-left" id="nbEditorFooterLeft">
              <span id="nbEditorStatus">${t('notebook_saved')}</span>
              <button class="btn btn-sm btn-primary" id="nbSaveBtn">${t('common_save')}</button>
            </div>
            <div class="nb-editor-footer-right" style="display: none">
              <button class="btn btn-sm btn-secondary" id="nbExportPage" title="${t('notebook_export_page')}">📄</button>
              <button class="btn btn-sm btn-danger" id="nbDeletePage">${t('notebook_delete')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="nb-modal-overlay hidden" id="nbTableModal">
      <div class="nb-modal-dialog">
        <h3>${t('notebook_table_insert')}</h3>
        <div class="nb-table-size-picker">
          <div class="nb-table-grid" id="nbTableGrid"></div>
        </div>
        <p id="nbTableSizeLabel">1 × 1</p>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn btn-secondary btn-sm" id="nbTableCancelBtn">${t('common_cancel')}</button>
        </div>
      </div>
    </div>
    <div class="nb-modal-overlay hidden" id="nbLinkModal">
      <div class="nb-modal-dialog">
        <h3>${t('notebook_link_to_page')}</h3>
        <input type="text" id="nbLinkSearch" placeholder="${t('notebook_search_pages')}" autocomplete="off">
        <div id="nbLinkResults" class="nb-link-results"></div>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-secondary btn-sm" id="nbLinkCancelBtn">${t('common_cancel')}</button>
        </div>
      </div>
    </div>
    <div class="nb-modal-overlay hidden" id="nbVocabLinkModal">
      <div class="nb-modal-dialog">
        <h3>${t('notebook_link_vocab_title')}</h3>
        <input type="text" id="nbVocabLinkSearch" class="search-input" placeholder="${t('notebook_search_vocab')}" autocomplete="off">
        <div id="nbVocabLinkResults" class="nb-link-results" style="max-height:300px;overflow-y:auto;margin-top:8px"></div>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-secondary btn-sm" id="nbVocabLinkCancelBtn">${t('common_close')}</button>
        </div>
      </div>
    </div>
    <div class="nb-modal-overlay hidden" id="nbMoveModal">
      <div class="nb-modal-dialog">
        <h3>${t('notebook_move')}</h3>
        <select id="nbMoveSectionSelect" class="nb-move-select"></select>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
          <button class="btn btn-primary btn-sm" id="nbMoveConfirmBtn">${t('notebook_move_to')}</button>
          <button class="btn btn-secondary btn-sm" id="nbMoveCancelBtn">${t('common_cancel')}</button>
        </div>
      </div>
    </div>
    <div class="nb-modal-overlay hidden" id="nbColorModal">
      <div class="nb-modal-dialog">
        <h3 id="nbColorModalTitle">${t('notebook_set_color')}</h3>
        <div class="nb-color-grid" id="nbColorGrid"></div>
        <div class="nb-color-custom-row">
          <label class="nb-color-custom-btn" id="nbColorCustomBtn">
            <span id="nbColorCustomLabel">🎨 ${t('notebook_custom_color')}</span>
            <input type="color" id="nbColorCustomInput" class="nb-color-custom-input">
          </label>
        </div>
        <button class="nb-color-remove" id="nbColorRemove">${t('notebook_remove_color')}</button>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary btn-sm" id="nbColorCancelBtn">${t('common_cancel')}</button>
        </div>
      </div>
    </div>
  `;
}

// ── Event binding ────────────────────────────────────────

function bindNotebookEvents() {
  const el = NB.el;

  el.querySelector('#nbSearchToggle').addEventListener('click', toggleSearch);
  el.querySelector('#nbAddSection').addEventListener('click', addSectionPrompt);
  el.querySelector('#nbToggleActions').addEventListener('click', () => {
    el.querySelector('#nbSidebar').classList.toggle('nb-actions-open');
  });
  el.querySelector('#nbSearchInput').addEventListener('input', () => { NB.searchQuery = el.querySelector('#nbSearchInput').value; performSearch(); });
  el.querySelector('#nbPageTitle').addEventListener('input', markDirty);
  el.querySelector('#nbEditBtn').addEventListener('click', switchToEditMode);
  el.querySelector('#nbDeletePage').addEventListener('click', deleteCurrentPage);
  el.querySelector('#nbExportPage').addEventListener('click', exportCurrentPage);
  el.querySelector('#nbSaveBtn').addEventListener('click', () => saveCurrentPage());
  el.querySelector('#nbLangSelector').addEventListener('change', (e) => switchNotebookLang(e.target.value));
  el.classList.add('notebook-active');

  el.querySelectorAll('.nb-tb-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => handleToolbarCommand(btn.dataset.cmd));
  });

  el.querySelector('#nbTextColor').addEventListener('input', (e) => {
    document.execCommand('foreColor', false, e.target.value);
    const editor = el.querySelector('#nbEditor');
    if (editor) editor.focus();
  });

  el.querySelector('#nbTableCancelBtn').addEventListener('click', () => el.querySelector('#nbTableModal').classList.add('hidden'));
  el.querySelector('#nbLinkCancelBtn').addEventListener('click', () => el.querySelector('#nbLinkModal').classList.add('hidden'));
  el.querySelector('#nbLinkSearch').addEventListener('input', searchPagesForLink);
  el.querySelector('#nbVocabLinkCancelBtn').addEventListener('click', () => el.querySelector('#nbVocabLinkModal').classList.add('hidden'));
  el.querySelector('#nbVocabLinkSearch').addEventListener('input', searchVocabForLink);
  el.querySelector('#nbMoveConfirmBtn').addEventListener('click', confirmMovePage);
  el.querySelector('#nbMoveCancelBtn').addEventListener('click', () => el.querySelector('#nbMoveModal').classList.add('hidden'));
  el.querySelector('#nbColorCancelBtn').addEventListener('click', () => { NB_colorTarget = null; el.querySelector('#nbColorModal').classList.add('hidden'); });
  el.querySelector('#nbColorRemove').addEventListener('click', () => { applyColor(null); el.querySelector('#nbColorModal').classList.add('hidden'); });
  el.querySelector('#nbColorGrid').addEventListener('click', (e) => {
    const swatch = e.target.closest('.nb-color-swatch');
    if (!swatch) return;
    el.querySelectorAll('.nb-color-swatch').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
    applyColor(swatch.dataset.color);
    el.querySelector('#nbColorModal').classList.add('hidden');
  });
  el.querySelector('#nbColorCustomInput').addEventListener('input', (e) => {
    const color = e.target.value;
    el.querySelectorAll('.nb-color-swatch').forEach(s => s.classList.remove('selected'));
    applyColor(color);
    el.querySelector('#nbColorModal').classList.add('hidden');
  });

  // Sidebar event delegation (attached once)
  el.querySelector('#nbSectionList').addEventListener('click', handleSidebarClick);

  const editor = el.querySelector('#nbEditor');
  NB.editor = editor;
  editor.addEventListener('input', markDirty);
  editor.addEventListener('paste', handleEditorPaste);
  editor.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.nb-table-wrapper');
    hideAllTableToolbars();
    if (wrapper && NB.editMode) {
      wrapper.querySelector('.nb-table-toolbar').classList.add('visible');
    }
  });

  el.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentPage();
    }
  });

  NB.autoSaveInterval = setInterval(() => { if (NB.dirty) saveCurrentPage(); }, 30000);

  initTableGridPicker();
  restorePageLinkClicks();
}

function restorePageLinkClicks() {
  const el = NB.el;
  el.querySelectorAll('a[data-notebook-link]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToLinkedPage(a.dataset.notebookLink);
    });
    a.style.cursor = 'pointer';
  });
}

// ── Notebook data loading ──────────────────────────────────

async function loadNotebook(lang) {
  try {
    NB.notebook = await window.api('GET', `/api/notebook/${lang}`);
    NB.sections = (NB.notebook.sections || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    NB.sections.forEach(s => {
      if (s.pages) s.pages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });
    NB._langsLoaded[lang] = NB.sections;
    populateLangSelector();
    renderSidebar();
    // Auto-navigate to page specified in URL
    if (NB.pendingPageId) {
      for (const s of NB.sections) {
        const p = s.pages.find(pg => pg.id === NB.pendingPageId);
        if (p) {
          openPage(s.id, p.id);
          NB.pendingPageId = null;
          return;
        }
      }
      // Page not found - broken link from another notebook
      nbToast(window.t('notebook_broken_link'), 'danger');
      NB.pendingPageId = null;
    }
  } catch (e) {
    console.error('[notebook] load error:', e);
  }
}

function populateLangSelector() {
  const el = NB.el;
  const sel = el.querySelector('#nbLangSelector');
  if (!sel) return;
  const langs = (window.App && window.App.config && window.App.config.targetLangs) || [];
  sel.innerHTML = langs.map(l => {
    const flag = l.flag || '🌐';
    const label = flag + ' ' + l.isoCode.toUpperCase() + ' — ' + l.name;
    return `<option value="${l.isoCode}" ${l.isoCode === NB.lang ? 'selected' : ''}>${label}</option>`;
  }).join('');
  sel.classList.toggle('hidden', langs.length < 2);
}

async function switchNotebookLang(newLang) {
  if (newLang === NB.lang) return;
  // Save current page if dirty before switching
  if (NB.dirty && NB.currentPageId) {
    await saveCurrentPage();
  }
  NB.currentSectionId = null;
  NB.currentPageId = null;
  NB.lang = newLang;
  NB.pendingPageId = null;
  // Use cached data if available
  if (NB._langsLoaded[newLang]) {
    NB.sections = NB._langsLoaded[newLang];
    populateLangSelector();
    renderSidebar();
    showWelcome();
  } else {
    await loadNotebook(newLang);
    showWelcome();
  }
  const hash = '#/notebook?lang=' + newLang;
  history.replaceState({ page: 'notebook', params: { lang: newLang } }, '', hash);
}

async function saveNotebookData() {
  try {
    await window.api('PUT', `/api/notebook/${NB.lang}`, { sections: NB.sections });
  } catch (e) {
    console.error('[notebook] save error:', e);
  }
}

// ── Sidebar ────────────────────────────────────────────────

function renderSidebar() {
  const el = NB.el;
  const list = el.querySelector('#nbSectionList');
  list.innerHTML = NB.sections.map((s, si) => {
    const isActive = s.id === NB.currentSectionId;
    const hasPages = s.pages && s.pages.length;
    const totalSections = NB.sections.length;
    const sectionStyle = s.color ? `background:linear-gradient(to right, ${s.color}44, transparent 70%)` : '';
    return `
    <div class="nb-section ${isActive ? 'active' : ''}" data-section-id="${s.id}">
      <div class="nb-section-header" style="${sectionStyle}">
        <span class="nb-section-toggle">${hasPages ? '▾' : '▸'}</span>
        ${s.color ? `<span class="nb-section-color-dot" style="background:${s.color}"></span>` : ''}
        <span class="nb-section-name">${escapeHtml(s.name)}</span>
        <div class="nb-section-actions">
          ${si > 0 ? `<button class="nb-context-btn" data-action="section-up" title="${window.t('notebook_move_up')}">⬆️</button>` : ''}
          ${si < totalSections - 1 ? `<button class="nb-context-btn" data-action="section-down" title="${window.t('notebook_move_down')}">⬇️</button>` : ''}
          <button class="nb-context-btn" data-action="rename-section" title="${window.t('notebook_rename')}">✏️</button>
          <button class="nb-context-btn" data-action="section-color" title="${window.t('notebook_color')}">🎨</button>
          <button class="nb-context-btn" data-action="delete-section" title="${window.t('common_delete')}">🗑️</button>
          <button class="nb-context-btn" data-action="add-page" title="${window.t('notebook_add_page')}">➕</button>
        </div>
      </div>
      <div class="nb-page-list" data-section-id="${s.id}">
        ${(s.pages || []).map((p, pi) => {
      const pActive = p.id === NB.currentPageId;
      const totalPages = (s.pages || []).length;
      const pageStyle = p.color ? `background:linear-gradient(to right, ${p.color}33, transparent 70%)` : '';
      return `
          <div class="nb-page-item ${pActive ? 'active' : ''}" data-page-id="${p.id}" data-section-id="${s.id}" style="${pageStyle}">
            ${p.color ? `<span class="nb-page-color-dot" style="background:${p.color}"></span>` : ''}
            <span class="nb-page-name">${escapeHtml(p.name)}</span>
            <div class="nb-page-actions">
              ${pi > 0 ? `<button class="nb-context-btn" data-action="page-up" title="${window.t('notebook_move_up')}">⬆️</button>` : ''}
              ${pi < totalPages - 1 ? `<button class="nb-context-btn" data-action="page-down" title="${window.t('notebook_move_down')}">⬇️</button>` : ''}
              <button class="nb-context-btn" data-action="rename-page" title="${window.t('notebook_rename')}">✏️</button>
              <button class="nb-context-btn" data-action="page-color" title="${window.t('notebook_color')}">🎨</button>
              <button class="nb-context-btn" data-action="duplicate-page" title="${window.t('notebook_duplicate')}">📋</button>
              <button class="nb-context-btn" data-action="move-page" title="${window.t('notebook_move')}">📤</button>
              <button class="nb-context-btn" data-action="delete-page" title="${window.t('common_delete')}">🗑️</button>
            </div>
          </div>`;
    }).join('')}
      </div>
    </div>`;
  }).join('');
}

function handleSidebarClick(e) {
  const toggle = e.target.closest('.nb-section-toggle');
  if (toggle) {
    const sectionDiv = toggle.closest('.nb-section');
    const pageList = sectionDiv.querySelector('.nb-page-list');
    const isHidden = pageList.classList.contains('hidden');
    pageList.classList.toggle('hidden');
    toggle.textContent = isHidden ? '▾' : '▸';
    return;
  }

  const header = e.target.closest('.nb-section-header');
  if (header && !e.target.closest('.nb-section-actions')) {
    const sectionId = header.closest('.nb-section').dataset.sectionId;
    NB.currentSectionId = sectionId;
    NB.currentPageId = null;
    showWelcome();
    renderSidebar();
    return;
  }

  const pageItem = e.target.closest('.nb-page-item');
  if (pageItem && !e.target.closest('.nb-page-actions')) {
    openPage(pageItem.dataset.sectionId, pageItem.dataset.pageId);
    return;
  }

  const ctxBtn = e.target.closest('[data-action]');
  if (!ctxBtn) return;
  const action = ctxBtn.dataset.action;
  const sectionId = ctxBtn.closest('[data-section-id]')?.dataset.sectionId;
  const pageId = ctxBtn.closest('[data-page-id]')?.dataset.pageId;

  switch (action) {
    case 'rename-section': renameSectionPrompt(sectionId); break;
    case 'delete-section': deleteSectionPrompt(sectionId); break;
    case 'add-page': addPagePrompt(sectionId); break;
    case 'rename-page': renamePagePrompt(pageId); break;
    case 'duplicate-page': duplicatePage(pageId); break;
    case 'move-page': movePagePrompt(pageId); break;
    case 'delete-page': deletePagePrompt(pageId); break;
    case 'section-up': moveSectionUp(sectionId); break;
    case 'section-down': moveSectionDown(sectionId); break;
    case 'page-up': movePageUp(pageId, sectionId); break;
    case 'page-down': movePageDown(pageId, sectionId); break;
    case 'section-color': showSectionColorPicker(sectionId); break;
    case 'page-color': showPageColorPicker(pageId); break;
  }
}

// ── Section CRUD ───────────────────────────────────────────

async function addSectionPrompt() {
  const name = await window.promptModal(window.t('notebook_add_section_prompt'), { required: true });
  if (!name) return;
  try {
    const data = await window.api('POST', `/api/notebook/${NB.lang}/sections`, { name: name.trim() });
    NB.sections.push(data.section);
    renderSidebar();
    nbToast(window.t('notebook_section_added'));
  } catch (e) { nbToast(e.error || window.t('common_error'), 'danger'); }
}

async function renameSectionPrompt(sectionId) {
  const section = NB.sections.find(s => s.id === sectionId);
  if (!section) return;
  const name = await window.promptModal(window.t('notebook_rename'), { default: section.name, required: true });
  if (!name || name === section.name) return;
  try {
    await window.api('PUT', `/api/notebook/${NB.lang}/sections/${sectionId}`, { name: name.trim() });
    section.name = name.trim();
    renderSidebar();
    nbToast(window.t('notebook_renamed'));
  } catch (e) { nbToast(e.error || window.t('common_error'), 'danger'); }
}

async function deleteSectionPrompt(sectionId) {
  const confirmed = await window.confirmModal(window.t('notebook_delete_section_confirm'), { confirmLabel: window.t('common_delete') });
  if (!confirmed) return;
  try {
    await window.api('DELETE', `/api/notebook/${NB.lang}/sections/${sectionId}`);
    NB.sections = NB.sections.filter(s => s.id !== sectionId);
    if (NB.currentSectionId === sectionId) { NB.currentSectionId = null; NB.currentPageId = null; showWelcome(); }
    renderSidebar();
    nbToast(window.t('notebook_deleted'));
  } catch (e) { nbToast(e.error || window.t('common_error'), 'danger'); }
}

// ── Section reordering ──────────────────────────────────────

async function moveSectionUp(sectionId) {
  const idx = NB.sections.findIndex(s => s.id === sectionId);
  if (idx <= 0) return;
  swapSections(idx, idx - 1);
  await saveSectionsOrder();
}

async function moveSectionDown(sectionId) {
  const idx = NB.sections.findIndex(s => s.id === sectionId);
  if (idx < 0 || idx >= NB.sections.length - 1) return;
  swapSections(idx, idx + 1);
  await saveSectionsOrder();
}

function swapSections(i, j) {
  const tmp = NB.sections[i];
  NB.sections[i] = NB.sections[j];
  NB.sections[j] = tmp;
  NB.sections.forEach((s, idx) => s.order = idx);
}

async function saveSectionsOrder() {
  try {
    // Save via PUT on each section to update order, or full save
    for (let i = 0; i < NB.sections.length; i++) {
      await window.api('PUT', `/api/notebook/${NB.lang}/sections/${NB.sections[i].id}`, { order: i });
    }
    renderSidebar();
    nbToast(window.t('notebook_reordered'));
  } catch (e) {
    console.error('[notebook] reorder error:', e);
    nbToast(window.t('common_error'), 'danger');
  }
}

// ── Page CRUD ──────────────────────────────────────────────

async function addPagePrompt(sectionId) {
  const name = await window.promptModal(window.t('notebook_add_page_prompt'), { required: true });
  if (!name) return;
  try {
    const data = await window.api('POST', `/api/notebook/${NB.lang}/sections/${sectionId}/pages`, { name: name.trim() });
    const section = NB.sections.find(s => s.id === sectionId);
    if (section) section.pages.push(data.page);
    renderSidebar();
    openPage(sectionId, data.page.id);
    nbToast(window.t('notebook_page_added'));
  } catch (e) { nbToast(e.error || window.t('common_error'), 'danger'); }
}

async function renamePagePrompt(pageId) {
  let foundPage;
  for (const s of NB.sections) {
    const p = s.pages.find(pg => pg.id === pageId);
    if (p) { foundPage = p; break; }
  }
  if (!foundPage) return;
  const name = await window.promptModal(window.t('notebook_rename'), { default: foundPage.name, required: true });
  if (!name || name === foundPage.name) return;
  try {
    await window.api('PUT', `/api/notebook/${NB.lang}/pages/${pageId}`, { name: name.trim() });
    foundPage.name = name.trim();
    renderSidebar();
    if (NB.currentPageId === pageId) {
      NB.el.querySelector('#nbPageTitle').value = name.trim();
      if (!NB.editMode) {
        NB.el.querySelector('#nbReadTitle').textContent = name.trim();
      }
    }
    nbToast(window.t('notebook_renamed'));
  } catch (e) { nbToast(e.error || window.t('common_error'), 'danger'); }
}

async function duplicatePage(pageId) {
  try {
    const data = await window.api('POST', `/api/notebook/${NB.lang}/pages/${pageId}/duplicate`);
    for (const s of NB.sections) {
      if (s.pages.find(p => p.id === pageId)) {
        s.pages.push(data.page);
        break;
      }
    }
    renderSidebar();
    nbToast(window.t('notebook_duplicated'));
  } catch (e) { nbToast(e.error || window.t('common_error'), 'danger'); }
}

let NB_movePageId = null;

function movePagePrompt(pageId) {
  NB_movePageId = pageId;
  const el = NB.el;
  const select = el.querySelector('#nbMoveSectionSelect');
  const currentSection = NB.sections.find(s => s.pages.some(p => p.id === pageId));
  const others = NB.sections.filter(s => s.id !== (currentSection ? currentSection.id : null));
  if (!others.length) { nbToast(window.t('notebook_no_other_sections'), 'danger'); return; }
  select.innerHTML = others.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  el.querySelector('#nbMoveModal').classList.remove('hidden');
}

async function confirmMovePage() {
  const el = NB.el;
  const targetSectionId = el.querySelector('#nbMoveSectionSelect').value;
  el.querySelector('#nbMoveModal').classList.add('hidden');
  try {
    await window.api('PUT', `/api/notebook/${NB.lang}/pages/${NB_movePageId}`, { targetSectionId });
    await loadNotebook(NB.lang);
    nbToast(window.t('notebook_moved'));
  } catch (e) { nbToast(e.error || window.t('common_error'), 'danger'); }
  NB_movePageId = null;
}

async function deletePagePrompt(pageId) {
  const confirmed = await window.confirmModal(window.t('notebook_delete_page_confirm'), { confirmLabel: window.t('common_delete') });
  if (!confirmed) return;
  try {
    await window.api('DELETE', `/api/notebook/${NB.lang}/pages/${pageId}`);
    for (const s of NB.sections) {
      s.pages = s.pages.filter(p => p.id !== pageId);
    }
    if (NB.currentPageId === pageId) { NB.currentPageId = null; showWelcome(); }
    renderSidebar();
    nbToast(window.t('notebook_deleted'));
  } catch (e) { nbToast(e.error || window.t('common_error'), 'danger'); }
}

function deleteCurrentPage() {
  if (NB.currentPageId) deletePagePrompt(NB.currentPageId);
}

function exportCurrentPage() {
  if (!NB.currentPageId) return;
  const el = NB.el;
  const title = el.querySelector('#nbPageTitle').value || 'Untitled';
  const content = el.querySelector('#nbEditor').innerHTML;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${content}</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title.replace(/[^a-zA-Z0-9_-]/g, '_') + '.html';
  a.click();
  URL.revokeObjectURL(a.href);
  nbToast('📄 ' + window.t('notebook_renamed'));
}

// ── Page reordering ─────────────────────────────────────────

async function movePageUp(pageId, sectionId) {
  const section = NB.sections.find(s => s.id === sectionId);
  if (!section) return;
  const pages = section.pages;
  const idx = pages.findIndex(p => p.id === pageId);
  if (idx <= 0) return;
  swapPages(pages, idx, idx - 1);
  await savePagesOrder(sectionId, pages);
}

async function movePageDown(pageId, sectionId) {
  const section = NB.sections.find(s => s.id === sectionId);
  if (!section) return;
  const pages = section.pages;
  const idx = pages.findIndex(p => p.id === pageId);
  if (idx < 0 || idx >= pages.length - 1) return;
  swapPages(pages, idx, idx + 1);
  await savePagesOrder(sectionId, pages);
}

function swapPages(pages, i, j) {
  const tmp = pages[i];
  pages[i] = pages[j];
  pages[j] = tmp;
  pages.forEach((p, idx) => p.order = idx);
}

async function savePagesOrder(sectionId, pages) {
  try {
    for (let i = 0; i < pages.length; i++) {
      await window.api('PUT', `/api/notebook/${NB.lang}/pages/${pages[i].id}`, { order: i });
    }
    renderSidebar();
    nbToast(window.t('notebook_reordered'));
  } catch (e) {
    console.error('[notebook] reorder error:', e);
    nbToast(window.t('common_error'), 'danger');
  }
}

// ── Mode switching ──────────────────────────────────────────

function hideAllTableToolbars() {
  NB.el.querySelectorAll('.nb-table-toolbar.visible').forEach(t => t.classList.remove('visible'));
}

function rebindTableToolbars() {
  const editor = NB.el.querySelector('#nbEditor');
  if (!editor) return;
  editor.querySelectorAll('.nb-table-wrapper').forEach(wrapper => {
    const toolbar = wrapper.querySelector('.nb-table-toolbar');
    if (!toolbar) return;
    const table = wrapper.querySelector('table');
    if (!table) return;
    toolbar.contentEditable = 'false';
    toolbar.querySelectorAll('button').forEach(b => b.contentEditable = 'false');
    toolbar.querySelectorAll('[data-table-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        tableAction(table, btn.dataset.tableAction);
      });
    });
  });
}

function switchToReadMode() {
  NB.editMode = false;
  const el = NB.el;
  el.querySelector('#nbReadHeader').classList.remove('hidden');
  el.querySelector('#nbReadTitle').textContent = el.querySelector('#nbPageTitle').value;
  el.querySelector('#nbReadMeta').textContent = el.querySelector('#nbPageMeta').textContent;
  el.querySelector('#nbToolbar').classList.add('hidden');
  el.querySelector('#nbPageHeader').classList.add('hidden');
  el.querySelector('#nbEditor').setAttribute('contenteditable', 'false');
  el.querySelector('#nbEditor').classList.add('nb-editor-readonly');
  el.querySelector('#nbEditorStatus').textContent = '';
  el.querySelector('#nbEditorFooterLeft').classList.add('hidden');
  hideAllTableToolbars();
  // Disable table cells and code blocks (not toolbar elements)
  el.querySelector('#nbEditor').querySelectorAll('td[contenteditable], th[contenteditable], code[contenteditable]').forEach(c => c.setAttribute('contenteditable', 'false'));
}

function switchToEditMode() {
  NB.editMode = true;
  const el = NB.el;
  el.querySelector('#nbReadHeader').classList.add('hidden');
  el.querySelector('#nbToolbar').classList.remove('hidden');
  el.querySelector('#nbPageHeader').classList.remove('hidden');
  el.querySelector('#nbEditor').setAttribute('contenteditable', 'true');
  el.querySelector('#nbEditor').classList.remove('nb-editor-readonly');
  el.querySelector('#nbEditorFooterLeft').classList.remove('hidden');
  updateEditorStatus();
  el.querySelector('#nbPageHeader').querySelector('#nbPageTitle').focus();
  // Restore table cells and code blocks (not toolbar elements)
  el.querySelector('#nbEditor').querySelectorAll('td[contenteditable], th[contenteditable], code[contenteditable]').forEach(c => c.setAttribute('contenteditable', 'true'));
}

// ── Page navigation ────────────────────────────────────────

function openPage(sectionId, pageId) {
  // Save current page if dirty
  if (NB.dirty && NB.currentPageId) {
    saveCurrentPage();
  }

  NB.currentSectionId = sectionId;
  NB.currentPageId = pageId;

  const section = NB.sections.find(s => s.id === sectionId);
  if (!section) return;
  const page = section.pages.find(p => p.id === pageId);
  if (!page) return;

  const el = NB.el;
  el.querySelector('#nbWelcome').classList.add('hidden');
  el.querySelector('#nbEditorArea').classList.remove('hidden');
  el.querySelector('#nbPageTitle').value = page.name;
  el.querySelector('#nbEditor').innerHTML = page.content || '';
  rebindTableToolbars();
  el.querySelector('#nbPageMeta').textContent = window.t('notebook_last_updated') + ': ' + formatDate(page.updatedAt);
  NB.dirty = false;
  updateEditorStatus();
  renderSidebar();
  renderVocabLinksList();

  // Set mode: pages with content open in read mode, empty/new pages in edit mode
  const hasContent = page.content && page.content.trim().length > 0 && page.content !== '<br>';
  if (hasContent) {
    switchToReadMode();
  } else {
    switchToEditMode();
  }

  // Re-bind notebook link clicks
  el.querySelector('#nbEditor').querySelectorAll('a[data-notebook-link]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToLinkedPage(a.dataset.notebookLink);
    });
    a.style.cursor = 'pointer';
  });

  // Update URL hash for direct linking
  const hash = '#/notebook?lang=' + NB.lang + '&page=' + pageId;
  if (window.location.hash !== hash) {
    history.pushState({ page: 'notebook', params: { lang: NB.lang, page: pageId } }, '', hash);
  }
}

function navigateToLinkedPage(pageId) {
  for (const s of NB.sections) {
    const p = s.pages.find(pg => pg.id === pageId);
    if (p) {
      openPage(s.id, pageId);
      return;
    }
  }
  nbToast(window.t('notebook_broken_link'), 'danger');
}

function showWelcome() {
  NB.currentPageId = null;
  const el = NB.el;
  el.querySelector('#nbWelcome').classList.remove('hidden');
  el.querySelector('#nbEditorArea').classList.add('hidden');
  // Update URL hash
  const hash = '#/notebook?lang=' + NB.lang;
  history.pushState({ page: 'notebook', params: { lang: NB.lang } }, '', hash);
}

// ── Save ───────────────────────────────────────────────────

async function saveCurrentPage() {
  if (!NB.currentPageId) return;
  const section = NB.sections.find(s => s.id === NB.currentSectionId);
  if (!section) return;
  const page = section.pages.find(p => p.id === NB.currentPageId);
  if (!page) return;

  const el = NB.el;
  const name = el.querySelector('#nbPageTitle').value.trim() || 'Untitled';
  const content = el.querySelector('#nbEditor').innerHTML;

  try {
    const data = await window.api('PUT', `/api/notebook/${NB.lang}/pages/${NB.currentPageId}`, { name, content });
    page.name = data.page.name;
    page.content = data.page.content;
    page.updatedAt = data.page.updatedAt;
    NB.dirty = false;
    updateEditorStatus();
    el.querySelector('#nbPageMeta').textContent = window.t('notebook_last_updated') + ': ' + formatDate(page.updatedAt);
    renderSidebar();
  } catch (e) {
    console.error('[notebook] save error:', e);
    nbToast(window.t('common_error'), 'danger');
  }
}

function markDirty() {
  NB.dirty = true;
  updateEditorStatus();
}

function updateEditorStatus() {
  const el = NB.el;
  const status = el.querySelector('#nbEditorStatus');
  if (NB.dirty) {
    status.innerHTML = '● ' + window.t('notebook_unsaved');
    status.style.color = 'var(--warning)';
  } else {
    status.textContent = '✓ ' + window.t('notebook_saved');
    status.style.color = 'var(--text-faint)';
  }
}

// ── Toolbar commands ───────────────────────────────────────

async function handleToolbarCommand(cmd) {
  const editor = NB.editor;
  if (!editor) return;
  editor.focus();

  switch (cmd) {
    case 'bold': document.execCommand('bold'); break;
    case 'italic': document.execCommand('italic'); break;
    case 'underline': document.execCommand('underline'); break;
    case 'strikeThrough': document.execCommand('strikeThrough'); break;
    case 'heading1': document.execCommand('formatBlock', false, 'h1'); break;
    case 'heading2': document.execCommand('formatBlock', false, 'h2'); break;
    case 'heading3': document.execCommand('formatBlock', false, 'h3'); break;
    case 'heading4': document.execCommand('formatBlock', false, 'h4'); break;
    case 'insertUnorderedList': document.execCommand('insertUnorderedList'); break;
    case 'insertOrderedList': document.execCommand('insertOrderedList'); break;
    case 'taskList': insertTaskList(); break;
    case 'insertTable': showTablePicker(); break;
    case 'insertCodeBlock': insertCodeBlock(); break;
    case 'insertBlockquote': document.execCommand('formatBlock', false, 'blockquote'); break;
    case 'insertHorizontalRule': document.execCommand('insertHorizontalRule'); break;
    case 'link': await insertHyperlink(); break;
    case 'pageLink': showPageLinkPicker(); break;
    case 'vocabLink': showNotebookVocabLinkPicker(); break;
  }
  markDirty();
}

// ── Task list ──────────────────────────────────────────────

function insertTaskList() {
  const editor = NB.editor;
  const ul = document.createElement('ul');
  ul.className = 'nb-task-list';
  const li = document.createElement('li');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'nb-task-checkbox';
  li.appendChild(cb);
  li.appendChild(document.createTextNode(' '));
  ul.appendChild(li);
  insertNodeAtCursor(ul);
  markDirty();
}

function restoreTaskListBehaviour() {
  const editor = NB.editor;
  if (!editor) return;
  editor.querySelectorAll('ul.nb-task-list li').forEach(li => {
    if (!li.querySelector('.nb-task-checkbox')) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'nb-task-checkbox';
      li.insertBefore(cb, li.firstChild);
    }
  });
}

function insertNodeAtCursor(node) {
  const sel = window.getSelection();
  if (sel.rangeCount) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// ── Table ──────────────────────────────────────────────────

let nbTableRows = 3, nbTableCols = 3;

function initTableGridPicker() {
  const el = NB.el;
  const grid = el.querySelector('#nbTableGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const cell = document.createElement('div');
      cell.className = 'nb-table-grid-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.addEventListener('mouseenter', () => {
        nbTableRows = r + 1;
        nbTableCols = c + 1;
        grid.querySelectorAll('.nb-table-grid-cell').forEach(cl => {
          const ri = parseInt(cl.dataset.row);
          const ci = parseInt(cl.dataset.col);
          cl.classList.toggle('selected', ri <= r && ci <= c);
        });
        el.querySelector('#nbTableSizeLabel').textContent = `${r + 1} × ${c + 1}`;
      });
      cell.addEventListener('click', insertTable);
      grid.appendChild(cell);
    }
  }
}

function showTablePicker() {
  NB.el.querySelector('#nbTableModal').classList.remove('hidden');
}

function insertTable() {
  const el = NB.el;
  el.querySelector('#nbTableModal').classList.add('hidden');
  const editor = NB.editor;
  if (!editor) return;
  editor.focus();

  const table = document.createElement('table');
  table.className = 'nb-editor-table';
  for (let r = 0; r < nbTableRows; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < nbTableCols; c++) {
      const td = document.createElement(r === 0 ? 'th' : 'td');
      td.innerHTML = '&nbsp;';
      td.contentEditable = 'true';
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'nb-table-wrapper';
  const tblToolbar = document.createElement('div');
  tblToolbar.className = 'nb-table-toolbar';
  tblToolbar.contentEditable = 'false';
  tblToolbar.innerHTML = `
    <button class="nb-tb-btn btn-sm" data-table-action="add-row">${window.t('notebook_add_row')}</button>
    <button class="nb-tb-btn btn-sm" data-table-action="add-col">${window.t('notebook_add_col')}</button>
    <button class="nb-tb-btn btn-sm" data-table-action="del-row">${window.t('notebook_del_row')}</button>
    <button class="nb-tb-btn btn-sm" data-table-action="del-col">${window.t('notebook_del_col')}</button>
  `;
  wrapper.appendChild(tblToolbar);
  wrapper.appendChild(table);

  insertNodeAtCursor(wrapper);

  // Bind table toolbar
  tblToolbar.querySelectorAll('[data-table-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      tableAction(wrapper.querySelector('table'), btn.dataset.tableAction);
    });
  });

  markDirty();
}

function tableAction(table, action) {
  const rows = table.querySelectorAll('tr');
  if (!rows.length) return;
  const cellCount = rows[0].children.length;

  switch (action) {
    case 'add-row': {
      const tr = document.createElement('tr');
      const isHeader = rows[0].children[0].tagName === 'TH';
      for (let c = 0; c < cellCount; c++) {
        const td = document.createElement(isHeader && rows.length === 1 ? 'th' : 'td');
        td.innerHTML = '&nbsp;';
        td.contentEditable = 'true';
        tr.appendChild(td);
      }
      table.appendChild(tr);
      break;
    }
    case 'add-col':
      rows.forEach((tr, ri) => {
        const td = document.createElement(ri === 0 ? 'th' : 'td');
        td.innerHTML = '&nbsp;';
        td.contentEditable = 'true';
        tr.appendChild(td);
      });
      break;
    case 'del-row':
      if (rows.length > 1) rows[rows.length - 1].remove();
      break;
    case 'del-col':
      if (cellCount > 1) rows.forEach(tr => tr.lastElementChild.remove());
      break;
  }
  markDirty();
}

// ── Code block ─────────────────────────────────────────────

function insertCodeBlock() {
  const editor = NB.editor;
  if (!editor) return;
  editor.focus();
  const pre = document.createElement('pre');
  pre.className = 'nb-code-block';
  const code = document.createElement('code');
  code.contentEditable = 'true';
  code.textContent = window.t('notebook_code_hint');
  pre.appendChild(code);
  insertNodeAtCursor(pre);
  markDirty();
}

// ── Hyperlinks (external) ──────────────────────────────────

async function insertHyperlink() {
  const sel = window.getSelection();
  const text = sel.toString().trim();
  const url = await window.promptModal(window.t('notebook_link_url'), { default: 'https://' });
  if (!url || !url.trim()) return;
  document.execCommand('createLink', false, url);
  markDirty();
}

// ── Page linking ───────────────────────────────────────────

function showPageLinkPicker() {
  NB.el.querySelector('#nbLinkModal').classList.remove('hidden');
  NB.el.querySelector('#nbLinkSearch').value = '';
  NB.el.querySelector('#nbLinkResults').innerHTML = '';
  searchPagesForLink();
}

function searchPagesForLink() {
  const el = NB.el;
  const q = (el.querySelector('#nbLinkSearch').value || '').toLowerCase().trim();
  const results = el.querySelector('#nbLinkResults');
  const allPages = [];
  for (const s of NB.sections) {
    for (const p of s.pages) {
      if (p.id === NB.currentPageId) continue;
      if (!q || p.name.toLowerCase().includes(q)) {
        allPages.push({ sectionName: s.name, pageId: p.id, pageName: p.name });
      }
    }
  }
  if (!allPages.length) {
    results.innerHTML = '<div class="nb-link-empty">' + window.t('notebook_no_pages_found') + '</div>';
    return;
  }
  results.innerHTML = allPages.map(item => `
    <div class="nb-link-item" data-page-id="${item.pageId}">
      <span class="nb-link-section">${escapeHtml(item.sectionName)}</span>
      <span class="nb-link-name">${escapeHtml(item.pageName)}</span>
    </div>
  `).join('');

  results.querySelectorAll('.nb-link-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.querySelector('.nb-link-name').textContent;
      insertPageLink(item.dataset.pageId, name);
      el.querySelector('#nbLinkModal').classList.add('hidden');
    });
  });
}

function insertPageLink(pageId, pageName) {
  const editor = NB.editor;
  if (!editor) return;
  editor.focus();
  const sel = window.getSelection();
  let text = sel.toString().trim();
  if (!text) text = pageName;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const a = document.createElement('a');
  a.href = '#';
  a.dataset.notebookLink = pageId;
  a.className = 'nb-page-link';
  a.textContent = text;
  a.title = window.t('notebook_open_link') + ': ' + pageName;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    navigateToLinkedPage(pageId);
  });
  range.insertNode(a);
  range.setStartAfter(a);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  markDirty();
}

// ── Search ─────────────────────────────────────────────────

function toggleSearch() {
  const el = NB.el;
  const box = el.querySelector('#nbSearchBox');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) {
    el.querySelector('#nbSearchInput').focus();
  } else {
    el.querySelector('#nbSearchResults').innerHTML = '';
  }
}

async function performSearch() {
  const el = NB.el;
  const resultsEl = el.querySelector('#nbSearchResults');
  const q = NB.searchQuery.trim();
  if (!q) { resultsEl.innerHTML = ''; resultsEl.classList.remove('has-results'); return; }

  try {
    const data = await window.api('GET', `/api/notebook/${NB.lang}/search?q=${encodeURIComponent(q)}`);
    const results = data.results || [];
    if (!results.length) {
      resultsEl.innerHTML = '<div class="nb-search-empty">' + window.t('notebook_no_results') + '</div>';
      resultsEl.classList.add('has-results');
      return;
    }
    resultsEl.innerHTML = results.slice(0, 20).map(r => `
      <div class="nb-search-item" data-page-id="${r.pageId}" data-section-id="${r.sectionId}">
        <div class="nb-search-item-title">${highlightText(escapeHtml(r.pageName), q)}</div>
        <div class="nb-search-item-section">${escapeHtml(r.sectionName)}</div>
        <div class="nb-search-item-snippet">${highlightText(escapeHtml(r.snippet || ''), q)}</div>
      </div>
    `).join('');
    resultsEl.classList.add('has-results');

    resultsEl.querySelectorAll('.nb-search-item').forEach(item => {
      item.addEventListener('click', () => {
        openPage(item.dataset.sectionId, item.dataset.pageId);
        toggleSearch();
      });
    });
  } catch (e) {
    console.error('[notebook] search error:', e);
  }
}

// ── Color customization ─────────────────────────────────────

const NB_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e84393', '#00b894', '#6c5ce7', '#fd79a8', '#00cec9', '#636e72', '#2d3436'];

let NB_colorTarget = null; // { type: 'section', id } or { type: 'page', id }
let NB_colorResolve = null;

function initColorGrid() {
  const el = NB.el;
  const grid = el.querySelector('#nbColorGrid');
  if (!grid || grid.children.length) return;
  NB_COLORS.forEach(c => {
    const swatch = document.createElement('div');
    swatch.className = 'nb-color-swatch';
    swatch.style.background = c;
    swatch.dataset.color = c;
    grid.appendChild(swatch);
  });
}

function showSectionColorPicker(sectionId) {
  NB_colorTarget = { type: 'section', id: sectionId };
  const section = NB.sections.find(s => s.id === sectionId);
  initColorGrid();
  const el = NB.el;
  el.querySelector('#nbColorModalTitle').textContent = window.t('notebook_set_color') + ' — ' + (section ? escapeHtml(section.name) : '');
  el.querySelectorAll('.nb-color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === (section && section.color)));
  el.querySelector('#nbColorModal').classList.remove('hidden');
}

function showPageColorPicker(pageId) {
  NB_colorTarget = { type: 'page', id: pageId };
  let foundPage;
  for (const s of NB.sections) {
    const p = s.pages.find(pg => pg.id === pageId);
    if (p) { foundPage = p; break; }
  }
  initColorGrid();
  const el = NB.el;
  el.querySelector('#nbColorModalTitle').textContent = window.t('notebook_set_color') + ' — ' + (foundPage ? escapeHtml(foundPage.name) : '');
  el.querySelectorAll('.nb-color-swatch').forEach(s => s.classList.toggle('selected', s.dataset.color === (foundPage && foundPage.color)));
  el.querySelector('#nbColorModal').classList.remove('hidden');
}

async function applyColor(color) {
  if (!NB_colorTarget) return;
  const { type, id } = NB_colorTarget;
  NB_colorTarget = null;
  try {
    if (type === 'section') {
      await window.api('PUT', `/api/notebook/${NB.lang}/sections/${id}`, { color });
      const section = NB.sections.find(s => s.id === id);
      if (section) section.color = color;
    } else {
      await window.api('PUT', `/api/notebook/${NB.lang}/pages/${id}`, { color });
      for (const s of NB.sections) {
        const pg = s.pages.find(p => p.id === id);
        if (pg) { pg.color = color; break; }
      }
    }
    renderSidebar();
  } catch (e) {
    console.error('[notebook] color error:', e);
    nbToast(window.t('common_error'), 'danger');
  }
}

// ── Paste handling for tabular data ─────────────────────────

function handleEditorPaste(e) {
  const html = e.clipboardData.getData('text/html');
  if (html && (html.includes('<table') || html.includes('<tr') || html.includes('<td') || html.includes('<th'))) {
    e.preventDefault();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    const table = wrapper.querySelector('table');
    if (table) {
      // Clean up table: add proper classes and contentEditable to cells
      table.className = 'nb-editor-table';
      table.querySelectorAll('th, td').forEach(cell => {
        if (!cell.hasAttribute('contentEditable')) cell.contentEditable = 'true';
      });
      const tblWrapper = document.createElement('div');
      tblWrapper.className = 'nb-table-wrapper';
      const tblToolbar = document.createElement('div');
      tblToolbar.className = 'nb-table-toolbar';
      tblToolbar.innerHTML = `
        <button class="nb-tb-btn btn-sm" data-table-action="add-row">${window.t('notebook_add_row')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="add-col">${window.t('notebook_add_col')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="del-row">${window.t('notebook_del_row')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="del-col">${window.t('notebook_del_col')}</button>
      `;
      tblWrapper.appendChild(tblToolbar);
      tblWrapper.appendChild(table);
      tblToolbar.querySelectorAll('[data-table-action]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          tableAction(tblWrapper.querySelector('table'), btn.dataset.tableAction);
        });
      });
      insertNodeAtCursor(tblWrapper);
      markDirty();
      return;
    }
    // If no <table> tag but has tr/td, wrap in table
    const trs = wrapper.querySelectorAll('tr');
    if (trs.length) {
      const newTable = document.createElement('table');
      newTable.className = 'nb-editor-table';
      trs.forEach(tr => {
        const cells = tr.querySelectorAll('td, th');
        if (!cells.length) {
          // Plain text rows - handle as tab-separated
          const text = tr.textContent.trim();
          if (text) {
            const parts = text.split('\t');
            const newTr = document.createElement('tr');
            parts.forEach(part => {
              const td = document.createElement('td');
              td.textContent = part;
              td.contentEditable = 'true';
              newTr.appendChild(td);
            });
            newTable.appendChild(newTr);
          }
        } else {
          const newTr = document.createElement('tr');
          cells.forEach(cell => {
            const tag = cell.tagName.toLowerCase();
            const newCell = document.createElement(tag === 'th' ? 'th' : 'td');
            newCell.innerHTML = cell.innerHTML;
            newCell.contentEditable = 'true';
            newTr.appendChild(newCell);
          });
          newTable.appendChild(newTr);
        }
      });
      if (newTable.children.length) {
        const tblWrapper = document.createElement('div');
        tblWrapper.className = 'nb-table-wrapper';
        const tblToolbar = document.createElement('div');
        tblToolbar.className = 'nb-table-toolbar';
        tblToolbar.contentEditable = 'false';
        tblToolbar.innerHTML = `
        <button class="nb-tb-btn btn-sm" data-table-action="add-row">${window.t('notebook_add_row')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="add-col">${window.t('notebook_add_col')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="del-row">${window.t('notebook_del_row')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="del-col">${window.t('notebook_del_col')}</button>
      `;
        tblWrapper.appendChild(tblToolbar);
        tblWrapper.appendChild(table);
        tblToolbar.querySelectorAll('[data-table-action]').forEach(btn => {
          btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            tableAction(tblWrapper.querySelector('table'), btn.dataset.tableAction);
          });
        });
        insertNodeAtCursor(tblWrapper);
        markDirty();
        return;
      }
    }
  }
  // Also handle plain-text tab-separated data
  const text = e.clipboardData.getData('text/plain');
  if (text && text.includes('\t') && text.includes('\n')) {
    e.preventDefault();
    const table = document.createElement('table');
    table.className = 'nb-editor-table';
    const rows = text.split('\n').filter(r => r.trim());
    rows.forEach((row, ri) => {
      const tr = document.createElement('tr');
      const cells = row.split('\t');
      cells.forEach(cell => {
        const td = document.createElement(ri === 0 ? 'th' : 'td');
        td.textContent = cell.trim();
        td.contentEditable = 'true';
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    if (table.children.length) {
      const tblWrapper = document.createElement('div');
      tblWrapper.className = 'nb-table-wrapper';
      const tblToolbar = document.createElement('div');
      tblToolbar.className = 'nb-table-toolbar';
      tblToolbar.contentEditable = 'false';
      tblToolbar.innerHTML = `
        <button class="nb-tb-btn btn-sm" data-table-action="add-row">${window.t('notebook_add_row')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="add-col">${window.t('notebook_add_col')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="del-row">${window.t('notebook_del_row')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="del-col">${window.t('notebook_del_col')}</button>
      `;
      tblWrapper.appendChild(tblToolbar);
      tblWrapper.appendChild(table);
      tblToolbar.querySelectorAll('[data-table-action]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          tableAction(tblWrapper.querySelector('table'), btn.dataset.tableAction);
        });
      });
      insertNodeAtCursor(tblWrapper);
      markDirty();
    }
  }
}

// ── Utilities ──────────────────────────────────────────────

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function highlightText(text, query) {
  if (!query) return text;
  const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return text.replace(re, '<mark>$1</mark>');
}

// ── Vocabulary linking ──────────────────────────────────────

NB._vocabCache = null; // cached vocabulary for the picker

function showNotebookVocabLinkPicker() {
  if (!NB.currentPageId) {
    nbToast(window.t('notebook_select_page_first'), 'warning');
    return;
  }
  NB._vocabCache = null; // force refresh
  NB.el.querySelector('#nbVocabLinkModal').classList.remove('hidden');
  NB.el.querySelector('#nbVocabLinkSearch').value = '';
  NB.el.querySelector('#nbVocabLinkResults').innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)"><div class="spinner"></div></div>';
  searchVocabForLink();
}

async function searchVocabForLink() {
  const el = NB.el;
  const q = (el.querySelector('#nbVocabLinkSearch').value || '').toLowerCase().trim();
  const results = el.querySelector('#nbVocabLinkResults');
  const lang = NB.lang;

  // Get current page's already-linked vocab IDs
  const section = NB.sections.find(s => s.id === NB.currentSectionId);
  const page = section ? section.pages.find(p => p.id === NB.currentPageId) : null;
  const linkedIds = (page && page.vocabLinks) ? page.vocabLinks.map(l => l.vocabId) : [];

  // Load vocab cache if needed
  if (!NB._vocabCache) {
    try {
      const [words, phrases] = await Promise.all([
        window.api('GET', '/api/words?lang=' + encodeURIComponent(lang)),
        window.api('GET', '/api/phrases?lang=' + encodeURIComponent(lang))
      ]);
      NB._vocabCache = [
        ...words.map(w => ({ id: w.id, vocabType: 'word', text: w.literal || w.text || '', translation: w.translation })),
        ...phrases.map(p => ({ id: p.id, vocabType: 'phrase', text: p.text || p.literal || '', translation: p.translation }))
      ];
    } catch {
      results.innerHTML = '<div class="nb-link-empty" style="color:var(--danger)">' + window.t('common_error') + '</div>';
      return;
    }
  }

  let allVocab = NB._vocabCache.map(v => ({ ...v, linked: linkedIds.includes(v.id) }));

  if (q) {
    allVocab = allVocab.filter(v =>
      v.text.toLowerCase().includes(q) ||
      (v.translation || '').toLowerCase().includes(q)
    );
  }

  if (!allVocab.length) {
    results.innerHTML = '<div class="nb-link-empty">' + window.t('notebook_no_vocab_found') + '</div>';
    return;
  }

  results.innerHTML = allVocab.map(item => `
    <div class="nb-link-item nb-vocab-link-item ${item.linked ? 'linked' : ''}" data-vocab-id="${item.id}" data-vocab-type="${item.vocabType}">
      <span class="nb-link-check">${item.linked ? '✓' : ''}</span>
      <span class="nb-link-name">${escapeHtml(item.text)}</span>
      <span class="nb-link-section" style="font-size:.75rem">${escapeHtml(item.translation || '')}</span>
    </div>
  `).join('');

  results.querySelectorAll('.nb-vocab-link-item').forEach(item => {
    item.addEventListener('click', () => toggleVocabLinkOnPage(item.dataset.vocabId, item.dataset.vocabType));
  });
}

async function toggleVocabLinkOnPage(vocabId, vocabType) {
  if (!NB.currentPageId) return;
  const lang = NB.lang;

  const section = NB.sections.find(s => s.id === NB.currentSectionId);
  const page = section ? section.pages.find(p => p.id === NB.currentPageId) : null;
  const isLinked = page && page.vocabLinks && page.vocabLinks.some(l => l.vocabId === vocabId);

  try {
    if (isLinked) {
      await window.api('DELETE', '/api/vocab-link', { lang, vocabId, vocabType, pageId: NB.currentPageId });
    } else {
      await window.api('POST', '/api/vocab-link', { lang, vocabId, vocabType, pageId: NB.currentPageId });
    }

    // Reload notebook data
    const notebook = await window.api('GET', '/api/notebook/' + lang);
    NB.notebook = notebook;
    NB.sections = notebook.sections || [];
    NB._vocabCache = null; // invalidate vocab cache

    renderVocabLinksList();
    searchVocabForLink();
    window.toast(isLinked ? window.t('vocab_link_removed') : window.t('vocab_link_added'));
  } catch (e) {
    window.toast(e.error || window.t('common_error'), 'danger');
  }
}

function renderVocabLinksList() {
  const el = NB.el;
  const list = el.querySelector('#nbVocabLinksList');
  const sectionEl = el.querySelector('#nbVocabLinksSection');
  if (!list) return;

  const section = NB.sections.find(s => s.id === NB.currentSectionId);
  const page = section ? section.pages.find(p => p.id === NB.currentPageId) : null;
  const links = (page && page.vocabLinks) || [];

  if (!links.length) {
    sectionEl.classList.add('hidden');
    return;
  }
  sectionEl.classList.remove('hidden');

  list.innerHTML = links.map(l => {
    const text = l.text || '';
    const escapedText = escapeHtml(text);
    const encodedSearch = encodeURIComponent(text);
    return '<span class="nb-vocab-link-chip" title="' + escapeHtml(l.translation || '') + '">' +
      '<span class="nb-vocab-link-chip-text" onclick="window.navigate(\'vocabulary\',{search:\'' + encodedSearch + '\'})">' +
      (l.vocabType === 'phrase' ? '💬 ' : '📝 ') + escapedText +
      '</span>' +
      '<span class="nb-vocab-link-chip-del" onclick="removeVocabLinkFromPage(\'' + escapeHtml(l.vocabId) + '\',\'' + l.vocabType + '\')">✕</span>' +
      '</span>';
  }).join('');
}

window.removeVocabLinkFromPage = async function (vocabId, vocabType) {
  if (!NB.currentPageId) return;
  try {
    await window.api('DELETE', '/api/vocab-link', { lang: NB.lang, vocabId, vocabType, pageId: NB.currentPageId });
    const notebook = await window.api('GET', '/api/notebook/' + NB.lang);
    NB.notebook = notebook;
    NB.sections = notebook.sections || [];
    NB._vocabCache = null; // invalidate vocab cache
    renderVocabLinksList();
    window.toast(window.t('vocab_link_removed'));
  } catch (e) {
    window.toast(e.error || window.t('common_error'), 'danger');
  }
};

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch { return iso; }
}

function nbToast(msg, type) {
  if (window.toast) window.toast(msg, type);
}

// Handle navigation away from notebook
window.addEventListener('beforeunload', () => {
  if (NB.dirty && NB.currentPageId) {
    return true; // Triggers browser confirmation
  }
});

// Clean up on page navigation
const origNavigate = window.navigate;
window.navigate = function (page, params, _fromPopState) {
  if (NB.dirty && NB.currentPageId && page !== 'notebook') {
    saveCurrentPage();
  }
  if (NB.autoSaveInterval) clearInterval(NB.autoSaveInterval);
  const pc = document.getElementById('pageContent');
  if (pc) pc.classList.remove('notebook-active');
  origNavigate.call(window, page, params, _fromPopState);
};

window.renderNotebook = renderNotebook;
