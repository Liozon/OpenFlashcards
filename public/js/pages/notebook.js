// notebook.js – Notebook page with rich text editor, sidebar, tables, page linking
'use strict';

let NB = {};
let NB_docKeydownBound = false;

function renderNotebook(el, params) {
  const lang = params.lang || window.currentLang();
  if (!lang) {
    el.innerHTML = '<p style="padding:40px;text-align:center;color:var(--text-muted)">' + window.t('notebook_no_lang') + '</p>';
    return;
  }

  // Clean up any previous notebook instance
  if (NB.autoSaveInterval) clearInterval(NB.autoSaveInterval);
  NB = { el, lang, notebook: null, sections: [], currentSectionId: null, currentPageId: null, searchQuery: '', dirty: false, editMode: false, stickyEditMode: false };

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
        <button class="nb-sidebar-toggle hidden" id="nbSidebarToggle" title="Collapse sidebar">◀</button>
      </div>
      <button class="nb-sidebar-reopen hidden" id="nbSidebarReopen" title="Expand sidebar">▶</button>
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
            <button class="nb-tb-btn" data-cmd="paragraph" title="${t('notebook_paragraph')}">P</button>
            <span class="nb-tb-sep"></span>
            <input type="color" id="nbTextColor" class="nb-color-picker" value="#439b00" title="${t('notebook_text_color')}">
            <select id="nbFontSize" class="nb-font-size" title="${t('notebook_font_size')}">
              <option value="" disabled hidden>—</option>
              <option value="10">10</option>
              <option value="12">12</option>
              <option value="14">14</option>
              <option value="16">16</option>
              <option value="18">18</option>
              <option value="20">20</option>
              <option value="24">24</option>
              <option value="28">28</option>
              <option value="32">32</option>
              <option value="36">36</option>
              <option value="48">48</option>
            </select>
            <span class="nb-tb-sep"></span>
            <button class="nb-tb-btn" data-cmd="insertUnorderedList" title="${t('notebook_bullet_list')}">◉</button>
            <button class="nb-tb-btn" data-cmd="insertOrderedList" title="${t('notebook_numbered_list')}">⒈</button>
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
            <button class="nb-tb-btn" data-cmd="insertImage" title="${t('notebook_image')}">🖼️</button>
          </div>
          <input type="file" id="nbImageInput" accept="image/*" style="display:none">
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
              <button class="btn btn-sm btn-primary" id="nbSaveBtn">${t('common_save')}</button>
              <button class="btn btn-sm btn-secondary" id="nbSaveCloseBtn">${t('notebook_save_close')}</button>
              <span id="nbEditorStatus">${t('notebook_saved')}</span>
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
        <select id="nbMoveSectionSelect" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text)"></select>
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
  el.querySelector('#nbSidebarToggle').addEventListener('click', toggleSidebar);
  el.querySelector('#nbSidebarReopen').addEventListener('click', toggleSidebar);
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
  el.querySelector('#nbSaveCloseBtn').addEventListener('click', saveAndCloseEdit);
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

  let _fontSelectOpened = false;
  el.querySelector('#nbFontSize').addEventListener('mousedown', function () {
    _fontSelectOpened = true;
  });
  el.querySelector('#nbFontSize').addEventListener('change', function (e) {
    _fontSelectOpened = false;
    if (!e.target.value) return;
    NB._fontSizeApplied = true;
    applyFontSize(e.target.value);
  });
  el.querySelector('#nbFontSize').addEventListener('blur', function () {
    if (_fontSelectOpened && this.value) {
      _fontSelectOpened = false;
      applyFontSize(this.value, true);
    }
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
  initImageResize();
  // Use mousedown instead of click for image selection (Safari fix)
  editor.addEventListener('mousedown', (e) => {
    const img = e.target.closest('.nb-editor-image');
    if (img && NB.editMode) {
      selectImage(img);
      e.preventDefault();
      e.stopPropagation();
    } else if (!e.target.closest('.nb-image-resize-handle')) {
      deselectImage();
    }
  });
  editor.addEventListener('input', markDirty);
  editor.addEventListener('paste', handleEditorPaste);
  editor.addEventListener('copy', (e) => {
    if (NB_selectedImg) {
      e.preventDefault();
      const html = NB_selectedImg.outerHTML;
      e.clipboardData.setData('text/html', html);
      e.clipboardData.setData('text/plain', NB_selectedImg.alt || '');
    }
  });
  editor.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.nb-table-wrapper');
    hideAllTableToolbars();
    if (wrapper && NB.editMode) {
      const tb = wrapper.querySelector('.nb-table-toolbar');
      if (tb) tb.classList.add('visible');
    }
    syncToolbarState();
  });

  let _syncTimer;
  document.addEventListener('selectionchange', () => {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(syncToolbarState, 100);
  });

  el.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentPage();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && NB_selectedImg) {
      e.preventDefault();
      const html = NB_selectedImg.outerHTML;
      const blob = new Blob([html], { type: 'text/html' });
      const plainBlob = new Blob([NB_selectedImg.alt || ''], { type: 'text/plain' });
      if (navigator.clipboard && navigator.clipboard.write) {
        navigator.clipboard.write([
          new ClipboardItem({ 'text/html': blob, 'text/plain': plainBlob })
        ]).catch(() => { });
      }
    }
  });

  // Deselect image on Escape; delete selected image on Delete/Backspace
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { deselectImage(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && NB_selectedImg && NB.editMode) {
      e.preventDefault();
      deleteSelectedImage();
    }
  });

  // Task list keyboard handling: Enter to continue list, Backspace to exit empty item
  editor.addEventListener('keydown', handleTaskListKeydown);

  NB.autoSaveInterval = setInterval(() => { if (NB.dirty) saveCurrentPage(); }, 30000);

  // Document-level 'e' key to switch to edit mode (catches events that don't bubble through el)
  if (!NB_docKeydownBound) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey && !NB.editMode && NB.currentPageId && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        switchToEditMode();
      }
    });
    NB_docKeydownBound = true;
  }

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
    const label = flag + ' ' + l.isoCode.toUpperCase() /* + ' — ' + l.name */;
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
        </div>
        <button class="nb-section-add-btn" data-action="add-page" title="${window.t('notebook_add_page')}">➕</button>
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
            <button class="nb-context-btn" data-action="duplicate-page" title="${window.t('notebook_duplicate')}">📋</button>
              <button class="nb-context-btn" data-action="move-page" title="${window.t('notebook_move')}">📤</button>
              ${pi > 0 ? `<button class="nb-context-btn" data-action="page-up" title="${window.t('notebook_move_up')}">⬆️</button>` : ''}
              ${pi < totalPages - 1 ? `<button class="nb-context-btn" data-action="page-down" title="${window.t('notebook_move_down')}">⬇️</button>` : ''}
              <button class="nb-context-btn" data-action="rename-page" title="${window.t('notebook_rename')}">✏️</button>
              <button class="nb-context-btn" data-action="page-color" title="${window.t('notebook_color')}">🎨</button>              
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
  if (header && !e.target.closest('.nb-section-actions') && !e.target.closest('[data-action]')) {
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
    const color = NB_COLORS[Math.floor(Math.random() * NB_COLORS.length)];
    const data = await window.api('POST', `/api/notebook/${NB.lang}/sections`, { name: name.trim(), color });
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
    const section = NB.sections.find(s => s.id === sectionId);
    const body = { name: name.trim() };
    if (section && section.color) body.color = section.color;
    const data = await window.api('POST', `/api/notebook/${NB.lang}/sections/${sectionId}/pages`, body);
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
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await tableAction(table, btn.dataset.tableAction);
      });
    });
  });
  initTableResize();
}

