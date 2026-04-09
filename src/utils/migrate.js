/**
 * migrate.js — One-time migration: convert old difficulty-based words/phrases
 * to the new progress/maxProgress system.
 * Called automatically on server start if data needs migration.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');

function wordMaxProgress(literal, infinitive) {
  const minProgressValue = 50;
  const maxProgressValue = 200;
  const coefficient = 5; // Increase to make longer words/phrases harder; decrease to flatten the curve
  const str = (infinitive && infinitive.trim()) ? infinitive.trim() : (literal || '');
  const n = str.length;
  return Math.max(minProgressValue, Math.min(maxProgressValue, Math.round(minProgressValue + Math.sqrt(n) * coefficient)));
}

function phraseMaxProgress(text) {
  const minProgressValue = 50;
  const maxProgressValue = 200;
  const wordCountCoefficient = 10; // Increase to make longer words/phrases harder; decrease to flatten the curve
  const lengthCoefficient = 8; // Increase to make longer words/phrases harder; decrease to flatten the curve
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const avgWordLength = wordCount > 0 ? words.reduce((sum, word) => sum + word.length, 0) / wordCount : 0;

  const score = minProgressValue +
    wordCount * wordCountCoefficient +
    avgWordLength * lengthCoefficient;

  return Math.max(minProgressValue, Math.min(maxProgressValue, Math.round(score)));
}

function migrateWords(words) {
  let changed = false;
  words.forEach(w => {
    // Already migrated?
    if (w.progress !== undefined && w.maxProgress !== undefined) return;

    const max = wordMaxProgress(w.literal, w.infinitive);

    if (w.difficulty !== undefined) {
      // Convert old difficulty (0-10000, lower = better) to progress (0-max)
      // difficulty=0 → mastered, difficulty=5000 → untouched/new
      if (w.difficulty === 5000 || w.difficulty == null) {
        // Was never trained, or was a "new" word with default
        w.progress = 0;
      } else if (w.difficulty <= 0) {
        // Was mastered
        w.progress = max;
      } else {
        // Partial: map 0–5000 range inversely to 0–max
        const ratio = Math.max(0, 1 - w.difficulty / 5000);
        w.progress = Math.round(ratio * max);
      }
      delete w.difficulty;
    } else {
      w.progress = 0;
    }

    w.maxProgress = max;
    changed = true;
  });
  return changed;
}

function migratePhrases(phrases) {
  let changed = false;
  phrases.forEach(p => {
    if (p.progress !== undefined && p.maxProgress !== undefined) return;

    const max = phraseMaxProgress(p.text);

    if (p.difficulty !== undefined) {
      if (p.difficulty === 5000 || p.difficulty == null) {
        p.progress = 0;
      } else if (p.difficulty <= 0) {
        p.progress = max;
      } else {
        const ratio = Math.max(0, 1 - p.difficulty / 5000);
        p.progress = Math.round(ratio * max);
      }
      delete p.difficulty;
    } else {
      p.progress = 0;
    }

    p.maxProgress = max;
    changed = true;
  });
  return changed;
}

function runMigration() {
  if (!fs.existsSync(DATA_DIR)) return;

  const userDirs = fs.readdirSync(DATA_DIR).filter(f =>
    fs.statSync(path.join(DATA_DIR, f)).isDirectory()
  );

  let totalWords = 0, totalPhrases = 0;

  userDirs.forEach(userId => {
    const dir = path.join(DATA_DIR, userId);
    const files = fs.readdirSync(dir);

    files.filter(f => f.startsWith('Words_') && f.endsWith('.json')).forEach(file => {
      const p = path.join(dir, file);
      try {
        const words = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (migrateWords(words)) {
          fs.writeFileSync(p, JSON.stringify(words, null, 2), 'utf8');
          totalWords += words.length;
          console.log(`[migrate] ✓ Words migrated: ${file}`);
        }
      } catch (e) {
        console.error(`[migrate] Error migrating ${file}:`, e.message);
      }
    });

    files.filter(f => f.startsWith('Sentences_') && f.endsWith('.json')).forEach(file => {
      const p = path.join(dir, file);
      try {
        const phrases = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (migratePhrases(phrases)) {
          fs.writeFileSync(p, JSON.stringify(phrases, null, 2), 'utf8');
          totalPhrases += phrases.length;
          console.log(`[migrate] ✓ Phrases migrated: ${file}`);
        }
      } catch (e) {
        console.error(`[migrate] Error migrating ${file}:`, e.message);
      }
    });
  });

  if (totalWords || totalPhrases)
    console.log(`[migrate] Done. ${totalWords} words, ${totalPhrases} phrases migrated.`);
}

module.exports = { runMigration };
