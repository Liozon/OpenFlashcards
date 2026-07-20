#!/usr/bin/env node
/**
 * sync-version.js
 * ───────────────
 * Reads the version from package.json and propagates it to every file that
 * embeds it. Run manually or automatically via the npm lifecycle hooks defined
 * in package.json ("version" hook runs after `npm version <bump>`).
 *
 * Files updated:
 *   - Dockerfile          → LABEL org.opencontainers.image.version
 *   - public/sw.js            → const CACHE_VERSION (format: ofc-v<version>)
 *   - public/service-worker.js → const SW_VERSION (format: ofc-v<version>)
 *   - build-and-export.sh → ARCHIVE filename
 *   - public/index.html   → version placeholder in footer
 *
 * Usage:
 *   npm run sync-version                  # propagate current version
 *   npm version patch                     # bump + auto-propagate via hook
 *   npm version minor
 *   npm version major
 */

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── Read version from package.json ──────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;         // e.g. "2.5"
const swCache = `ofc-v${version}`;   // e.g. "ofc-v2.5"

console.log(`[sync-version] Propagating version ${version}…`);

// ── Helper ───────────────────────────────────────────────────────────────────
function updateFile(relPath, transform) {
    const absPath = path.join(ROOT, relPath);
    const before = fs.readFileSync(absPath, 'utf8');
    const after = transform(before);
    if (before === after) {
        console.log(`  [skip]    ${relPath}  (already up-to-date)`);
    } else {
        fs.writeFileSync(absPath, after, 'utf8');
        console.log(`  [updated] ${relPath}`);
    }
}

// ── Dockerfile ───────────────────────────────────────────────────────────────
updateFile('Dockerfile', src =>
    src.replace(
        /^(LABEL org\.opencontainers\.image\.version=)"[^"]*"/m,
        `$1"${version}"`
    )
);

// ── public/sw.js ─────────────────────────────────────────────────────────────
updateFile('public/sw.js', src =>
    src.replace(
        /^(const CACHE_VERSION\s*=\s*)'[^']*'/m,
        `$1'${swCache}'`
    )
);

// ── public/service-worker.js ─────────────────────────────────────────────────
updateFile('public/service-worker.js', src =>
    src.replace(
        /^(const SW_VERSION\s*=\s*)'[^']*'/m,
        `$1'${swCache}'`
    )
);

// ── build-and-export.sh ──────────────────────────────────────────────────────
updateFile('build-and-export.sh', src =>
    src.replace(
        /^(BASE="Docker\.OpenFlashcards\.v)[^"]*(")/m,
        `$1${version}$2`
    )
);

// ── public/index.html ─────────────────────────────────────────────────────────
updateFile('public/index.html', src =>
    src.replace(
        /<!--version-->v[^<]*<!--\/version-->/g,
        `<!--version-->v${version}<!--/version-->`
    )
);

console.log(`[sync-version] Done. All files now reference v${version}.`);