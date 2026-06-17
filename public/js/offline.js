'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// offline.js – Client-side offline manager
// Registers the SW, exposes window.Offline API, manages sync button in navbar
// ─────────────────────────────────────────────────────────────────────────────

window.Offline = (() => {
  let _sw = null;  // SW registration

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Send a message to the SW and get a response via MessageChannel. */
  function swMessage(type, payload) {
    return new Promise((resolve, reject) => {
      if (!_sw || !_sw.active) return reject(new Error('SW not active'));
      const channel = new MessageChannel();
      channel.port1.onmessage = e => resolve(e.data);
      _sw.active.postMessage({ type, payload }, [channel.port2]);
    });
  }

  /** Same as swMessage but forwards progress events to a callback. */
  function swMessageStream(type, payload, onProgress) {
    return new Promise((resolve, reject) => {
      if (!_sw || !_sw.active) return reject(new Error('SW not active'));
      const channel = new MessageChannel();
      channel.port1.onmessage = e => {
        const { data } = e;
        if (data.type === 'done' || data.ok !== undefined) resolve(data);
        else if (data.type === 'error') reject(new Error(data.error));
        else if (onProgress) onProgress(data);
      };
      _sw.active.postMessage({ type, payload }, [channel.port2]);
    });
  }

  // ── Registration ──────────────────────────────────────────────────────────

  async function register() {
    if (!('serviceWorker' in navigator)) return;
    try {
      _sw = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      _sw = await navigator.serviceWorker.ready;
      console.log('[Offline] SW registered');
    } catch (e) {
      console.warn('[Offline] SW registration failed:', e);
    }
  }

  // ── Detect connectivity ───────────────────────────────────────────────────

  function isOnline() { return navigator.onLine; }

  // ── Download bundle ───────────────────────────────────────────────────────
  // Downloads all words + phrases + config + locales for ALL user languages,
  // and stores them in IDB via the SW so the app can serve them offline.

  async function downloadBundle(onProgress) {
    if (!isOnline()) throw new Error('No network');
    onProgress && onProgress({ phase: 'data', pct: 0 });

    // 1. Config
    const config = await (await fetch('/api/config')).json();
    const langs  = (config.targetLangs || []).map(l => l.isoCode);

    const entries = [
      { key: '/api/config',     value: config },
      { key: '/api/config?',    value: config },
    ];

    // 2. Words, phrases, labels, stats per language
    let done = 0;
    const total = langs.length * 4 + 1;
    for (const lang of langs) {
      const [words, phrases, labels, stats] = await Promise.all([
        fetch(`/api/words?lang=${lang}`).then(r => r.json()),
        fetch(`/api/phrases?lang=${lang}`).then(r => r.json()),
        fetch(`/api/labels?lang=${lang}`).then(r => r.json()),
        fetch(`/api/stats?lang=${lang}`).then(r => r.json()),
      ]);
      entries.push({ key: `/api/words?lang=${lang}`,   value: words   });
      entries.push({ key: `/api/phrases?lang=${lang}`, value: phrases });
      entries.push({ key: `/api/labels?lang=${lang}`,  value: labels  });
      entries.push({ key: `/api/stats?lang=${lang}`,   value: stats   });
      done += 4;
      onProgress && onProgress({ phase: 'data', pct: Math.round(done / total * 50) });
    }

    // 3. Locales
    const locales = ['en', 'fr', 'de', 'es', 'it', 'ar', 'zh', 'zh-tw', 'uk'];
    for (const loc of locales) {
      try {
        const res  = await fetch(`/i18n/${loc}`);
        const data = await res.json();
        entries.push({ key: `/i18n/${loc}`, value: data });
      } catch {}
    }
    done++;
    onProgress && onProgress({ phase: 'data', pct: 55 });

    // 4. Store everything in IDB via the SW
    await swMessage('STORE_BUNDLE', { entries });
    onProgress && onProgress({ phase: 'data', pct: 60 });

    // 5. Cache TTS audio files (only if ttsCache is enabled for the lang)
    const ttsTasks = [];
    for (const langData of config.targetLangs || []) {
      const lang = langData.isoCode;
      const speedNormal = langData.ttsSpeedNormal ?? 1.0;
      const speedSlow   = langData.ttsSpeedSlow   ?? 0.24;
      const words   = entries.find(e => e.key === `/api/words?lang=${lang}`)?.value || [];
      const phrases = entries.find(e => e.key === `/api/phrases?lang=${lang}`)?.value || [];
      for (const w of words) {
        const text = (w.article ? w.article + ' ' : '') + (w.type === 'verb' && w.infinitive ? w.infinitive : w.literal);
        ttsTasks.push(`/api/tts?lang=${lang}&q=${encodeURIComponent(text)}&id=${w.id}&speed=${speedNormal}`);
        ttsTasks.push(`/api/tts?lang=${lang}&q=${encodeURIComponent(text)}&id=${w.id}&speed=${speedSlow}`);
      }
      for (const p of phrases) {
        ttsTasks.push(`/api/tts?lang=${lang}&q=${encodeURIComponent(p.text)}&id=${p.id}&speed=${speedNormal}`);
        ttsTasks.push(`/api/tts?lang=${lang}&q=${encodeURIComponent(p.text)}&id=${p.id}&speed=${speedSlow}`);
      }
    }

    onProgress && onProgress({ phase: 'tts', pct: 60, total: ttsTasks.length, done: 0 });

    if (ttsTasks.length > 0) {
      await swMessageStream('CACHE_TTS', { urls: ttsTasks }, prog => {
        const ttsBase = 60;
        const ttsRange = 38;
        onProgress && onProgress({
          phase: 'tts',
          pct: Math.round(ttsBase + (prog.done / prog.total) * ttsRange),
          done: prog.done,
          total: prog.total
        });
      });
    }

    onProgress && onProgress({ phase: 'done', pct: 100 });
  }

  // ── Sync (replay queued writes then re-download) ──────────────────────────

  async function sync(onProgress) {
    if (!isOnline()) throw new Error('No network');
    onProgress && onProgress({ phase: 'sync', pct: 0 });

    const result = await swMessage('SYNC_QUEUE');
    onProgress && onProgress({ phase: 'sync', pct: 30 });

    // Re-download fresh data
    await downloadBundle(prog => {
      onProgress && onProgress({
        ...prog,
        pct: 30 + Math.round(prog.pct * 0.7)
      });
    });

    return result;
  }

  // ── Pending queue count ───────────────────────────────────────────────────

  async function queueSize() {
    try {
      const r = await swMessage('QUEUE_SIZE', {});
      return r.size || 0;
    } catch { return 0; }
  }

  // ── Clear all offline data ────────────────────────────────────────────────

  async function clearOfflineData() {
    return swMessage('CLEAR_OFFLINE', {});
  }

  // ── Delete specific TTS cache entry in Service Worker ───────────────────────
  async function deleteTtsCacheEntry(lang, speedKey, itemId) {
    return swMessage('DELETE_TTS_CACHE', { lang, speedKey, itemId });
  }

  // ── Navbar sync button management ────────────────────────────────────────

  function injectSyncButton() {
    if (document.getElementById('offlineSyncBtn')) return;
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;

    const btn = document.createElement('button');
    btn.id        = 'offlineSyncBtn';
    btn.className = 'btn-icon offline-sync-btn';
    btn.title     = t('offline_sync_btn') || 'Sync offline data';
    btn.innerHTML = '☁️';
    btn.style.cssText = 'position:relative';

    // Badge for pending writes
    const badge = document.createElement('span');
    badge.id = 'offlineSyncBadge';
    badge.style.cssText = `
      position:absolute;top:-4px;right:-4px;
      background:var(--danger);color:#fff;
      border-radius:50%;width:14px;height:14px;
      font-size:.6rem;display:none;align-items:center;justify-content:center;
    `;
    btn.appendChild(badge);

    // Insert before logoutBtn
    const logoutBtn = document.getElementById('logoutBtn');
    navLinks.insertBefore(btn, logoutBtn);

    btn.addEventListener('click', () => {
      if (window.navigate) window.navigate('settings', { openOffline: true });
    });
  }

  function removeSyncButton() {
    const btn = document.getElementById('offlineSyncBtn');
    if (btn) btn.remove();
  }

  async function refreshSyncBadge() {
    const badge = document.getElementById('offlineSyncBadge');
    if (!badge) return;
    const n = await queueSize();
    badge.textContent = n > 9 ? '9+' : n;
    badge.style.display = n > 0 ? 'flex' : 'none';

    const btn = document.getElementById('offlineSyncBtn');
    if (btn) {
      btn.title = n > 0
        ? `${n} change(s) pending sync`
        : (t('offline_sync_btn') || 'Sync offline data');
      btn.innerHTML = n > 0 ? '🔄' : (isOnline() ? '☁️' : '📴');
      btn.appendChild(badge);
    }
  }

  // ── Init (called from app.js after login) ────────────────────────────────

  async function init() {
    await register();
    // Refresh badge every 30s
    setInterval(refreshSyncBadge, 30_000);
    window.addEventListener('online',  refreshSyncBadge);
    window.addEventListener('offline', refreshSyncBadge);
  }

  // ── Apply offline mode based on user config ───────────────────────────────

  function applyOfflineMode(cfg) {
    if (cfg && cfg.offlineMode) {
      injectSyncButton();
      refreshSyncBadge();
    } else {
      removeSyncButton();
    }
  }

  return {
    register,
    init,
    isOnline,
    downloadBundle,
    sync,
    queueSize,
    clearOfflineData,
    deleteTtsCacheEntry,
    applyOfflineMode,
    refreshSyncBadge,
    injectSyncButton,
  };
})();
