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
      <button class="btn btn-secondary" onclick="navigate('notebook')">📓 ${t('nav_notebook')}</button>
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
    let notebookPages = 0;
    try {
      const nb = await api('GET', '/api/notebook/' + encodeURIComponent(lang));
      notebookPages = (nb.sections || []).reduce((sum, s) => sum + (s.pages || []).length, 0);
    } catch { }
    const statCards = [
      { value: stats.totalWords, label: t('home_total_words'), onClick: "navigate('vocabulary', {})" },
      { value: stats.totalPhrases, label: t('home_phrases'), onClick: "navigate('vocabulary', {filter:'phrase'})" },
      { value: stats.mastered, label: t('home_mastered'), onClick: "navigate('vocabulary', {filter:'mastered'})" },
      { value: stats.byType.noun || 0, label: t('home_nouns'), onClick: "navigate('vocabulary', {filter:'noun'})" },
      { value: stats.byType.verb || 0, label: t('home_verbs'), onClick: "navigate('vocabulary', {filter:'verb'})" },
      { value: stats.byType.adjective || 0, label: t('home_adj'), onClick: "navigate('vocabulary', {filter:'adjective'})" },
      { value: stats.byType.adverb || 0, label: t('home_adv'), onClick: "navigate('vocabulary', {filter:'adverb'})" },
      { value: stats.byType.other || 0, label: t('home_other'), onClick: "navigate('vocabulary', {filter:'other'})" },
      { value: notebookPages, label: t('home_notebook'), onClick: 'navigate(\'notebook\')' }
    ];
    const shown = (App.config && App.config.hideZeroStats) ? statCards.filter(c => c.value > 0) : statCards;
    document.getElementById('statsGrid').innerHTML = shown.length
      ? shown.map(c =>
          '<div class="stat-card stat-card-clickable" onclick="' + c.onClick + '"><div class="stat-number">' + c.value + '</div><div class="stat-label">' + c.label + '</div></div>'
        ).join('')
      : '<p style="color:var(--text-muted)">' + t('home_stats_empty') + '</p>';
  } catch {
    document.getElementById('statsGrid').innerHTML = '<p style="color:var(--text-muted)">' + t('home_stats_error') + '</p>';
  }
}

window.switchLang = async function (code) {
  await saveConfig({ currentLang: code });
  updateNavLangBadge();
  navigate('home');
};
