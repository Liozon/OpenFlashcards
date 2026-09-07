'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// build-phosphor.js
// Generates a minimal local Phosphor icon bundle (subset CSS + woff2 font)
// into public/vendor/phosphor/ so the app serves icons entirely from its own
// server (no CDN). Only the icon glyphs OpenFlashcards actually uses are kept.
//
// Run:  node scripts/build-phosphor.js   (also wired to "postinstall")
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO ADD A NEW ICON (emoji + Phosphor glyph)
//
//   1. Pick the exact Phosphor v2.1.2 glyph name from https://phosphoricons.com
//      (e.g. "rocket"), and add it to the ICONS array below.
//
//   2. Register the key mapping in the app: public/js/app.js → window.PH_ICONS,
//      each entry being [key, phosphorGlyph, emoji, essential, cssClass?]:
//          ['rocket', 'rocket', '🚀', false],
//        • key          – what you pass to phIcon('rocket') in the page JS.
//        • phosphorGlyph– the glyph name; must match the ICONS entry here.
//        • emoji        – shown when the user picks emoji mode.
//        • essential    – true = keep it visible in "no icons" mode (the
//                         Phosphor glyph renders at the same size);
//                         false = decorative, it disappears in "no icons" mode.
//        • cssClass (optional) – semantic color, e.g. 'ph-ok' / 'ph-bad' / 'ph-warn'.
//
//   3. Rebuild + commit the generated files:
//          node scripts/build-phosphor.js
//      This re-extracts the new rule into all three weights
//      (public/vendor/phosphor/{regular,bold,fill}/style.css) and copies the
//      woff2 fonts.  COMMIT those generated vendor files — they are deployed
//      (Dockerfile COPY public/). postinstall also runs this automatically.
//
//   Note: the browser service worker caches /vendor/ cache-first, so hard-reload
//   (Ctrl+Shift+R) after regenerating to see new icons.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'node_modules', '@phosphor-icons', 'web', 'src');
const OUT = path.join(__dirname, '..', 'public', 'vendor', 'phosphor');

// ── Icons used by OpenFlashcards (key is the Phosphor glyph name) ────────────
const ICONS = [
  'arrow-counter-clockwise', 'arrow-down', 'arrow-right', 'arrow-up',
  'arrows-clockwise', 'arrows-split', 'book-bookmark', 'book-open', 'books',
  'calendar-dots', 'cards', 'caret-down', 'caret-left', 'caret-right',
  'chat-circle', 'check', 'cloud', 'cloud-arrow-down', 'confetti', 'export',
  'files', 'fire', 'gear', 'globe', 'hourglass', 'house', 'image-square',
  'lego', 'lightning', 'link', 'list', 'list-checks', 'magnifying-glass',
  'mailbox', 'microphone', 'moon', 'package', 'palette', 'password', 'pause',
  'pen-nib', 'pencil-simple', 'play', 'plus', 'puzzle-piece', 'quotes',
  'repeat', 'shuffle', 'sign-out', 'speaker-high', 'speaker-slash',
  'spinner-gap', 'sun', 'tag', 'target', 'translate', 'trash',
  'tray-arrow-up', 'user-circle-check', 'users', 'warning', 'waveform',
  'wifi-slash', 'wind', 'x', 'stack',
];

// Weight → { cssClassPrefix, fontFamily, woff2 }
const WEIGHTS = {
  regular: { prefix: '.ph.ph-', family: 'Phosphor', woff2: 'Phosphor.woff2' },
  bold: { prefix: '.ph-bold.ph-', family: 'Phosphor-Bold', woff2: 'Phosphor-Bold.woff2' },
  fill: { prefix: '.ph-fill.ph-', family: 'Phosphor-Fill', woff2: 'Phosphor-Fill.woff2' },
};

function extractRule(css, needle) {
  const start = css.indexOf(needle);
  if (start === -1) return null;
  const brace = css.indexOf('{', start);
  if (brace === -1) return null;
  const end = css.indexOf('}', brace);
  if (end === -1) return null;
  return css.slice(start, end + 1);
}

function buildWeight(weight, cfg) {
  const srcCss = fs.readFileSync(path.join(SRC, weight, 'style.css'), 'utf8');
  // Header = @font-face + the weight's base class block (ends right before the
  // first ".ph.ph-/.ph-bold.ph-/.ph-fill.ph-" icon rule).
  const firstRule = srcCss.indexOf(cfg.prefix);
  if (firstRule === -1) throw new Error('Could not find icon rules in ' + weight);

  let header = srcCss.slice(0, firstRule).trimEnd() + '\n';
  // Rewrite @font-face src to serve only the local woff2
  header = header.replace(/src:[\s\S]*?;\s*/, '  src: url("./' + cfg.woff2 + '") format("woff2");\n');
  // Normalise indentation of the base class block
  header = header.replace(/^\.ph(?:-[A-Za-z]+)? \{/gm, m => m);

  const iconRules = ICONS.map(name => {
    const rule = extractRule(srcCss, cfg.prefix + name);
    if (!rule) console.warn('[build-phosphor] missing in ' + weight + ':', name);
    return rule;
  }).filter(Boolean);

  const outCss = header + '\n' + iconRules.join('\n') + '\n';
  const outDir = path.join(OUT, weight);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'style.css'), outCss);

  fs.copyFileSync(path.join(SRC, weight, cfg.woff2), path.join(outDir, cfg.woff2));
  console.log(`[build-phosphor] ${weight}: ${iconRules.length} icons, ${(outCss.length / 1024).toFixed(1)} KB CSS, ${(fs.statSync(path.join(outDir, cfg.woff2)).size / 1024).toFixed(1)} KB font`);
}

for (const [weight, cfg] of Object.entries(WEIGHTS)) buildWeight(weight, cfg);
console.log('[build-phosphor] done → ' + OUT);