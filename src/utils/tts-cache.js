'use strict';
// tts-cache.js  –  Disk cache for TTS audio files
// Layout: data/{userId}/tts/{langCode}/{speedKey}/{itemId}.mp3
//   speedKey = "n{speed_as_int_pct}" e.g. "n100" for 1.0x, "n24" for 0.24x
//   itemId   = word/phrase UUID passed by the client (or a hash of the text)

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');

// ── Helpers ──────────────────────────────────────────────────────────────────

function ttsDir(userId, langCode, speed) {
  const speedKey = 'spd' + Math.round(speed * 100);
  return path.join(DATA_DIR, userId, 'tts', langCode, speedKey);
}

function cacheFilePath(userId, langCode, speed, itemId) {
  return path.join(ttsDir(userId, langCode, speed), itemId + '.mp3');
}

// Build a stable itemId from text when no UUID is provided
function textHash(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the file path if a cached file exists, or null.
 */
function getCached(userId, langCode, speed, itemId) {
  const fp = cacheFilePath(userId, langCode, speed, itemId);
  return fs.existsSync(fp) ? fp : null;
}

/**
 * Saves a Buffer/stream to disk and returns the file path.
 * Accepts either a Buffer (saveBuffer) or a readable stream (pipe).
 */
function saveCachedBuffer(userId, langCode, speed, itemId, buffer) {
  const dir = ttsDir(userId, langCode, speed);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fp = cacheFilePath(userId, langCode, speed, itemId);
  fs.writeFileSync(fp, buffer);
  return fp;
}

/**
 * Pipe a readable stream to the cache file AND to the response simultaneously.
 * Returns a Promise that resolves when writing is done.
 */
function pipeToCache(readableStream, userId, langCode, speed, itemId, res) {
  return new Promise((resolve, reject) => {
    const dir = ttsDir(userId, langCode, speed);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fp = cacheFilePath(userId, langCode, speed, itemId);
    const fileStream = fs.createWriteStream(fp);

    readableStream.on('error', (err) => { fileStream.destroy(); reject(err); });
    fileStream.on('error', reject);

    // Collect chunks to write both to file and to response
    const chunks = [];
    readableStream.on('data', (chunk) => {
      chunks.push(chunk);
      fileStream.write(chunk);
      if (!res.writableEnded) res.write(chunk);
    });
    readableStream.on('end', () => {
      fileStream.end();
      if (!res.writableEnded) res.end();
      resolve(fp);
    });
  });
}

/**
 * Delete all cached TTS files for a given user + language.
 * If speed is provided, only deletes that speed bucket; otherwise deletes all speeds.
 * Returns the number of files deleted.
 */
function purgeCache(userId, langCode, speed = null) {
  const basePath = speed !== null
    ? ttsDir(userId, langCode, speed)
    : path.join(DATA_DIR, userId, 'tts', langCode);

  let count = 0;
  if (!fs.existsSync(basePath)) return count;

  function rmDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { rmDir(full); }
      else { fs.unlinkSync(full); count++; }
    }
    try { fs.rmdirSync(dir); } catch {}
  }
  rmDir(basePath);
  return count;
}

/**
 * Return cache statistics for a user+language.
 * { files, sizeBytes, speeds: { "spd100": { files, sizeBytes }, ... } }
 */
function cacheStats(userId, langCode) {
  const basePath = path.join(DATA_DIR, userId, 'tts', langCode);
  const result = { files: 0, sizeBytes: 0, speeds: {} };
  if (!fs.existsSync(basePath)) return result;

  for (const speedDir of fs.readdirSync(basePath, { withFileTypes: true })) {
    if (!speedDir.isDirectory()) continue;
    const spdPath = path.join(basePath, speedDir.name);
    let files = 0, sizeBytes = 0;
    for (const f of fs.readdirSync(spdPath)) {
      try {
        const stat = fs.statSync(path.join(spdPath, f));
        files++; sizeBytes += stat.size;
      } catch {}
    }
    result.files     += files;
    result.sizeBytes += sizeBytes;
    result.speeds[speedDir.name] = { files, sizeBytes };
  }
  return result;
}

/**
 * Delete the cached file for a single item at a specific speed.
 * Returns 1 if the file existed and was deleted, 0 otherwise.
 */
function deleteItem(userId, langCode, speed, itemId) {
  const fp = cacheFilePath(userId, langCode, speed, itemId);
  if (!fs.existsSync(fp)) return 0;
  try { fs.unlinkSync(fp); return 1; } catch { return 0; }
}

/**
 * Delete the cached file for a single item across ALL speed buckets.
 * Returns the number of files deleted (0, 1, or 2 typically).
 */
function deleteItemAllSpeeds(userId, langCode, itemId) {
  const basePath = path.join(DATA_DIR, userId, 'tts', langCode);
  let count = 0;
  if (!fs.existsSync(basePath)) return count;

  for (const speedDir of fs.readdirSync(basePath, { withFileTypes: true })) {
    if (!speedDir.isDirectory()) continue;
    const fp = path.join(basePath, speedDir.name, itemId + '.mp3');
    if (fs.existsSync(fp)) {
      try { fs.unlinkSync(fp); count++; } catch {}
    }
  }
  return count;
}

module.exports = { getCached, saveCachedBuffer, pipeToCache, purgeCache, cacheStats, textHash, deleteItem, deleteItemAllSpeeds };
