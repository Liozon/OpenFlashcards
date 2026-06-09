/* service-worker.js – OpenFlashcards offline support v3 */
'use strict';

const SW_VERSION = 'ofc-sw-v3';
const STATIC_CACHE = SW_VERSION + '-static';

const PRECACHE_URLS = [
  '/index.html',
  '/css/style.css',
  '/js/world-languages.js',
  '/js/i18n.js',
  '/js/offline-db.js',
  '/js/app.js',
  '/js/tts.js',
  '/js/pages/home.js',
  '/js/pages/vocabulary.js',
  '/js/pages/add.js',
  '/js/pages/train.js',
  '/js/pages/settings.js',
  '/js/pages/admin.js',
];

// ── Install: cache all static assets ────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] precache error:', err))
  );
});

// ── Activate: remove old caches ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const mode = event.request.mode; // 'navigate' | 'no-cors' | 'cors' | 'same-origin'

  // ── Navigation requests (Ctrl+R, link clicks, address bar) ──────────────
  // Always serve index.html from cache. Never let a navigation fail offline.
  if (mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(cached => {
        if (cached) {
          // Also try network in background to keep cache fresh
          fetch(event.request).then(resp => {
            if (resp && resp.status === 200) {
              caches.open(STATIC_CACHE).then(c => c.put('/index.html', resp));
            }
          }).catch(() => { });
          return cached;
        }
        // Not in cache yet → try network
        return fetch(event.request).catch(() =>
          new Response('<h1>OpenFlashcards</h1><p>Loading…</p>', {
            headers: { 'Content-Type': 'text/html' }
          })
        );
      })
    );
    return;
  }

  // ── i18n: cache-first (populated on bundle download) ────────────────────
  if (path.startsWith('/i18n/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          if (resp && resp.status === 200) {
            caches.open(STATIC_CACHE).then(c => c.put(event.request, resp.clone()));
          }
          return resp;
        }).catch(() =>
          new Response(JSON.stringify({ error: 'offline', offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json', 'X-Offline': '1' }
          })
        );
      })
    );
    return;
  }

  // ── Auth: network-first, fall back to IDB session ────────────────────────
  // /auth/me is intercepted by the JS-layer (offline-db.js) before fetch()
  // but if the network request reaches the SW (e.g. server down), return a
  // special offline sentinel so the JS interceptor can handle it gracefully.
  if (path.startsWith('/auth/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline', offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'X-Offline': '1' }
        })
      )
    );
    return;
  }

  // ── API: network-first, fall back to IDB (handled by offline-db.js) ─────
  if (path.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline', offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'X-Offline': '1' }
        })
      )
    );
    return;
  }

  // ── Static JS/CSS/assets: cache-first, update in background ─────────────
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request)
        .then(resp => {
          if (resp && resp.status === 200 && resp.type !== 'opaque') {
            caches.open(STATIC_CACHE).then(c => c.put(event.request, resp.clone()));
          }
          return resp;
        })
        .catch(() => null);
      return cached || networkFetch;
    })
  );
});

// ── Message ───────────────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'CACHE_STATIC') {
    caches.open(STATIC_CACHE)
      .then(c => c.addAll(PRECACHE_URLS))
      .then(() => event.ports[0] && event.ports[0].postMessage({ ok: true }));
  }
});