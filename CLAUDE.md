# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Client-only PWA for adaptive MCQ exam practice. Subject-agnostic — drop in question files for any exam (the bundled seed content happens to cover CBSE Class 10 Science and Math). Adaptive engine: weak topics get more questions, mastered topics get baseline. No backend.

## Commands

```bash
npm run dev              # start dev server
npm run build            # production build (output: dist/)
npm run preview          # preview production build locally
npm run test             # run unit tests
npm run test:run         # run tests once (no watch)
npm run lint             # ESLint
npm run build:manifest   # regenerate questions/manifest.json from questions/ directory
npm run deploy           # build + push to GitHub Pages
```

To run a single test file: `npm run test -- src/engine/adaptiveEngine.test.ts`

## Tech Stack

- **React 19 + Vite 8** — component framework and build tool
- **TypeScript** — `npm run build` runs `tsc -b && vite build`, so type errors fail the production build
- **Tailwind CSS** — styling, dark mode via `dark:` prefix (class strategy)
- **KaTeX** via `react-markdown` + `rehype-katex` + `remark-math` — renders math/chemistry in question text, options, and explanations
- **vite-plugin-pwa** — service worker + offline caching
- **Vitest** — unit tests (co-located as `*.test.ts`)

## Architecture

### UI Entry Point

`src/main.tsx` → `src/App.tsx`. `App.tsx` wraps everything in `AppProvider` (from `src/store/AppContext.tsx`) and `ScreenRouter` switches on `currentScreen` to render one of `src/screens/*`: `ProfileScreen`, `SetConfigScreen`, `SessionScreen`, `SummaryScreen`, `DashboardScreen`, `SettingsScreen`. Global app state (current screen, active profile, in-flight set) lives in `AppContext`; persisted state goes through `sessionStore`.

### Core Modules (pure functions — no React, no side effects)

**`src/engine/adaptiveEngine.ts`** — given current per-topic progress state and set config (size + difficulty split), returns an ordered list of question IDs for the next set. Implements topic weighting (Weak=3×, In Progress=2×, Mastered=1×), 40/30/30 difficulty split, shortfall fill from lower difficulty, and incorrect-question prioritisation. This is the most critical module — test it exhaustively.

**`src/engine/stateCalculator.ts`** — given a completed set's per-question results (correct/incorrect, elapsed time, expected time), returns updated per-topic mastery states. Thresholds: Mastered = ≥90% accuracy AND avg time ratio ≤100%; In Progress = 70–89% AND ≤125%; Weak = <70% OR >125%. State is calculated once per completed set, not rolling per-question.

### Data Layer

**`src/store/sessionStore.ts`** — all localStorage reads/writes. Keys are namespaced as `examPractice_<profileName>_<key>`. A one-shot migration at module load rewrites legacy `cbse10_*` keys to the new prefix. Handles profile CRUD, per-profile progress persistence, settings (dark mode), and Export/Import JSON.

**`src/data/questionLoader.ts`** — fetches `questions/manifest.json` at startup, then lazily loads topic JSON files on demand. Validates schema on load.

### Question Bank (static assets, served via Vite's `public/`)

```
public/
  questions/
    manifest.json          ← auto-generated, do not edit manually
    science/physics/light.json
    science/chemistry/chemical_reactions.json
    math/algebra/polynomials.json
    ...
  assets/images/
    science/physics/light/sci-light-001.png
    ...
```

At runtime fetched from `<base>/questions/...` and `<base>/assets/images/...` (where `<base>` is `/exam_practice/` in production). The manifest builder always scans `public/questions/`.

Each question JSON file follows this schema:
```json
{
  "subject": "Science",
  "topic": "Light",
  "subtopic": "Reflection",
  "questions": [{
    "id": "sci-light-ref-001",        // unique across entire bank
    "text": "Markdown+KaTeX string",
    "image": "assets/images/.../file.png",   // or null
    "options": [
      { "text": "Markdown+KaTeX", "image": null }  // 2–4 items
    ],
    "correct": 0,                     // zero-based index
    "difficulty": "easy|medium|hard",
    "expected_time_sec": 30,
    "score": 1,
    "explanation": "Markdown+KaTeX string"
  }]
}
```

After adding or modifying any question file, run `npm run build:manifest`. The script also validates JSON schema and reports errors.

### Key Behaviours

- **First set** (no prior history): diagnostic — questions distributed evenly across all topics.
- **Skipped questions**: treated as incorrect with `time_taken = expected_time_sec`.
- **Bank exhaustion**: once all questions in a topic are seen and correctly answered, their "seen" flag resets. Incorrectly answered questions are never reset — they stay prioritised.
- **Feedback modes**: Immediate (forward-only navigation, explanation shown after each answer) or End-of-set (free navigation, submit at end). User chooses per set.
- **Timer**: stopwatch per question. Amber at 100% of `expected_time_sec`, red at 150%. No hard cutoff — student can still answer.
- **Multi-profile**: all localStorage keys namespaced by profile name. Profile list at `examPractice_profiles`.

### Rendering KaTeX

Wrap all question/option/explanation text in the `<MarkdownRenderer>` component — do not render raw strings. Inline math: `$...$`. Block math: `$$...$$`. Chemistry: `\ce{H2SO4}` (mhchem extension enabled).

## Adding Content

1. Create `public/questions/<subject>/<topic>/<subtopic>.json` with at least one question.
2. Add any images to `public/assets/images/<subject>/<topic>/<subtopic>/`.
3. Run `npm run build:manifest`.
4. Verify rendering in dev server — check KaTeX output and image paths.
