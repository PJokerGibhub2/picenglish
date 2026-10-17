# AGENTS.md — คู่มือสั่งงาน AI (Codex / Cursor / Claude Code / อื่น ๆ)

> **สำหรับมนุษย์**: ไฟล์นี้คือ "ใบสั่งงาน" ของโปรเจกต์นี้ ถ้าจะย้ายไปทำต่อในเครื่องอื่น (เช่น MacBook)
> ให้วางโฟลเดอร์นี้ทั้งโฟลเดอร์แล้วเปิด AI ที่นั่น — AI จะอ่าน `AGENTS.md` และเข้าใจงานได้ทันที
>
> **For AI agents**: read this file fully before changing code. It lists the invariants you must not
> break, how to run things, how to test, and the bugs that already cost us time.

---

## 1. What this project is

**PicEnglish** — an offline-first PWA that teaches English vocabulary, listening and **speaking** to
Thai adult learners. Plain HTML/CSS/ES-module JavaScript, no framework, no build step, no backend.

- 96 vocabulary items in 8 categories, each with a real photo, IPA, Thai gloss, example sentence,
  key phrases, and a usage tip.
- 8 scripted role-play dialogues (79 lines, 39 of which the learner speaks).
- Modes: flashcards, listen-with-karaoke-highlight, matching game, multiple-choice quiz,
  pronunciation practice, dialogue role-play, sentence-level SRS review, favourites.
- Progress lives in `localStorage`; user recordings in `IndexedDB`; nothing leaves the device.

## 2. Golden rules — do not break these

1. **No build step, no framework, no bundler.** Browser-loadable ES modules only. If a change needs
   a toolchain, it is the wrong change.
2. **Offline-first.** The app must boot with the network off (service worker + cache).
   Network calls are allowed only for Wikimedia photos and optional pre-generated audio.
3. **No API keys, no backend, no analytics, no accounts.** All learner data stays on device.
4. **Thai UI text** (labels, hints, errors). English only for the target language.
5. **Communication-first, not grammar.** Never add grammar explanations. Tips are about usage,
   politeness and context. The learner's goal is "order a coffee", not "conjugate correctly".
6. **Gentle UX.** No "fail" wording, no leaderboards, no punishment for wrong answers.
   Skipping is always possible; mastery gates must have an escape hatch (currently: 3 attempts).
7. **Keep tests green.** `node scripts/check_imports.mjs` + `node scripts/e2e_test.mjs` must pass
   (105 assertions today). Add assertions for anything you add.
8. **SVG must be created with `document.createElementNS`.** `h('svg', …)` in `js/ui.js` already
   does this — never bypass it with `document.createElement('svg')`.
9. **Never re-render the current view when an unrelated sheet closes.** See bug journal #3.
10. **Illustrations, not photos, are the default.** `settings().imageMode` is `art` | `photo` | `emoji`.
    Art lives in `data/art/` (96 SVGs, 261 KB, fully offline). Never fetch images at runtime in
    `art` mode. Keep the OpenMoji/Twemoji attribution visible in settings.
11. **CSS custom properties need `setProperty`.** `h('div', { style: { '--cat': c } })` works because
    `h()` uses `setProperty`; `Object.assign(el.style, …)` silently drops `--vars`. See bug journal #7.

## 3. Commands

```bash
# serve locally (any OS)
python3 -m http.server 5173        # macOS / Linux
python  -m http.server 5173        # Windows
npx --yes serve . -l 5173          # if you prefer Node

# data pipeline (edit data/raw/** then rebuild)
python3 scripts/build_data.py       # words + categories  → data/words.json, data/categories.json
python3 scripts/build_dialogues.py  # dialogues           → data/dialogues.json
python3 scripts/make_icons.py       # PWA icons (needs Pillow + numpy)
python3 scripts/build_art.py        # cute SVG art for every word → data/art/ (needs network once)

# checks
node scripts/check_imports.mjs      # every named import resolves
node --check js/app.js              # syntax check per file (repeat for each .js)
python3 scripts/check_env.py        # environment report for a new machine

# browser test (needs Chrome + local server)
#   macOS:   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
#              --headless --disable-gpu --use-fake-ui-for-media-stream \
#              --use-fake-device-for-media-stream --remotely-debugging-port=9411 about:blank
#   Windows: chrome --headless --disable-gpu --use-fake-ui-for-media-stream ^
#              --use-fake-device-for-media-stream --remote-debugging-port=9411 about:blank
#   Linux:   google-chrome --headless --disable-gpu --use-fake-ui-for-media-stream \
#              --use-fake-device-for-media-stream --remote-debugging-port=9411 about:blank
node scripts/e2e_test.mjs           # 105 assertions: clicks, fake mic, fake speech, offline, LIFF, art
node scripts/screenshot.mjs         # regenerate docs/screenshots/*
node scripts/audit_images.mjs       # image-matching quality report
node scripts/debug_speaking.mjs     # diagnose mic → score → remediation loop
```

Chrome test flags matter: the fake mic device is what makes the speaking tests deterministic.

## 4. Architecture map