function switchToReadMode() {
  NB.editMode = false;
  NB.stickyEditMode = false;
  deselectImage();
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
  NB.stickyEditMode = true;
  const el = NB.el;
  el.querySelector('#nbReadHeader').classList.add('hidden');
  el.querySelector('#nbToolbar').classList.remove('hidden');
  el.querySelector('#nbPageHeader').classList.remove('hidden');
  el.querySelector('#nbEditor').setAttribute('contenteditable', 'true');
  el.querySelector('#nbEditor').classList.remove('nb-editor-readonly');
  el.querySelector('#nbEditorFooterLeft').classList.remove('hidden');
  updateEditorStatus();
  el.querySelector('#nbPageHeader').querySelector('#nbPageTitle').focus();
  restoreTaskListBehaviour();
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
  el.querySelector('#nbSidebarToggle').classList.remove('hidden');
  el.querySelector('#nbSidebarToggle').textContent = window.innerWidth <= 768 ? '▲' : '◀';
  el.querySelector('#nbPageTitle').value = page.name;
  el.querySelector('#nbEditor').innerHTML = page.content || '';
  restoreTaskListBehaviour();
  rebindTableToolbars();
  initTableResize();
  el.querySelector('#nbPageMeta').textContent = window.t('notebook_last_updated') + ': ' + formatDate(page.updatedAt);
  NB.dirty = false;
  updateEditorStatus();
  renderSidebar();
  renderVocabLinksList();

  // Set mode: sticky edit mode keeps edit active across pages;
  // empty/new pages always enter edit mode; content pages open in read mode when not sticky.
  const hasContent = page.content && page.content.trim().length > 0 && page.content !== '<br>';
  if (NB.stickyEditMode) {
    switchToEditMode();
  } else if (hasContent) {
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
  el.querySelector('#nbSidebarToggle').classList.add('hidden');
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

async function saveAndCloseEdit() {
  await saveCurrentPage();
  switchToReadMode();
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

function applyFontSize(size, skipFocus) {
  const editor = NB.editor;
  if (!editor) return;
  if (!skipFocus) editor.focus();
  const px = parseInt(size, 10);
  if (isNaN(px)) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) {
    const block = range.startContainer?.parentElement?.closest?.('p, h1, h2, h3, h4, h5, h6, li, div, td, th') || range.startContainer?.parentElement;
    if (block) block.style.fontSize = px + 'px';
    markDirty();
    return;
  }
  const fragment = range.extractContents();
  fragment.querySelectorAll('[style*="font-size"]').forEach(el => {
    el.style.fontSize = '';
    if (el.style.length === 0) el.removeAttribute('style');
  });

  let p = range.startContainer;
  while (p && p !== editor && p.tagName === 'SPAN' && !p.textContent.trim()) {
    const next = p.parentElement;
    p.remove();
    p = next;
  }

  const span = document.createElement('span');
  span.style.fontSize = px + 'px';
  span.appendChild(fragment);
  range.insertNode(span);
  markDirty();
}

const HEADING_CMDS = ['heading1', 'heading2', 'heading3', 'heading4', 'paragraph'];
const FORMAT_CMDS = ['bold', 'italic', 'underline', 'strikeThrough'];

function syncToolbarState() {
  if (NB._fontSizeApplied) { NB._fontSizeApplied = false; return; }

  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  if (!NB.editor?.contains(sel.anchorNode)) return;

  const node = sel.anchorNode;
  const el = node.nodeType === 3 ? node.parentElement : node;

  FORMAT_CMDS.forEach(cmd => {
    const btn = document.querySelector(`.nb-tb-btn[data-cmd="${cmd}"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });

  const block = el.closest('h1, h2, h3, h4, p');
  HEADING_CMDS.forEach(cmd => {
    const btn = document.querySelector(`.nb-tb-btn[data-cmd="${cmd}"]`);
    if (btn) btn.classList.toggle('active', block?.tagName?.toLowerCase() === cmd.replace('heading', 'h'));
  });

  const range = sel.getRangeAt(0);
  const sNode = range.startContainer;
  const eNode = range.endContainer;
  const sParent = sNode.nodeType === 3 ? sNode.parentElement : sNode;
  const eParent = eNode.nodeType === 3 ? eNode.parentElement : eNode;
  const sSize = sParent?.closest?.('[style*="font-size"]');
  const eSize = eParent?.closest?.('[style*="font-size"]');

  const select = document.getElementById('nbFontSize');
  if (!select) return;

  if (sSize !== eSize) { select.selectedIndex = 0; return; }

  if (sSize) {
    const px = parseFloat(sSize.style.fontSize);
    if (!isNaN(px)) {
      const opts = [...select.options].map(o => parseInt(o.value, 10)).filter(v => !isNaN(v));
      const closest = opts.reduce((a, b) => Math.abs(a - px) < Math.abs(b - px) ? a : b);
      select.value = String(closest);
      return;
    }
  }

  select.selectedIndex = 0;
}

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
    case 'paragraph': document.execCommand('formatBlock', false, 'p'); break;
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
    case 'insertImage': insertImage(); break;
  }
  markDirty();
}

// ── Task list ──────────────────────────────────────────────

function insertTaskList() {
  const editor = NB.editor;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const ul = document.createElement('ul');
  ul.className = 'nb-task-list';
  const li = document.createElement('li');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'nb-task-checkbox';
  li.appendChild(cb);
  const text = document.createTextNode('\u200B');
  li.appendChild(text);
  ul.appendChild(li);
  const range = sel.getRangeAt(0);
  range.deleteContents();
  // Insert at cursor and position inside the li text
  range.insertNode(ul);
  sel.removeAllRanges();
  const r = document.createRange();
  r.setStart(li, 1);
  r.collapse(true);
  sel.addRange(r);
  editor.focus();
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

function isTaskItemEmpty(li) {
  for (const n of li.childNodes) {
    if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) return false;
    if (n.nodeType === Node.ELEMENT_NODE && !n.classList.contains('nb-task-checkbox')) return false;
  }
  return true;
}

function handleTaskListKeydown(e) {
  if (e.key !== 'Enter' && e.key !== 'Backspace') return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const start = sel.getRangeAt(0).startContainer;
  const li = start.nodeType === Node.TEXT_NODE ? start.parentElement?.closest('li') : start?.closest?.('li');
  if (!li) return;
  const ul = li.closest('.nb-task-list');
  if (!ul) return;

  const empty = isTaskItemEmpty(li);

  if (e.key === 'Backspace') {
    if (!empty) return;
    e.preventDefault();
    const prev = li.previousElementSibling;
    li.remove();
    if (!ul.children.length) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      ul.replaceWith(p);
      placeCursorAtStart(p);
    } else if (prev) {
      placeCursorAtEnd(prev);
    } else {
      placeCursorAtStart(ul.querySelector('li'));
    }
    markDirty();
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    if (empty) {
      const next = li.nextElementSibling;
      li.remove();
      if (!ul.children.length) {
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        ul.replaceWith(p);
        placeCursorAtStart(p);
      } else if (next) {
        placeCursorAtStart(next);
      } else {
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        ul.parentNode.insertBefore(p, ul.nextSibling);
        placeCursorAtStart(p);
      }
    } else {
      const range = sel.getRangeAt(0);
      const afterRange = document.createRange();
      afterRange.setStart(range.endContainer, range.endOffset);
      afterRange.setEnd(li, li.childNodes.length);
      const afterFrag = afterRange.extractContents();

      const newLi = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'nb-task-checkbox';
      newLi.appendChild(cb);
      newLi.appendChild(afterFrag);
      if (!newLi.lastChild || newLi.lastChild.nodeType !== Node.TEXT_NODE) {
        newLi.appendChild(document.createTextNode(''));
      }

      li.parentNode.insertBefore(newLi, li.nextSibling);
      placeCursorAtStart(newLi);
    }
    markDirty();
  }
}

function placeCursorAtStart(node) {
  const sel = window.getSelection();
  const range = document.createRange();
  const cb = node.querySelector('.nb-task-checkbox');
  const offset = cb ? Array.from(node.childNodes).indexOf(cb) + 1 : 0;
  range.setStart(node, offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  node.closest?.('[contenteditable]')?.focus();
}

function placeCursorAtEnd(node) {
  const sel = window.getSelection();
  const range = document.createRange();
  range.setStart(node, node.childNodes.length);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  node.closest?.('[contenteditable]')?.focus();
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
  const sel = window.getSelection();
  NB._savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  NB.el.querySelector('#nbTableModal').classList.remove('hidden');
}

function insertTable() {
  const el = NB.el;
  el.querySelector('#nbTableModal').classList.add('hidden');
  const editor = NB.editor;
  if (!editor) return;
  if (NB._savedRange) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(NB._savedRange);
    NB._savedRange = null;
  }
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
    <span class="nb-tb-sep"></span>
    <button class="nb-tb-btn btn-sm" data-table-action="add-row-above" title="${window.t('notebook_add_row_above')}">↑ +</button>
    <button class="nb-tb-btn btn-sm" data-table-action="add-row-below" title="${window.t('notebook_add_row_below')}">↓ +</button>
    <span class="nb-tb-sep"></span>
    <button class="nb-tb-btn btn-sm" data-table-action="add-col-left" title="${window.t('notebook_add_col_left')}">← +</button>
    <button class="nb-tb-btn btn-sm" data-table-action="add-col-right" title="${window.t('notebook_add_col_right')}">→ +</button>
    <span class="nb-tb-sep"></span>
    <button class="nb-tb-btn btn-sm" data-table-action="toggle-row-header" title="${window.t('notebook_header_row')}">R↕</button>
    <button class="nb-tb-btn btn-sm" data-table-action="toggle-col-header" title="${window.t('notebook_header_col')}">C↔</button>
    <span class="nb-tb-sep"></span>
    <button class="nb-tb-btn btn-sm" data-table-action="del-row">${window.t('notebook_del_row')}</button>
    <button class="nb-tb-btn btn-sm" data-table-action="del-col">${window.t('notebook_del_col')}</button>
    <span class="nb-tb-sep"></span>
    <button class="nb-tb-btn btn-sm" data-table-action="add-cell" title="${window.t('notebook_add_cell')}">${window.t('notebook_add_cell')}</button>
    <button class="nb-tb-btn btn-sm" data-table-action="del-cell" title="${window.t('notebook_del_cell')}">${window.t('notebook_del_cell')}</button>
    <span class="nb-tb-sep"></span>
    <button class="nb-tb-btn btn-sm" data-table-action="del-table">🗑️</button>
  `;
  wrapper.appendChild(tblToolbar);
  wrapper.appendChild(table);

  insertNodeAtCursor(wrapper);

  // Bind table toolbar
  tblToolbar.querySelectorAll('[data-table-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await tableAction(wrapper.querySelector('table'), btn.dataset.tableAction);
    });
  });

  initTableResize();
  markDirty();
}

function cellHasContent(cell) {
  const text = cell.textContent.replace(/\u00A0/g, '').trim();
  if (text.length > 0) return true;
  return cell.querySelector('img, video, audio, iframe, canvas, object, embed, svg, input, textarea, select') !== null;
}

function checkRowContent(tr) {
  return Array.from(tr.children).some(cellHasContent);
}

function checkColContent(table, colIndex) {
  return Array.from(table.querySelectorAll('tr')).some(tr => {
    const cell = tr.children[colIndex];
    return cell && cellHasContent(cell);
  });
}

function checkTableContent(table) {
  return Array.from(table.querySelectorAll('tr')).some(checkRowContent);
}

function getCursorCell(table) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.getRangeAt(0).startContainer;
  while (node && node !== table && node !== document) {
    if (node.tagName === 'TD' || node.tagName === 'TH') return node;
    node = node.parentElement;
  }
  return null;
}

async function tableAction(table, action) {
  const rows = table.querySelectorAll('tr');
  if (!rows.length) return;
  const cellCount = rows[0].children.length;

  const hasHeaderRow = rows.length > 0 && rows[0].children[0].tagName === 'TH';
  const hasHeaderCol = rows.length > 1 && rows[1] && rows[1].children[0] && rows[1].children[0].tagName === 'TH';

  const makeRow = () => {
    const tr = document.createElement('tr');
    for (let c = 0; c < cellCount; c++) {
      const tag = c === 0 && hasHeaderCol ? 'TH' : 'TD';
      const td = document.createElement(tag);
      td.innerHTML = '&nbsp;';
      td.contentEditable = 'true';
      tr.appendChild(td);
    }
    return tr;
  };
  const makeCell = (ri) => {
    const tag = ri === 0 && hasHeaderRow ? 'TH' : 'TD';
    const td = document.createElement(tag);
    td.innerHTML = '&nbsp;';
    td.contentEditable = 'true';
    return td;
  };

  switch (action) {
    case 'add-row-above': {
      const cursorCell = getCursorCell(table);
      let refRow = cursorCell ? cursorCell.parentElement : rows[0];
      if (refRow === rows[0] && rows[0].children[0].tagName === 'TH') {
        refRow = rows[1];
        if (!refRow) return;
      }
      table.insertBefore(makeRow(), refRow);
      break;
    }
    case 'add-row-below': {
      const cursorCell = getCursorCell(table);
      const refRow = cursorCell ? cursorCell.parentElement : rows[rows.length - 1];
      refRow.insertAdjacentElement('afterend', makeRow());
      break;
    }
    case 'add-col-left': {
      const cursorCell = getCursorCell(table);
      const colIndex = cursorCell ? cursorCell.cellIndex : 0;
      rows.forEach((tr, ri) => tr.insertBefore(makeCell(ri), tr.children[colIndex]));
      break;
    }
    case 'add-col-right': {
      const cursorCell = getCursorCell(table);
      const colIndex = cursorCell ? cursorCell.cellIndex + 1 : cellCount;
      rows.forEach((tr, ri) => {
        const ref = tr.children[colIndex];
        if (ref) tr.insertBefore(makeCell(ri), ref);
        else tr.appendChild(makeCell(ri));
      });
      break;
    }
    case 'toggle-row-header': {
      const firstRow = rows[0];
      if (!firstRow) return;
      const isHeader = firstRow.children[0].tagName === 'TH';
      Array.from(firstRow.children).forEach(cell => {
        const tag = isHeader ? 'TD' : 'TH';
        const newCell = document.createElement(tag);
        newCell.innerHTML = cell.innerHTML;
        newCell.contentEditable = 'true';
        if (cell.style.cssText) newCell.style.cssText = cell.style.cssText;
        cell.replaceWith(newCell);
      });
      break;
    }
    case 'toggle-col-header': {
      rows.forEach(tr => {
        const cell = tr.children[0];
        if (!cell) return;
        const isHeader = cell.tagName === 'TH';
        const tag = isHeader ? 'TD' : 'TH';
        const newCell = document.createElement(tag);
        newCell.innerHTML = cell.innerHTML;
        newCell.contentEditable = 'true';
        if (cell.style.cssText) newCell.style.cssText = cell.style.cssText;
        cell.replaceWith(newCell);
      });
      break;
    }
    case 'del-row': {
      if (rows.length <= 1) return;
      const cursorCell = getCursorCell(table);
      const tr = cursorCell ? cursorCell.parentElement : rows[rows.length - 1];
      if (checkRowContent(tr)) {
        const ok = await window.confirmModal(window.t('notebook_del_row_confirm'), { confirmLabel: window.t('common_delete') });
        if (!ok) return;
      }
      tr.remove();
      break;
    }
    case 'del-col': {
      if (cellCount <= 1) return;
      const cursorCell = getCursorCell(table);
      const colIndex = cursorCell ? cursorCell.cellIndex : cellCount - 1;
      if (checkColContent(table, colIndex)) {
        const ok = await window.confirmModal(window.t('notebook_del_col_confirm'), { confirmLabel: window.t('common_delete') });
        if (!ok) return;
      }
      rows.forEach(tr => {
        const td = tr.children[colIndex];
        if (td) td.remove();
      });
      break;
    }
    case 'del-cell': {
      const cursorCell = getCursorCell(table);
      if (!cursorCell) return;
      cursorCell.innerHTML = '&nbsp;';
      cursorCell.classList.add('nb-cell-deleted');
      break;
    }
    case 'add-cell': {
      const cursorCell = getCursorCell(table);
      if (!cursorCell) return;
      cursorCell.classList.remove('nb-cell-deleted');
      cursorCell.innerHTML = '&nbsp;';
      break;
    }
    case 'del-table': {
      if (checkTableContent(table)) {
        const ok = await window.confirmModal(window.t('notebook_del_table_confirm'), { confirmLabel: window.t('common_delete') });
        if (!ok) return;
      }
      const wrapper = table.closest('.nb-table-wrapper');
      if (wrapper) wrapper.remove();
      else table.remove();
      return; // no reinit needed
    }
  }
  reinitTableResize(table);
  markDirty();
}

// ── Table column & row resize ─────────────────────────────

let NB_colResizeState = null;
let NB_rowResizeState = null;

function initTableResize() {
  const editor = NB.editor;
  if (!editor) return;
  editor.querySelectorAll('.nb-editor-table').forEach(table => {
    if (table._resizeInit) return;
    table._resizeInit = true;
    setupTableResize(table);
  });
}

function reinitTableResize(table) {
  table.querySelectorAll('.nb-col-resize-handle, .nb-row-resize-handle').forEach(h => h.remove());
  table._resizeInit = true;
  setupTableResize(table);
}

function setupTableResize(table) {
  const rows = table.querySelectorAll('tr');
  if (!rows.length) return;

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].children;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      cell.style.position = 'relative';

      const colHandle = document.createElement('div');
      colHandle.className = 'nb-col-resize-handle';
      colHandle.dataset.col = i;
      colHandle.dataset.row = r;
      colHandle.addEventListener('mousedown', onColResizeStart);
      colHandle.addEventListener('touchstart', onResizeTouchStart, { passive: false });
      colHandle.addEventListener('mouseenter', () => highlightCol(table, i, true));
      colHandle.addEventListener('mouseleave', () => highlightCol(table, i, false));
      cell.appendChild(colHandle);

      if (r < rows.length - 1) {
        const rowHandle = document.createElement('div');
        rowHandle.className = 'nb-row-resize-handle';
        rowHandle.dataset.row = r;
        rowHandle.dataset.col = i;
        rowHandle.addEventListener('mousedown', onRowResizeStart);
        rowHandle.addEventListener('touchstart', onResizeTouchStart, { passive: false });
        rowHandle.addEventListener('mouseenter', () => highlightRow(table, r, true));
        rowHandle.addEventListener('mouseleave', () => highlightRow(table, r, false));
        cell.appendChild(rowHandle);
      }
    }
  }
}

