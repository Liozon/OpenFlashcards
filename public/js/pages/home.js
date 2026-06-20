// pages/home.js
'use strict';

async function renderHome(el) {
  const lang = currentLang();
  if (!lang) { navigate('settings'); return; }

  el.innerHTML = `
    <div class="page-title">🏠 ${t('home_title')}</div>
    <div id="statsGrid" class="stats-grid">
      <div class="stat-card"><div class="spinner" style="width:24px;height:24px"></div></div>
    </div>
    <div class="quick-actions">
      <button class="btn btn-primary" onclick="navigate('add')">➕ ${t('home_add_words')}</button>
      <button class="btn btn-secondary" onclick="navigate('train')">🎯 ${t('home_practice')}</button>
      <button class="btn btn-secondary" onclick="navigate('vocabulary')">📚 ${t('home_vocabulary')}</button>
    </div>
    <div class="card">
      <h3 style="margin-bottom:12px;font-size:1rem">${t('home_active_lang')}</h3>
      <div id="langSwitcherHome"></div>
    </div>`;

  // Lang switcher
  const switchEl = document.getElementById('langSwitcherHome');
  const langs = App.config.targetLangs || [];
  switchEl.innerHTML = '<div class="type-filter" style="flex-wrap:wrap">' +
    langs.map(l =>
      '<button class="type-btn ' + (l.isoCode === lang ? 'active' : '') + '" onclick="switchLang(\'' + l.isoCode + '\')">' +
      (l.flag || '🌐') + ' ' + l.name +
      '</button>'
    ).join('') +
    '<button class="btn btn-sm btn-secondary" onclick="navigate(\'settings\')" style="margin-left:4px">' + `+ ${t('home_more')}` + '</button>' +
    '</div>';

  // Stats
  try {
    const stats = await api('GET', '/api/stats?lang=' + encodeURIComponent(lang));
    document.getElementById('statsGrid').innerHTML =
      '<div class="stat-card stat-card-clickable" onclick="navigate(\'vocabulary\', {})"><div class="stat-number">' + stats.totalWords + '</div><div class="stat-label">' + t('home_total_words') + '</div></div>' +
      '<div class="stat-card stat-card-clickable" onclick="navigate(\'vocabulary\', {filter:\'phrase\'})"><div class="stat-number">' + stats.totalPhrases + '</div><div class="stat-label">' + t('home_phrases') + '</div></div>' +
      '<div class="stat-card stat-card-clickable" onclick="navigate(\'vocabulary\', {filter:\'mastered\'})"><div class="stat-number">' + stats.mastered + '</div><div class="stat-label">' + t('home_mastered') + '</div></div>' +
      '<div class="stat-card stat-card-clickable" onclick="navigate(\'vocabulary\', {filter:\'noun\'})"><div class="stat-number">' + (stats.byType.noun || 0) + '</div><div class="stat-label">' + t('home_nouns') + '</div></div>' +
      '<div class="stat-card stat-card-clickable" onclick="navigate(\'vocabulary\', {filter:\'verb\'})"><div class="stat-number">' + (stats.byType.verb || 0) + '</div><div class="stat-label">' + t('home_verbs') + '</div></div>' +
      '<div class="stat-card stat-card-clickable" onclick="navigate(\'vocabulary\', {filter:\'adjective\'})"><div class="stat-number">' + (stats.byType.adjective || 0) + '</div><div class="stat-label">' + t('home_adj') + '</div></div>' +
      '<div class="stat-card stat-card-clickable" onclick="navigate(\'vocabulary\', {filter:\'adverb\'})"><div class="stat-number">' + (stats.byType.adverb || 0) + '</div><div class="stat-label">' + t('home_adv') + '</div></div>' +
      '<div class="stat-card stat-card-clickable" onclick="navigate(\'vocabulary\', {filter:\'other\'})"><div class="stat-number">' + (stats.byType.other || 0) + '</div><div class="stat-label">' + t('home_other') + '</div></div>';
  } catch {
    document.getElementById('statsGrid').innerHTML = '<p style="color:var(--text-muted)">Could not load stats.</p>';
  }
}

window.switchLang = async function (code) {
  await saveConfig({ currentLang: code });
  updateNavLangBadge();
  navigate('home');
};
