# Exam Mode - Implementation Plan

## Overview

A new **"Exam"** page that runs a scored test mixing 4 question types, each at 25% probability:

1. **Word** (multiple choice, 4 buttons) — existing from train.js
2. **Phrase** (sentence reconstruction from word bank) — existing from train.js
3. **Writing** (letter-bank spelling) — existing from train.js
4. **Audio listening** (NEW — Duolingo-style: animated waveform + 5 choice buttons, no text shown for audio)

The user configures the exam (language, types, question count), takes the test, and gets a scored summary with history tracked on the home page.

---

## Files to Create

| File | Purpose |
|------|---------|
| `public/js/pages/exam.js` | New page: setup UI, exam engine for all 4 question types, results, history |

## Files to Modify

| File | Changes |
|------|---------|
| `public/index.html` | Add `<script src="/js/pages/exam.js">`, add nav link `navExam` |
| `public/js/app.js` | Register `exam` in router validation + renderers + nav labels + admin-hide list |
| `public/js/pages/home.js` | Add "Exam" button in `.quick-actions`, add exam best-score stats chip |
| `public/locales/en.json` | Add ~30 i18n keys for exam UI |
| `public/css/style.css` | Add animated waveform CSS, exam-specific layout styles |

---

## Step-by-step Plan

### Step 1: Register "exam" page in the SPA router (`public/js/app.js`)
- Add `'exam'` to the allowed page list in `getPageFromHash()` (line 510 array)
- Add `exam: renderExam` to the `renderers` map (line 474-482)
- Add `navExam` to `applyNavLabels()` — icon key `'clipboard-text'`, i18n key `'nav_exam'`
- Add `navExam` to the admin-hide list (line 850)

### Step 2: Add nav link to `public/index.html`
- Add `<a class="nav-link" data-page="exam" href="#" id="navExam">Exam</a>` in `#navLinks` after `navTrain`
- Add `<script src="/js/pages/exam.js"></script>` after the `train.js` script tag

### Step 3: i18n keys (`public/locales/en.json`)
```json
"nav_exam": "Exam",
"exam_title": "Exam",
"exam_count_label": "Number of questions",
"exam_lang_label": "Languages",
"exam_lang_all": "All languages",
"exam_start": "Start Exam",
"exam_listen": "Listen and choose the correct answer",
"exam_correct": "Correct!",
"exam_wrong": "Wrong!",
"exam_next": "Next",
"exam_finish": "Finish",
"exam_results_title": "Exam Results",
"exam_score": "Score",
"exam_correct_count": "correct",
"exam_wrong_count": "wrong",
"exam_best_score": "Best score",
"exam_restart": "Restart",
"exam_back_home": "Back to Home",
"exam_history": "Exam History",
"exam_no_data": "No exam data yet. Take your first exam!",
"exam_configure_prompt": "Configure your exam and click Start",
"exam_type_word": "Multiple Choice",
"exam_type_phrase": "Sentence",
"exam_type_writing": "Writing",
"exam_type_audio": "Listening",
"exam_question_progress": "Question {current} of {total}"
```

### Step 4: CSS styles (`public/css/style.css`)

**Animated waveform bars:**
```css
.waveform-container {
  display: flex; align-items: center; justify-content: center;
  gap: 3px; height: 48px; padding: 12px 20px;
  background: var(--surface-2); border-radius: var(--radius-sm);
  border: 2px solid var(--border); cursor: pointer;
}
.waveform-container:hover { border-color: var(--primary); }
.waveform-bar {
  width: 4px; border-radius: 2px; background: var(--primary);
  animation: waveformPulse 0.8s ease-in-out infinite;
  animation-play-state: paused; transform: scaleY(0.3);
}
.waveform-bar:nth-child(1) { height: 60%; animation-delay: 0s; }
.waveform-bar:nth-child(2) { height: 100%; animation-delay: 0.1s; }
.waveform-bar:nth-child(3) { height: 40%; animation-delay: 0.2s; }
.waveform-bar:nth-child(4) { height: 80%; animation-delay: 0.15s; }
.waveform-bar:nth-child(5) { height: 55%; animation-delay: 0.25s; }
.waveform-bar:nth-child(6) { height: 90%; animation-delay: 0.05s; }
.waveform-bar:nth-child(7) { height: 45%; animation-delay: 0.3s; }
@keyframes waveformPulse {
  0%, 100% { transform: scaleY(0.3); }
  50% { transform: scaleY(1); }
}
.waveform-container.playing .waveform-bar {
  animation-play-state: running;
}
```

