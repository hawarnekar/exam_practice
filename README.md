# Exam Practice

A client-only Progressive Web App for adaptive MCQ exam practice. Subject-agnostic — drop in your own question files for any exam. Presents questions one at a time, tracks accuracy and time per question, and uses an adaptive algorithm to weight weak topics more heavily in subsequent sets. Progress is persisted per profile in `localStorage` and works fully offline after first load.

The bundled seed content happens to cover CBSE Class 10 Science and Math, but nothing in the engine, UI, or storage layer is exam-specific.

**Live:** https://hawarnekar.github.io/exam_practice/

## Highlights

- **Adaptive question selection** — Topic mastery is computed from accuracy *and* time-per-question. Weak topics get 3× weight, in-progress 2×, mastered 1×. Each set follows a 40/30/30 easy/medium/hard difficulty split.
- **Two feedback modes** — *Immediate* (forward-only, explanation after each answer) for learning, *End-of-Set Review* (free navigation, submit at end) for exam simulation.
- **Math + chemistry rendering** — KaTeX with the `mhchem` extension renders equations and chemical formulae inside question text, options, and explanations.
- **Multi-profile** — All progress is namespaced by profile, so siblings or classmates can share a device.
- **Offline-first PWA** — Service worker precaches the app shell, question JSON, and images. Installable to home screen.
- **Export / import** — Progress exports to a JSON file you can back up or move to another device.

## Tech Stack

React 19 · Vite 8 · TypeScript · Tailwind CSS · KaTeX (`react-markdown` + `rehype-katex` + `remark-math`) · `vite-plugin-pwa` · Vitest · `gh-pages`

## Quick Start

Requires Node.js 20+ and npm.

```bash
git clone https://github.com/hawarnekar/exam_practice.git
cd exam_practice
npm install
npm run dev
```

The dev server prints a local URL (typically `http://localhost:5173/exam_practice/`).

## Project Structure

```
src/
  engine/             pure functions: adaptive selection, mastery state
  store/              localStorage layer (profiles, progress, settings, export/import)
  data/               question bank loader (manifest + lazy topic load)
  components/         MarkdownRenderer, QuestionCard, FeedbackPanel, QuestionPalette, TopBar
  screens/            ProfileScreen, SetConfigScreen, SessionScreen, SummaryScreen, DashboardScreen, SettingsScreen
  hooks/              useQuestionTimer
public/
  questions/          static JSON question bank (manifest auto-generated)
  assets/images/      question and option images
scripts/
  build-manifest.js   regenerates public/questions/manifest.json
```

## Adding Questions

1. Create `public/questions/<subject>/<topic>/<subtopic>.json`. Each file contains an array of questions with id, markdown text, 2–4 options, correct index, difficulty (`easy` / `medium` / `hard`), expected time in seconds, score, and explanation.
2. Drop any images into `public/assets/images/<subject>/<topic>/<subtopic>/`.
3. Run `npm run build:manifest` — the script validates each file's schema, counts questions, and warns on topics with fewer than 20 questions.
4. Verify rendering with `npm run dev` (KaTeX, `mhchem`, and image paths).

The detailed schema lives in `CLAUDE.md`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run test` | Run Vitest in watch mode |
| `npm run test:run` | Run Vitest once (CI mode) |
| `npm run lint` | Run ESLint |
| `npm run build:manifest` | Regenerate `public/questions/manifest.json` from the question files |
| `npm run deploy` | Build and publish `dist/` to the `gh-pages` branch |

Run a single test file: `npm run test -- src/engine/adaptiveEngine.test.ts`.

## Testing

Vitest unit tests are co-located as `*.test.ts` next to the modules they cover. The adaptive engine and state calculator have the deepest coverage — boundary cases (accuracy 69 / 70 / 89 / 90 %, time ratio 100 % / 125 %), distribution invariants, and bank-exhaustion behaviour. Component tests use `@testing-library/react` against `jsdom`.

## Deployment

Deploys are published to GitHub Pages from the `gh-pages` branch:

```bash
npm run deploy
```

The Vite base URL is `/exam_practice/`, set in `vite.config.ts`. Adjust the base, the GitHub repository name, and the `deploy` script if you fork.

## Architecture Notes

- The adaptive engine and state calculator are pure functions — no React, no side effects — and are the most exhaustively tested modules.
- All `localStorage` keys are namespaced as `examPractice_<profileName>_<key>` so multiple profiles never collide.
- The first set has no prior history, so questions are distributed evenly across topics as a diagnostic.
- Skipped questions count as incorrect with `time_taken = expected_time_sec`.
- A topic's "seen" flags reset only after every question in that topic has been seen *and* answered correctly. Incorrect answers stay prioritised forever.

For a deeper dive on architecture and conventions, see [`CLAUDE.md`](./CLAUDE.md).