```
index.html            shell: topbar / #view / tabbar, <meta name="liff-id">
css/style.css         all styling, light+dark, mobile-first
js/app.js             hash router, theme, badges, LIFF init, service-worker registration
js/data.js            loads words/categories/dialogues; shuffle/sample/distractors
js/store.js           localStorage: SRS (SM-2) for words AND sentences, daily stats,
                      favourites, dialogue progress, settings
js/speech.js          Web Speech TTS, karaoke highlight, SpeechRecognition, pronunciation scoring,
                      male-voice preference, optional pre-generated audio files
js/images.js          Wikimedia Commons photos via verified Commons categories, safety filters,
                      IndexedDB-free caching + local candidate cache
js/recorder.js        MediaRecorder + playback + IndexedDB recordings + quota eviction
js/liff.js            LINE integration (opt-in by meta tag) + ?preview=liff simulation
js/art.js             bundled cute SVG art (OpenMoji CC BY-SA 4.0 / Twemoji CC BY 4.0)
js/ui.js              tiny DOM helper h(), toast, bottom sheet, photo box + photo picker
js/views.js           flashcards, listen, quiz, match, pronunciation, review, mine, settings
js/views-speaking.js  speaking hub, role-play dialogue, sentence review, word drill
sw.js                 service worker (cache-first shell, network-first assets, photo cache)
data/                 generated JSON the app reads (do not hand-edit; edit data/raw/**)
scripts/              build + validation + test + screenshot + audio tooling
docs/                 strategy, phase-1 spec, screenshots, voice samples, LIFF preview
```

## 5. Data pipeline and validation rules

`data/raw/*.json` (per category) → `scripts/build_data.py` → `data/words.json`.
`data/raw/dialogues/*.json` → `scripts/build_dialogues.py` → `data/dialogues.json`.

Both scripts **fail the build** on rule violations. Non-negotiable rules:

- every `keyPhrases[].en` must be a literal substring of that line's `en`
- `example` must contain the headword (inflections allowed)
- no duplicate words across the 8 categories
- dialogue lines: 8–10 per scenario, first line `who: "staff"`, `me` lines 4–12 words,
  2–3 alternatives on every `me` line, no grammar wording, no CJK/Cyrillic characters
- `data/raw/image-hints.json` supplies `commonsCategory` (verified against the Commons API) and
  `photo: false` for abstract/medical words that must stay emoji-only

## 6. Definition of done

- [ ] `node scripts/check_imports.mjs` clean, `node --check` clean on touched files
- [ ] `node scripts/e2e_test.mjs` exits 0 (all assertions + no page JS errors + offline + LIFF)
- [ ] `python3 scripts/build_data.py` and `build_dialogues.py` exit 0
- [ ] new user-visible strings are Thai; new features have at least one new E2E assertion
- [ ] offline still works; no new network dependency introduced
- [ ] bump `VERSION` in `sw.js` when shipping changed assets
- [ ] regenerate screenshots if the UI changed

## 7. Known limitations (do not "fix" by cheating)

| Limitation | Why | Acceptable workaround |
|---|---|---|
| Pronunciation score is word-level, not phoneme-level | Browser `SpeechRecognition` only returns text | Keep pass threshold low (70%), always allow retry, never say "wrong" harshly |
| True simultaneous shadowing cannot be auto-scored | Speaker output bleeds into the mic; no echo control in the API | A/B listening + self-rating instead of a score |
| Firefox has no `SpeechRecognition` | Browser support | "No-score mode": record yourself, listen back, self-rate |
| Free stock photos are ~70–80% on-topic | Wikimedia is not built for language teaching | `commonsCategory` hints (verified), in-app photo picker, `photo: false` fallback to emoji |
| iOS Safari inside LINE may refuse the microphone | LINE in-app browser | Tell the user to open in Safari/Chrome for speaking practice |

## 8. Current state and next steps

Done: Phase-1 steps 1–2 plus the microphone/A-B/remediation/mastery-gate work.

Remaining from `docs/spec-phase1-speaking.md` (in the user's chosen order):

1. **Shadowing** — sequential mode (scoreable) + simultaneous mode (A/B only, no score).
2. **One-minute monologue** — prompt built from the learner's weakest SRS words, timer,
   `MediaRecorder`, save to IndexedDB, self-rating 1–5, "เสียงของฉัน" history list.
3. **Dictation** — play sentence, learner types, per-word diff.
4. **Sentence builder** — tap word chips into order, point at the wrong position, don't reveal.
5. **Daily quest** — 3 tasks / 5 minutes, driven by existing counters.
6. Voice decision pending from the user (see `docs/voice-samples/index.html`), then run
   `scripts/generate_audio.py` to bake the full audio set (~4–5 MB) so every device sounds identical.

## 9. Bug journal — these already cost time, do not regress

1. **Icons silently vanished.** `document.createElement('svg')` produces an HTMLUnknownElement and
   `innerHTML` paths render nothing. Use `createElementNS` (fixed in `js/ui.js` `h()`).
2. **Card flip mirrored the text.** `overflow: hidden` on the flip container forces
   `transform-style: flat`. We abandoned the 3D flip for a display swap — keep it.
3. **Progress was wiped mid-exercise.** Every sheet close used to re-render the route. Only the
   settings sheet may trigger a re-render now (`sheet:closed` carries `detail.id`).
4. **Short utterances lost their recording.** The blob filter was 800 bytes; short words were
   discarded. Threshold is now 200 bytes plus a tail delay before stopping the recorder.
5. **A stale score stayed on the bubble** while the result card showed the new score.
   `updateBubbleScore()` must be called on every evaluation.
6. **`lookupWord('I')` returned "ingredient".** Stem matching must be skipped for tokens ≤ 3 chars.
7. **All category colours were identical.** `Object.assign(el.style, { '--cat': c })` silently
   ignores CSS custom properties; `h()` now uses `el.style.setProperty` for `--*` keys.

## 10. Conventions

- 2-space indent, semicolons, single quotes, template literals for strings with interpolation.
- Thai comments explain *why*; keep them short.
- UI is built with `h()` and `mount()` from `js/ui.js`; no `innerHTML` with user data.
- Every view returns a cleanup function (the router calls it on navigation).
- New settings go in `store.js` `DEFAULTS.settings` + a row in `openSettings()`.
- Prefer extending `data/*.json` + a build script over hardcoding content in JS.
