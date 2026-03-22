// pages/home.js
'use strict';

async function renderHome(el) {
  const lang = currentLang();
  if (!lang) { navigate('settings'); return; }

  el.innerHTML = `
    <div class="page-title">🏠 Home</div>
    <div id="statsGrid" class="stats-grid">
      <div class="stat-card"><div class="spinner" style="width:24px;height:24px"></div></div>
    </div>
    <div class="quick-actions">
      <button class="btn btn-primary" onclick="navigate('add')">➕ Add words</button>
      <button class="btn btn-secondary" onclick="navigate('train')">🎯 Practice</button>
      <button class="btn btn-secondary" onclick="navigate('vocabulary')">📚 Vocabulary</button>
    </div>
    <div class="card">
      <h3 style="margin-bottom:12px;font-size:1rem">Active language</h3>
      <div id="langSwitcherHome"></div>
    </div>`;

  // Lang switcher
  const switchEl = document.getElementById('langSwitcherHome');
  const langs    = App.config.targetLangs || [];
  switchEl.innerHTML = `<div class="type-filter" style="flex-wrap:wrap">` +
    langs.map(l =>
      `<button class="type-btn ${l.isoCode === lang ? 'active' : ''}" onclick="switchLang('${l.isoCode}')">
        ${l.flag||'🌐'} ${l.name}
      </button>`
    ).join('') +
    `<button class="btn btn-sm btn-secondary" onclick="navigate('settings')" style="margin-left:4px">+ More</button>` +
    `</div>`;

  // Stats
  try {
    const stats = await api('GET', '/api/stats?lang=' + encodeURIComponent(lang));
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card"><div class="stat-number">${stats.totalWords}</div><div class="stat-label">Total words</div></div>
      <div class="stat-card"><div class="stat-number">${stats.totalPhrases}</div><div class="stat-label">Phrases</div></div>
      <div class="stat-card"><div class="stat-number">${stats.mastered}</div><div class="stat-label">Mastered</div></div>
      <div class="stat-card"><div class="stat-number">${stats.byType.noun||0}</div><div class="stat-label">Nouns</div></div>
      <div class="stat-card"><div class="stat-number">${stats.byType.verb||0}</div><div class="stat-label">Verbs</div></div>
      <div class="stat-card"><div class="stat-number">${stats.byType.adjective||0}</div><div class="stat-label">Adj.</div></div>
    `;
  } catch {
    document.getElementById('statsGrid').innerHTML = '<p style="color:var(--text-muted)">Could not load stats.</p>';
  }
}

window.switchLang = async function(code) {
  await saveConfig({ currentLang: code });
  updateNavLangBadge();
  navigate('home');
};