**Exam-specific styles:**
```css
.exam-play-btn { /* large centered play/waveform area */ }
.exam-choices-vertical { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.exam-choices-vertical .choice-btn { width: 100%; text-align: left; font-size: 1.1rem; }
.exam-progress-bar-wrap { height: 6px; border-radius: 3px; background: var(--border); margin-bottom: 20px; overflow: hidden; }
.exam-progress-bar-fill { height: 100%; border-radius: 3px; background: var(--primary); transition: width 0.3s; }
.exam-result-card { /* score card at end */ }
.exam-history-table { /* past exam results list */ }
```

### Step 5: Exam page module (`public/js/pages/exam.js`)

**State variables:**
```js
let _examQuestions = [];        // Prepared question objects (all 4 types)
let _examCurrentIdx = 0;
let _examCorrect = 0;
let _examWrong = 0;
let _examCount = 10;
let _examSelectedLangs = [];    // empty = all
let _examTotalAvailable = 0;    // max for count slider
let _examTypeFilters = [];      // word types to include (empty = all)
let _examIncludePhrases = true;
let _examIncludeWriting = true;
```

**Setup screen (`renderExam`):**
- **Score bar** at top (correct / wrong / streak) — same pattern as train.js
- **Settings panel** (collapsible, same pattern as train.js):
  - **Language selector**: If `targetLangs.length > 1`, show multi-select `.type-btn` row with "All" + each language (flag + name). Hidden if only 1 language.
  - **Content scope** (type filters): Same `.type-btn` row as train.js (All, Noun, Verb, Adj, Adv, Other). Applied to word + writing questions.
  - **Phrases toggle**: Button to include/exclude phrase questions. Default: included.
  - **Writing toggle**: Button to include/exclude writing questions. Default: included.
  - **Audio listening toggle**: Always included (this is the new mode). No toggle needed.
  - **Question count**: Range slider, step 10, min 10, max = `min(totalWords + totalPhrases, rounded down to nearest 10)`. If fewer than 10 available, min = actual count. Display label shows current value.
  - **Start button**: `btn-primary`, large.
- **Quiz area** placeholder: "Configure your exam and click Start"

**Exam initialization (`startExam`):**
1. Fetch words: `GET /api/quiz/batch?lang=X&count=500&direction=random&types=...` for each selected language
2. Fetch phrases: `GET /api/quiz/phrase/batch?lang=X&count=500` for each selected language
3. Combine into a unified pool, tagged with `_examType: 'word'|'phrase'`
4. Shuffle the pool, take `_examCount` items
5. For each selected item, build a question object based on its type:
   - **Word question**: Use `buildQuizQuestion` response shape (promptText, answerText, 4 choices, type badge, etc.)
   - **Phrase question**: Store raw phrase data (text, translation, langCode)
   - **Writing question**: Same as word but direction forced to native (promptText = translation, answerText = literal)
   - **Audio listening question**: Build from a word or phrase item:
     - `correctText`: studied-language text (word literal or phrase text)
     - `correctTranslation`: mother-tongue translation
     - `langCode`, `itemId` for TTS
     - `isPhrase`: boolean
     - `showInTarget`: randomly decided per question (50/50) — whether buttons show studied language or mother tongue

6. Distribute types: To ensure roughly 25% each, first partition the pool into 4 buckets (word, phrase, writing, audio), then shuffle each bucket and take `ceil(count/4)` from each. If a bucket is empty (e.g., no phrases), redistribute its share to other buckets.

**Question rendering — per type:**

| Type | UI |
|------|-----|
| **Word** | Card with type badge + direction label. Prompt word in large text with TTS buttons. 4 choice buttons in a 2x2 grid (`.choices-grid`). Reuses `renderWordQuiz` pattern. |
| **Phrase** | Card with phrase badge. Native translation shown as clickable word spans. Answer zone + word bank with shuffled tokens (correct words + 3 distractors). "Check" / "Clear" buttons. Reuses `renderPhraseQuiz` pattern. |
| **Writing** | Card with type badge. Native translation as prompt. Letter slots for target word + letter bank with distractors. "Check" / "Clear" buttons. Reuses `renderWritingQuiz` pattern. |
| **Audio listening** | Card with "Listening" badge. Large waveform play button (click to play audio via `TTS.speak()`). Animated CSS bars that pulse during playback. 5 choice buttons in a vertical list. No text shown for the audio. Buttons show either studied-language or mother-tongue text (randomized per question). |