function highlightCol(table, col, show) {
  table.querySelectorAll(`.nb-col-resize-handle[data-col="${col}"]`).forEach(h => h.classList.toggle('col-hover', show));
}

function highlightRow(table, row, show) {
  table.querySelectorAll(`.nb-row-resize-handle[data-row="${row}"]`).forEach(h => h.classList.toggle('row-hover', show));
}

function onColResizeStart(e) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  const cell = handle.parentElement;
  const table = cell.closest('.nb-editor-table');
  // Free table from width:100% so it can shrink when columns are narrowed
  if (!table._widthFreed) {
    table._widthFreed = true;
    table.style.width = 'auto';
  }
  const colIndex = parseInt(handle.dataset.col);
  const rows = table.querySelectorAll('tr');

  NB_colResizeState = {
    table, colIndex, rows,
    startX: e.clientX,
    startWidths: []
  };

  rows.forEach(tr => {
    const td = tr.children[colIndex];
    NB_colResizeState.startWidths.push(td ? td.getBoundingClientRect().width : 0);
  });

  document.addEventListener('mousemove', onColResizeMove);
  document.addEventListener('mouseup', onColResizeEnd);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  document.body.style.pointerEvents = 'none';
  handle.classList.add('active');
}

function onColResizeMove(e) {
  if (!NB_colResizeState) return;
  const { rows, colIndex, startX, startWidths } = NB_colResizeState;
  const dx = e.clientX - startX;

  rows.forEach((tr, ri) => {
    const td = tr.children[colIndex];
    if (td) {
      const w = Math.max(30, startWidths[ri] + dx);
      td.style.width = w + 'px';
    }
  });
}

