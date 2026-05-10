import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_FILE_FIELDS = ['subject', 'topic', 'subtopic', 'questions']
const REQUIRED_QUESTION_FIELDS = [
  'id',
  'text',
  'options',
  'correct',
  'difficulty',
  'expected_time_sec',
  'score',
]
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard']
const SMALL_BANK_THRESHOLD = 20

function findJsonFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...findJsonFiles(full))
    } else if (entry.endsWith('.json') && entry !== 'manifest.json') {
      out.push(full)
    }
  }
  return out
}

function isPositiveFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

function isNonNegativeFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

function validateContents(contents) {
  const errors = []
  for (const field of REQUIRED_FILE_FIELDS) {
    if (!(field in contents)) errors.push(`missing top-level field: ${field}`)
  }
  if (!Array.isArray(contents.questions)) {
    errors.push('"questions" must be an array')
    return errors
  }
  contents.questions.forEach((q, i) => {
    for (const field of REQUIRED_QUESTION_FIELDS) {
      if (!(field in q)) errors.push(`question[${i}] (id=${q.id ?? '?'}): missing field "${field}"`)
    }
    if (q.difficulty != null && !VALID_DIFFICULTIES.includes(q.difficulty)) {
      errors.push(`question[${i}] (id=${q.id}): invalid difficulty "${q.difficulty}"`)
    }
    if (q.options != null) {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) {
        errors.push(`question[${i}] (id=${q.id}): options must be an array of 2-4 items`)
      } else {
        // Validate per-option text. An empty/missing text would render as a
        // blank choice, leaving the user nothing to read.
        q.options.forEach((opt, optIdx) => {
          if (opt == null || typeof opt.text !== 'string' || opt.text.trim() === '') {
            errors.push(
              `question[${i}] (id=${q.id}): options[${optIdx}].text must be a non-empty string`,
            )
          }
        })
      }
    }
    if (typeof q.correct === 'number' && Array.isArray(q.options)) {
      if (q.correct < 0 || q.correct >= q.options.length) {
        errors.push(`question[${i}] (id=${q.id}): correct index ${q.correct} out of range`)
      }
    }
    // expected_time_sec must be a positive finite number. Zero or negative
    // would produce Infinity / NaN downstream in the time-ratio calculation
    // and pin the topic permanently to "weak".
    if ('expected_time_sec' in q && !isPositiveFiniteNumber(q.expected_time_sec)) {
      errors.push(
        `question[${i}] (id=${q.id}): expected_time_sec must be a positive finite number (got ${JSON.stringify(q.expected_time_sec)})`,
      )
    }
    // score must be a non-negative finite number.
    if ('score' in q && !isNonNegativeFiniteNumber(q.score)) {
      errors.push(
        `question[${i}] (id=${q.id}): score must be a non-negative finite number (got ${JSON.stringify(q.score)})`,
      )
    }
  })
  return errors
}

function toTopicMeta(filePath, rootDir, contents) {
  // filePath: "<rootDir>/science/physics/light.json"
  // We want filePath in manifest relative to public/, e.g. "questions/science/physics/light.json"
  const publicDir = dirname(rootDir) // "public"
  const relPath = relative(publicDir, filePath).replace(/\\/g, '/')
  const topicId = relative(rootDir, filePath).replace(/\\/g, '/').replace(/\.json$/, '')
  return {
    topicId,
    subject: contents.subject,
    topic: contents.topic,
    subtopic: contents.subtopic,
    filePath: relPath,
    questionCount: contents.questions.length,
  }
}

export function buildManifest(questionsDir) {
  const files = findJsonFiles(questionsDir).sort()
  const errors = []
  const topics = []
  // Tracks the first file each question id was seen in, so we can detect
  // collisions both within a single file and across files. CLAUDE.md
  // requires globally-unique ids; without this check duplicates would
  // silently corrupt the runtime (the engine would treat both as one
  // question, and the loader would return whichever file was iterated last).
  const seenIds = new Map()

  for (const file of files) {
    let contents
    try {
      contents = JSON.parse(readFileSync(file, 'utf8'))
    } catch (e) {
      errors.push(`${file}: invalid JSON - ${e.message}`)
      continue
    }
    const fileErrors = validateContents(contents)
    if (fileErrors.length > 0) {
      errors.push(...fileErrors.map((msg) => `${file}: ${msg}`))
      continue
    }

    for (const q of contents.questions) {
      if (typeof q.id !== 'string') continue // already flagged by validateContents
      const firstSeenIn = seenIds.get(q.id)
      if (firstSeenIn === undefined) {
        seenIds.set(q.id, file)
      } else if (firstSeenIn === file) {
        errors.push(`${file}: duplicate question id "${q.id}" appears more than once in this file`)
      } else {
        errors.push(`duplicate question id "${q.id}" in ${file} (first seen in ${firstSeenIn})`)
      }
    }

    topics.push(toTopicMeta(file, questionsDir, contents))
  }

  topics.sort((a, b) => a.topicId.localeCompare(b.topicId))
  const warnings = topics
    .filter((t) => t.questionCount < SMALL_BANK_THRESHOLD)
    .map((t) => `${t.topicId}: ${t.questionCount} questions (< ${SMALL_BANK_THRESHOLD})`)

  return { ok: errors.length === 0, manifest: { topics }, errors, warnings }
}

function main() {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  const questionsDir = join(projectRoot, 'public', 'questions')
  const manifestPath = join(questionsDir, 'manifest.json')

  const result = buildManifest(questionsDir)

  if (!result.ok) {
    console.error('Validation errors:')
    for (const err of result.errors) console.error(`  ${err}`)
    process.exit(1)
  }

  writeFileSync(manifestPath, JSON.stringify(result.manifest, null, 2) + '\n')
  const total = result.manifest.topics.reduce((sum, t) => sum + t.questionCount, 0)
  console.log(
    `Wrote ${manifestPath} (${result.manifest.topics.length} topics, ${total} questions)`
  )

  if (result.warnings.length > 0) {
    console.warn(`\nWarning: ${result.warnings.length} topic(s) have a small question bank:`)
    for (const w of result.warnings) console.warn(`  - ${w}`)
  }
}

// Run main only when invoked directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
