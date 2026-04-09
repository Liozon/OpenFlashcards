'use strict';
const router = require('express').Router();
const fs = require('fs');
const path = require('path');

// ── Paths ────────────────────────────────────────────────────────────────────
const PUBLIC_LOCALES = path.join(__dirname, '..', '..', 'public', 'locales');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// ── Load a locale (public locales dir only) ──────────────────────────────────
function loadLocale(code) {
  const bundled = path.join(PUBLIC_LOCALES, `${code}.json`);
  if (fs.existsSync(bundled)) return readJson(bundled);
  return null;
}

// ── GET /i18n/:lang ──────────────────────────────────────────────────────────
// Returns locale JSON. Falls back to English if no locale file exists.
router.get('/:lang', (req, res) => {
  const code = req.params.lang.toLowerCase().replace(/[^a-z-]/g, '');

  // 1. Exact match?
  let locale = loadLocale(code);
  if (locale) return res.json({ locale, generated: false, lang: code });

  // 2. Try base code (e.g. "fr-CH" -> "fr")
  const base = code.split('-')[0];
  if (base !== code) {
    locale = loadLocale(base);
    if (locale) return res.json({ locale, generated: false, lang: base });
  }

  // 3. Fallback to English
  const english = loadLocale('en');
  if (!english) return res.status(500).json({ error: 'Base English locale missing.' });

  console.log(`[i18n] No locale found for "${code}", falling back to English.`);
  return res.json({ locale: english, generated: false, lang: 'en', fallback: true });
});

// ── GET /i18n/ ───────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const available = fs.existsSync(PUBLIC_LOCALES)
    ? fs.readdirSync(PUBLIC_LOCALES).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
    : [];
  res.json({ available: available.sort() });
});

module.exports = router;