function onColResizeEnd() {
  if (NB_colResizeState) markDirty();
  NB_colResizeState = null;
  document.removeEventListener('mousemove', onColResizeMove);
  document.removeEventListener('mouseup', onColResizeEnd);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  document.body.style.pointerEvents = '';
  document.querySelectorAll('.nb-col-resize-handle.active').forEach(h => h.classList.remove('active'));
}

function onRowResizeStart(e) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  const cell = handle.parentElement;
  const tr = cell.parentElement;
  const table = tr.closest('.nb-editor-table');
  const rowIndex = parseInt(handle.dataset.row);
  const rows = table.querySelectorAll('tr');
  const targetRow = rows[rowIndex];
  if (!targetRow) return;

  NB_rowResizeState = {
    table, rowIndex,
    startY: e.clientY,
    startHeight: targetRow.getBoundingClientRect().height
  };

  document.addEventListener('mousemove', onRowResizeMove);
  document.addEventListener('mouseup', onRowResizeEnd);
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
  document.body.style.pointerEvents = 'none';
  handle.classList.add('active');
}

function onRowResizeMove(e) {
  if (!NB_rowResizeState) return;
  const dy = e.clientY - NB_rowResizeState.startY;
  const newH = Math.max(20, NB_rowResizeState.startHeight + dy);
  const rows = NB_rowResizeState.table.querySelectorAll('tr');
  const targetRow = rows[NB_rowResizeState.rowIndex];
  targetRow.style.height = newH + 'px';
  targetRow.querySelectorAll('td, th').forEach(cell => {
    cell.style.height = newH + 'px';
  });
}

