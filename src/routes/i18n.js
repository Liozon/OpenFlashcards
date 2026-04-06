'use strict';
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Paths ────────────────────────────────────────────────────────────────────
const PUBLIC_LOCALES = path.join(__dirname, '..', '..', 'public', 'locales');
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '..', '..', 'config');
const CACHE_DIR = path.join(CONFIG_DIR, 'locales');   // generated locales live here

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

// ── Load a locale (public first, then generated cache) ───────────────────────
function loadLocale(code) {
  // 1. Bundled locale (en.json, fr.json…)
  const bundled = path.join(PUBLIC_LOCALES, `${code}.json`);
  if (fs.existsSync(bundled)) return readJson(bundled);

  // 2. Generated locale in config cache
  ensureCacheDir();
  const cached = path.join(CACHE_DIR, `${code}.json`);
  if (fs.existsSync(cached)) return readJson(cached);

  return null;
}

// ── Language name helper (for the prompt) ────────────────────────────────────
// Maps ISO codes to human-readable names for the generation prompt
const ISO_NAMES = {
  af: 'Afrikaans', sq: 'Albanian', am: 'Amharic', ar: 'Arabic', hy: 'Armenian',
  az: 'Azerbaijani', eu: 'Basque', be: 'Belarusian', bn: 'Bengali', bs: 'Bosnian',
  bg: 'Bulgarian', ca: 'Catalan', zh: 'Chinese', hr: 'Croatian', cs: 'Czech',
  da: 'Danish', nl: 'Dutch', et: 'Estonian', fi: 'Finnish', gl: 'Galician',
  ka: 'Georgian', de: 'German', el: 'Greek', gu: 'Gujarati', hi: 'Hindi',
  hu: 'Hungarian', is: 'Icelandic', id: 'Indonesian', ga: 'Irish', it: 'Italian',
  ja: 'Japanese', kn: 'Kannada', kk: 'Kazakh', ko: 'Korean', ky: 'Kyrgyz',
  lv: 'Latvian', lt: 'Lithuanian', mk: 'Macedonian', ms: 'Malay', ml: 'Malayalam',
  mt: 'Maltese', mn: 'Mongolian', ne: 'Nepali', no: 'Norwegian', fa: 'Persian',
  pl: 'Polish', pt: 'Portuguese', pa: 'Punjabi', ro: 'Romanian', ru: 'Russian',
  sr: 'Serbian', si: 'Sinhala', sk: 'Slovak', sl: 'Slovenian', so: 'Somali',
  es: 'Spanish', sw: 'Swahili', sv: 'Swedish', tl: 'Filipino', tg: 'Tajik',
  ta: 'Tamil', te: 'Telugu', th: 'Thai', tr: 'Turkish', tk: 'Turkmen',
  uk: 'Ukrainian', ur: 'Urdu', uz: 'Uzbek', vi: 'Vietnamese', cy: 'Welsh',
  xh: 'Xhosa', yi: 'Yiddish', yo: 'Yoruba', zu: 'Zulu'
};

// ── Generate locale via Claude API ───────────────────────────────────────────
function generateLocale(langCode, englishStrings) {
  return new Promise((resolve, reject) => {
    const langName = ISO_NAMES[langCode] || langCode;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return reject(new Error('ANTHROPIC_API_KEY not set — cannot auto-generate locale.'));
    }

    const prompt =
      `You are a professional UI translator. Translate the following JSON object of UI strings from English into ${langName}.\n` +
      `Rules:\n` +
      `- Keep all emoji exactly as-is (do not move or remove them)\n` +
      `- Keep placeholders like → and ↺ and ✓ and ✗ and 🗑 exactly as-is\n` +
      `- Keep short abbreviations like "Adj." and "Adv." appropriately short\n` +
      `- Translate naturally for a language learning app UI\n` +
      `- Return ONLY a valid JSON object, no markdown, no explanation\n\n` +
      JSON.stringify(englishStrings, null, 2);

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (!data.content || !data.content[0]) return reject(new Error('Empty API response'));
          let text = data.content[0].text.trim();
          // Strip possible ```json fences
          text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
          const translated = JSON.parse(text);
          resolve(translated);
        } catch (e) {
          reject(new Error('Failed to parse Claude response: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── GET /i18n/:lang ──────────────────────────────────────────────────────────
// Returns the locale JSON for a given language code.
// If not found: auto-generates via Claude API, caches it, and returns it.
// Falls back to English if generation fails.
router.get('/:lang', async (req, res) => {
  const code = req.params.lang.toLowerCase().replace(/[^a-z-]/g, '');

  // 1. Already have it?
  let locale = loadLocale(code);
  if (locale) {
    return res.json({ locale, generated: false, lang: code });
  }

  // 2. Try base code if sub-code given (e.g. "pt-BR" → "pt")
  const base = code.split('-')[0];
  if (base !== code) {
    locale = loadLocale(base);
    if (locale) return res.json({ locale, generated: false, lang: base });
  }

  // 3. Generate via Claude
  const english = loadLocale('en');
  if (!english) return res.status(500).json({ error: 'Base English locale missing.' });

  console.log(`[i18n] Generating locale for "${code}" (${ISO_NAMES[base] || code})…`);

  try {
    const generated = await generateLocale(base, english);

    // Merge: fill any missing keys from English as fallback
    const merged = { ...english, ...generated };

    // Cache it
    ensureCacheDir();
    writeJson(path.join(CACHE_DIR, `${base}.json`), merged);
    console.log(`[i18n] ✓ Locale "${base}" generated and cached.`);

    return res.json({ locale: merged, generated: true, lang: base });
  } catch (err) {
    console.error(`[i18n] Generation failed for "${base}":`, err.message);
    // Fallback to English
    return res.json({ locale: english, generated: false, lang: 'en', fallback: true });
  }
});

// ── GET /i18n/available ──────────────────────────────────────────────────────
// Lists all available (bundled + cached) locale codes
router.get('/', (req, res) => {
  const bundled = fs.existsSync(PUBLIC_LOCALES)
    ? fs.readdirSync(PUBLIC_LOCALES).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
    : [];
  ensureCacheDir();
  const cached = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  const all = [...new Set([...bundled, ...cached])].sort();
  res.json({ available: all });
});

module.exports = router;
