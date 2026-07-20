// node scripts/generate-icons.js to regenerate all icons from the source PNGs in public/img/

'use strict';
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC_DARK = path.join(__dirname, '..', 'public', 'img', 'OpenFlashcards icon.png');
const SRC_LIGHT = path.join(__dirname, '..', 'public', 'img', 'OpenFlashcards icon - Light.png');
const OUT = path.join(__dirname, '..', 'public', 'img', 'icons');

const SIZES = [
  // favicon (dark)
  { name: 'favicon-16x16.png', size: 16, src: SRC_DARK },
  { name: 'favicon-32x32.png', size: 32, src: SRC_DARK },
  // PWA / Android — any (light)
  { name: 'icon-192x192.png', size: 192, src: SRC_LIGHT },
  { name: 'icon-512x512.png', size: 512, src: SRC_LIGHT },
  // PWA / Android — maskable (light)
  { name: 'icon-192-maskable.png', size: 192, maskable: true, src: SRC_LIGHT },
  { name: 'icon-512-maskable.png', size: 512, maskable: true, src: SRC_LIGHT },
  // iOS / macOS (light)
  { name: 'apple-touch-icon-120x120.png', size: 120, src: SRC_LIGHT },
  { name: 'apple-touch-icon-152x152.png', size: 152, src: SRC_LIGHT },
  { name: 'apple-touch-icon.png', size: 180, src: SRC_LIGHT },
  { name: 'apple-touch-icon-167x167.png', size: 167, src: SRC_LIGHT },
  // Windows tile (dark)
  { name: 'mstile-150x150.png', size: 150, src: SRC_DARK },
];

if (!fs.existsSync(OUT)) {
  fs.mkdirSync(OUT, { recursive: true });
}

(async () => {
  for (const { name, size, maskable, src } of SIZES) {
    const outPath = path.join(OUT, name);
    const img = sharp(src);
    if (maskable) {
      // shrink to 75% and center on transparent canvas for adaptive icon safe zone
      const inner = Math.round(size * 0.75);
      const pad = Math.round((size - inner) / 2);
      const buffer = await img.resize(inner, inner, { fit: 'cover', position: 'center' }).png().toBuffer();
      await sharp({
        create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      })
        .composite([{ input: buffer, top: pad, left: pad }])
        .png()
        .toFile(outPath);
    } else {
      await img.resize(size, size, { fit: 'cover', position: 'center' }).png().toFile(outPath);
    }
    console.log(`✓ ${name} (${size}×${size})${maskable ? ' maskable' : ''}`);
  }
  console.log('\nDone — all icons generated in public/img/icons/');
})();