function onRowResizeEnd() {
  if (NB_rowResizeState) markDirty();
  NB_rowResizeState = null;
  document.removeEventListener('mousemove', onRowResizeMove);
  document.removeEventListener('mouseup', onRowResizeEnd);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  document.body.style.pointerEvents = '';
  document.querySelectorAll('.nb-row-resize-handle.active').forEach(h => h.classList.remove('active'));
}

function onResizeTouchStart(e) {
  const touch = e.touches[0];
  const me = new MouseEvent('mousedown', {
    clientX: touch.clientX,
    clientY: touch.clientY,
    button: 0
  });
  e.currentTarget.dispatchEvent(me);
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

// ── Images ─────────────────────────────────────────────────

function insertImage() {
  const el = NB.el;
  const input = el.querySelector('#nbImageInput');
  input.value = '';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      nbToast(window.t('notebook_image_too_large'), 'danger');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      try {
        const res = await window.api('POST', `/api/notebook/${NB.lang}/images`, { image: dataUrl });
        const editor = NB.editor;
        if (!editor) return;
        editor.focus();
        const img = document.createElement('img');
        img.src = res.url;
        img.alt = file.name;
        img.className = 'nb-editor-image';
        img.style.maxWidth = '100%';
        insertNodeAtCursor(img);
        markDirty();
      } catch (err) {
        nbToast(err.error || window.t('common_error'), 'danger');
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

async function pasteImageFromClipboard(file) {
  if (file.size > 10 * 1024 * 1024) {
    nbToast(window.t('notebook_image_too_large'), 'danger');
    return;
  }
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    try {
      const res = await window.api('POST', `/api/notebook/${NB.lang}/images`, { image: dataUrl });
      const editor = NB.editor;
      if (!editor) return;
      editor.focus();
      const img = document.createElement('img');
      img.src = res.url;
      img.alt = 'pasted image';
      img.className = 'nb-editor-image';
      img.style.maxWidth = '100%';
      insertNodeAtCursor(img);
      markDirty();
    } catch (err) {
      nbToast(err.error || window.t('common_error'), 'danger');
    }
  };
  reader.readAsDataURL(file);
}

// ── Image resize (8 handles, Shift for aspect ratio) ────────

let NB_selectedImg = null;
let NB_resizeOverlay = null;
let NB_resizeState = null;

function initImageResize() {
  if (NB_resizeOverlay) return;
  const editor = NB.editor;
  if (!editor) return;

  NB_resizeOverlay = document.createElement('div');
  NB_resizeOverlay.className = 'nb-image-resize-overlay';
  NB_resizeOverlay.contentEditable = 'false';
  ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(pos => {
    const h = document.createElement('div');
    h.className = 'nb-image-resize-handle';
    h.dataset.pos = pos;
    h.contentEditable = 'false';
    NB_resizeOverlay.appendChild(h);
  });
  editor.parentNode.appendChild(NB_resizeOverlay);

  editor.addEventListener('scroll', repositionOverlay);
  window.addEventListener('resize', repositionOverlay);
}

function selectImage(img) {
  deselectImage();
  NB_selectedImg = img;
  NB_resizeOverlay.classList.add('visible');
  repositionOverlay();

  NB_resizeOverlay.querySelectorAll('.nb-image-resize-handle').forEach(h => {
    h.addEventListener('mousedown', onHandleMouseDown);
  });
}

function deselectImage() {
  NB_selectedImg = null;
  NB_resizeState = null;
  if (NB_resizeOverlay) NB_resizeOverlay.classList.remove('visible');
}

function repositionOverlay() {
  if (!NB_selectedImg || !NB_resizeOverlay) return;
  const imgRect = NB_selectedImg.getBoundingClientRect();
  const containerRect = NB_resizeOverlay.parentNode.getBoundingClientRect();
  NB_resizeOverlay.style.left = (imgRect.left - containerRect.left) + 'px';
  NB_resizeOverlay.style.top = (imgRect.top - containerRect.top) + 'px';
  NB_resizeOverlay.style.width = imgRect.width + 'px';
  NB_resizeOverlay.style.height = imgRect.height + 'px';
}

function onHandleMouseDown(e) {
  e.preventDefault();
  e.stopPropagation();
  const img = NB_selectedImg;
  if (!img) return;
  const ml = parseFloat(img.style.marginLeft) || 0;
  const mt = parseFloat(img.style.marginTop) || 0;
  NB_resizeState = {
    img,
    startX: e.clientX,
    startY: e.clientY,
    startW: img.offsetWidth,
    startH: img.offsetHeight,
    startML: ml,
    startMT: mt,
    pos: e.currentTarget.dataset.pos
  };
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
}

function onResizeMove(e) {
  const s = NB_resizeState;
  if (!s) return;
  const dx = e.clientX - s.startX;
  const dy = e.clientY - s.startY;
  const ratio = s.startW / s.startH;
  const shift = e.shiftKey;

  let newW, newH;

  switch (s.pos) {
    case 'se': newW = s.startW + dx; newH = s.startH + dy; break;
    case 'sw': newW = s.startW - dx; newH = s.startH + dy; break;
    case 'ne': newW = s.startW + dx; newH = s.startH - dy; break;
    case 'nw': newW = s.startW - dx; newH = s.startH - dy; break;
    case 'e': newW = s.startW + dx; newH = s.startH; break;
    case 'w': newW = s.startW - dx; newH = s.startH; break;
    case 's': newW = s.startW; newH = s.startH + dy; break;
    case 'n': newW = s.startW; newH = s.startH - dy; break;
  }

  if (shift && ['nw', 'ne', 'se', 'sw'].includes(s.pos)) {
    if (Math.abs(dx / s.startW) > Math.abs(dy / s.startH)) {
      newH = newW / ratio;
    } else {
      newW = newH * ratio;
    }
  } else if (shift) {
    if (s.pos === 'e' || s.pos === 'w') newH = newW / ratio;
    else newW = newH * ratio;
  }

  newW = Math.max(30, newW);
  newH = Math.max(30, newH);

  const dw = newW - s.startW;
  const dh = newH - s.startH;
  let ml = s.startML, mt = s.startMT;

  // Compensate position so the edge opposite the handle stays fixed
  if (['nw', 'sw', 'w'].includes(s.pos)) ml = s.startML - dw;
  if (['nw', 'ne', 'n'].includes(s.pos)) mt = s.startMT - dh;

  s.img.style.width = newW + 'px';
  s.img.style.height = newH + 'px';
  s.img.style.marginLeft = ml + 'px';
  s.img.style.marginTop = mt + 'px';
  repositionOverlay();
}

function onResizeEnd() {
  if (NB_resizeState && NB_resizeState.img) markDirty();
  NB_resizeState = null;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
}

async function deleteSelectedImage() {
  const img = NB_selectedImg;
  if (!img || !NB.editMode) return;
  const src = img.getAttribute('src') || '';
  const match = src.match(/\/images\/([^/]+)$/);
  const filename = match ? match[1] : null;
  try {
    if (filename) {
      const lang = NB.lang;
      await window.api('DELETE', `/api/notebook/${lang}/images/${encodeURIComponent(filename)}`);
    }
  } catch (err) {
    // File may already be deleted or not exist; proceed with DOM removal anyway
  }
  img.remove();
  deselectImage();
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

function toggleSidebar() {
  const el = NB.el;
  const layout = el.querySelector('.notebook-layout');
  const toggleBtn = el.querySelector('#nbSidebarToggle');
  const reopenBtn = el.querySelector('#nbSidebarReopen');
  const isMobile = window.innerWidth <= 768;
  layout.classList.toggle('nb-sidebar-collapsed');
  const collapsed = layout.classList.contains('nb-sidebar-collapsed');
  toggleBtn.textContent = collapsed ? (isMobile ? '▼' : '▶') : (isMobile ? '▲' : '◀');
  toggleBtn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  reopenBtn.classList.toggle('hidden', !collapsed || isMobile);
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

const NB_COLORS = ['#D7263D', '#F46036', '#F6AE2D', '#C5D86D', '#2E933C', '#1B998B', '#2D7DD2', '#3B60E4', '#6A4C93', '#9D4EDD', '#C77DFF', '#F15BB5', '#FF006E', '#00BBF9', '#00F5D4', '#8D99AE', '#6D597A', '#A44A3F'];

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

  // If pasting HTML that contains notebook images (copied from within the editor),
  // let the browser handle it natively to preserve existing URLs without re-upload
  if (html && /<img[^>]+src="\/api\/notebook\//i.test(html)) {
    return;
  }

  // Handle image paste from clipboard (external images)
  const imageFiles = Array.from(e.clipboardData.files || []).filter(f => f.type.startsWith('image/'));
  if (imageFiles.length) {
    e.preventDefault();
    pasteImageFromClipboard(imageFiles[0]);
    return;
  }
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
        <span class="nb-tb-sep"></span>
        <button class="nb-tb-btn btn-sm" data-table-action="add-row-above" title="${window.t('notebook_add_row_above')}">↑ +</button>
        <button class="nb-tb-btn btn-sm" data-table-action="add-row-below" title="${window.t('notebook_add_row_below')}">↓ +</button>
        <span class="nb-tb-sep"></span>
        <button class="nb-tb-btn btn-sm" data-table-action="add-col-left" title="${window.t('notebook_add_col_left')}">← +</button>
        <button class="nb-tb-btn btn-sm" data-table-action="add-col-right" title="${window.t('notebook_add_col_right')}">→ +</button>
        <span class="nb-tb-sep"></span>
        <button class="nb-tb-btn btn-sm" data-table-action="toggle-row-header" title="${window.t('notebook_header_row')}">R↕</button>
        <button class="nb-tb-btn btn-sm" data-table-action="toggle-col-header" title="${window.t('notebook_header_col')}">C↔</button>
        <span class="nb-tb-sep"></span>
        <button class="nb-tb-btn btn-sm" data-table-action="del-row">${window.t('notebook_del_row')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="del-col">${window.t('notebook_del_col')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="del-table">🗑️</button>
      `;
      tblWrapper.appendChild(tblToolbar);
      tblWrapper.appendChild(table);
      tblToolbar.querySelectorAll('[data-table-action]').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          await tableAction(tblWrapper.querySelector('table'), btn.dataset.tableAction);
        });
      });
      insertNodeAtCursor(tblWrapper);
      initTableResize();
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
        <span class="nb-tb-sep"></span>
        <button class="nb-tb-btn btn-sm" data-table-action="add-row-above" title="${window.t('notebook_add_row_above')}">↑ +</button>
        <button class="nb-tb-btn btn-sm" data-table-action="add-row-below" title="${window.t('notebook_add_row_below')}">↓ +</button>
        <span class="nb-tb-sep"></span>
        <button class="nb-tb-btn btn-sm" data-table-action="add-col-left" title="${window.t('notebook_add_col_left')}">← +</button>
        <button class="nb-tb-btn btn-sm" data-table-action="add-col-right" title="${window.t('notebook_add_col_right')}">→ +</button>
        <span class="nb-tb-sep"></span>
        <button class="nb-tb-btn btn-sm" data-table-action="toggle-row-header" title="${window.t('notebook_header_row')}">R↕</button>
        <button class="nb-tb-btn btn-sm" data-table-action="toggle-col-header" title="${window.t('notebook_header_col')}">C↔</button>
        <span class="nb-tb-sep"></span>
        <button class="nb-tb-btn btn-sm" data-table-action="del-row">${window.t('notebook_del_row')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="del-col">${window.t('notebook_del_col')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="del-table">🗑️</button>
      `;
        tblWrapper.appendChild(tblToolbar);
        tblWrapper.appendChild(table);
        tblToolbar.querySelectorAll('[data-table-action]').forEach(btn => {
          btn.addEventListener('click', async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            await tableAction(tblWrapper.querySelector('table'), btn.dataset.tableAction);
          });
        });
        insertNodeAtCursor(tblWrapper);
        initTableResize();
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
        <span class="nb-tb-sep"></span>
        <button class="nb-tb-btn btn-sm" data-table-action="add-row-above" title="${window.t('notebook_add_row_above')}">↑ +</button>
        <button class="nb-tb-btn btn-sm" data-table-action="add-row-below" title="${window.t('notebook_add_row_below')}">↓ +</button>
        <span class="nb-tb-sep"></span>
        <button class="nb-tb-btn btn-sm" data-table-action="add-col-left" title="${window.t('notebook_add_col_left')}">← +</button>
        <button class="nb-tb-btn btn-sm" data-table-action="add-col-right" title="${window.t('notebook_add_col_right')}">→ +</button>
        <span class="nb-tb-sep"></span>
        <button class="nb-tb-btn btn-sm" data-table-action="toggle-row-header" title="${window.t('notebook_header_row')}">R↕</button>
        <button class="nb-tb-btn btn-sm" data-table-action="toggle-col-header" title="${window.t('notebook_header_col')}">C↔</button>
        <span class="nb-tb-sep"></span>
        <button class="nb-tb-btn btn-sm" data-table-action="del-row">${window.t('notebook_del_row')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="del-col">${window.t('notebook_del_col')}</button>
        <button class="nb-tb-btn btn-sm" data-table-action="del-table">🗑️</button>
      `;
      tblWrapper.appendChild(tblToolbar);
      tblWrapper.appendChild(table);
      tblToolbar.querySelectorAll('[data-table-action]').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          await tableAction(tblWrapper.querySelector('table'), btn.dataset.tableAction);
        });
      });
      insertNodeAtCursor(tblWrapper);
      initTableResize();
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