**Audio listening question detail:**
- Layout: Waveform area on top (click to play), 5 choice buttons below in a vertical column
- Auto-plays audio when question loads (with a 300ms delay)
- Waveform animation controlled by audio events:
  - On play: add `.playing` class to waveform container
  - On ended: remove `.playing` class
- 5 buttons: all in the same language (all studied OR all native, randomized per question)
- Correct answer is one of the 5; 4 distractors from other items in the pool
- After selection: highlight correct/wrong, show "Next" button

**Answer handling per type:**
- **Word**: Disable all buttons, highlight correct/wrong, POST to `/api/quiz/answer`
- **Phrase**: Validate reconstructed text against phrase.text, POST to `/api/quiz/phrase/answer`
- **Writing**: Validate reconstructed spelling against word literal, POST to `/api/quiz/answer`
- **Audio**: Compare clicked button text against expected text, POST to `/api/quiz/answer` (words) or `/api/quiz/phrase/answer` (phrases)
- All types: update `_examCorrect` / `_examWrong`, update score bar, show "Next" or auto-advance

**Progress bar:** A thin bar at the top showing question N of X (`_examCurrentIdx / _examQuestions.length`).

**Results screen (`renderExamResults`):**
- Large score display: "X/Y" with percentage, color-coded (green >80%, yellow 50-80%, red <50%)
- Breakdown: correct count, wrong count
- Per-type breakdown: how many of each type were correct (optional, nice-to-have)
- "Best score: XX%" if available from history
- **Restart** button and **Back to Home** button
- Save results to localStorage:
  ```js
  // Key: 'exam_history'
  // Value: [{ date, score, total, correct, wrong, lang, bestForLang }]
  ```
- Update best score per language:
  ```js
  // Key: 'exam_best_{langCode}'
  // Value: { percentage, date }
  ```

### Step 6: Home page stats chip (`public/js/pages/home.js`)
- Add "Exam" button in `.quick-actions`:
  ```html
  <button class="btn btn-secondary" onclick="navigate('exam')">{icon} Exam</button>
  ```
- Add an exam stats chip in the stats grid:
  - "Exam Best: XX%" (from localStorage `exam_best_{langCode}`)
  - Clickable -> navigates to exam page

### Step 7: Exam history on exam page
- Below the results, show a small history list:
  - Date, score (X/Y), percentage, language flag
  - Last 10 exams
  - Scrollable if more

---

## API Endpoints Used (no new endpoints needed)

| Endpoint | Used for |
|----------|----------|
| `GET /api/quiz/batch` | Fetch word questions (for word, writing, and audio types) |
| `GET /api/quiz/phrase/batch` | Fetch phrase questions (for phrase and audio types) |
| `GET /api/stats?lang=X` | Get total counts for question count slider max |
| `POST /api/quiz/answer` | Update word progress (word, writing, audio-word) |
| `POST /api/quiz/phrase/answer` | Update phrase progress (phrase, audio-phrase) |

## localStorage Keys

| Key | Value |
|-----|-------|
| `exam_history` | Array of past exam result objects |
| `exam_best_{langCode}` | Best score object per language |

---

## Edge Cases

- **Fewer than 10 items total**: Allow exam with whatever is available (min 2). The slider adapts.
- **One type has no data** (e.g., no phrases): Redistribute its 25% share to other types proportionally.
- **Single language**: Hide language selector row.
- **No words at all**: Show "Add words/phrases first" message with a link to the Add page.
- **Audio fails**: TTS.speak() has Web Speech fallback built in.
- **Offline**: TTS may fail; show a warning banner if offline.
- **Writing mode letter bank**: Uses the same distractor letter logic from train.js.

## Estimated LOC

| File | Lines |
|------|-------|
| `exam.js` (new) | ~700-800 |
| `style.css` additions | ~100-120 |
| `home.js` modifications | ~25 |
| `app.js` modifications | ~15 |
| `index.html` modifications | ~5 |
| `en.json` additions | ~30 keys |
| **Total** | **~875-995** |
