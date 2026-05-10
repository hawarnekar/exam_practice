import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildManifest } from './build-manifest.js'

let workDir
let questionsDir

beforeEach(() => {
  // Create a temp `public/questions/` layout so toTopicMeta sees a parent named "public"
  workDir = mkdtempSync(join(tmpdir(), 'cbse-manifest-test-'))
  questionsDir = join(workDir, 'public', 'questions')
  mkdirSync(questionsDir, { recursive: true })
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function writeQuestionFile(relPath, contents) {
  const full = join(questionsDir, relPath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, JSON.stringify(contents, null, 2))
}

function validQuestion(overrides = {}) {
  return {
    id: 'q1',
    text: 'What is 2+2?',
    image: null,
    options: [
      { text: '3', image: null },
      { text: '4', image: null },
    ],
    correct: 1,
    difficulty: 'easy',
    expected_time_sec: 30,
    score: 1,
    explanation: 'Basic addition',
    ...overrides,
  }
}

function validFile(overrides = {}) {
  return {
    subject: 'Math',
    topic: 'Algebra',
    subtopic: 'Polynomials',
    questions: [validQuestion()],
    ...overrides,
  }
}

describe('buildManifest', () => {
  test('empty directory returns empty topics array with ok=true', () => {
    const result = buildManifest(questionsDir)
    expect(result.ok).toBe(true)
    expect(result.manifest.topics).toEqual([])
    expect(result.errors).toEqual([])
  })

  test('non-existent directory returns empty topics array', () => {
    const result = buildManifest(join(workDir, 'does-not-exist'))
    expect(result.ok).toBe(true)
    expect(result.manifest.topics).toEqual([])
  })

  test('valid file produces a topic with correct fields', () => {
    writeQuestionFile('math/algebra/polynomials.json', validFile())
    const result = buildManifest(questionsDir)
    expect(result.ok).toBe(true)
    expect(result.manifest.topics).toHaveLength(1)
    const topic = result.manifest.topics[0]
    expect(topic.topicId).toBe('math/algebra/polynomials')
    expect(topic.filePath).toBe('questions/math/algebra/polynomials.json')
    expect(topic.subject).toBe('Math')
    expect(topic.topic).toBe('Algebra')
    expect(topic.subtopic).toBe('Polynomials')
    expect(topic.questionCount).toBe(1)
  })

  test('question count reflects actual array length', () => {
    writeQuestionFile(
      'math/algebra/polynomials.json',
      validFile({ questions: [validQuestion(), validQuestion({ id: 'q2' }), validQuestion({ id: 'q3' })] })
    )
    const result = buildManifest(questionsDir)
    expect(result.manifest.topics[0].questionCount).toBe(3)
  })

  test('multiple files produce sorted topics', () => {
    writeQuestionFile('science/physics/light.json', validFile({
      subject: 'Science',
      topic: 'Light',
      subtopic: 'Reflection',
      questions: [validQuestion({ id: 'sci-1' })],
    }))
    writeQuestionFile('math/algebra/polynomials.json', validFile({
      questions: [validQuestion({ id: 'math-1' })],
    }))
    const result = buildManifest(questionsDir)
    expect(result.ok).toBe(true)
    expect(result.manifest.topics.map((t) => t.topicId)).toEqual([
      'math/algebra/polynomials',
      'science/physics/light',
    ])
  })

  test('manifest.json files are skipped during scan', () => {
    writeQuestionFile('manifest.json', { topics: [] })
    writeQuestionFile('math/algebra/polynomials.json', validFile())
    const result = buildManifest(questionsDir)
    expect(result.manifest.topics).toHaveLength(1)
  })

  test('missing top-level field causes ok=false with descriptive error', () => {
    writeQuestionFile('math/algebra/polynomials.json', validFile({ subject: undefined }))
    const result = buildManifest(questionsDir)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('subject'))).toBe(true)
  })

  test('missing questions array causes ok=false', () => {
    writeQuestionFile('math/algebra/polynomials.json', { subject: 'Math', topic: 'Algebra', subtopic: 'Polynomials' })
    const result = buildManifest(questionsDir)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('questions'))).toBe(true)
  })

  test('missing per-question field causes ok=false', () => {
    writeQuestionFile(
      'math/algebra/polynomials.json',
      validFile({ questions: [validQuestion({ score: undefined })] })
    )
    const result = buildManifest(questionsDir)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('score'))).toBe(true)
  })

  test('invalid difficulty causes ok=false', () => {
    writeQuestionFile(
      'math/algebra/polynomials.json',
      validFile({ questions: [validQuestion({ difficulty: 'extreme' })] })
    )
    const result = buildManifest(questionsDir)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('difficulty'))).toBe(true)
  })

  test('out-of-range correct index causes ok=false', () => {
    writeQuestionFile(
      'math/algebra/polynomials.json',
      validFile({ questions: [validQuestion({ correct: 5 })] })
    )
    const result = buildManifest(questionsDir)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('correct'))).toBe(true)
  })

  test('options array of wrong size causes ok=false', () => {
    writeQuestionFile(
      'math/algebra/polynomials.json',
      validFile({ questions: [validQuestion({ options: [{ text: 'A', image: null }] })] })
    )
    const result = buildManifest(questionsDir)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('options'))).toBe(true)
  })

  test('invalid JSON causes ok=false', () => {
    const path = join(questionsDir, 'broken.json')
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, '{ not valid json')
    const result = buildManifest(questionsDir)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('invalid JSON'))).toBe(true)
  })

  test('topic with fewer than 20 questions emits a warning', () => {
    writeQuestionFile('math/algebra/polynomials.json', validFile({ questions: [validQuestion()] }))
    const result = buildManifest(questionsDir)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('math/algebra/polynomials')
  })

  test('topic with 20 or more questions does not emit a warning', () => {
    const many = Array.from({ length: 20 }, (_, i) => validQuestion({ id: `q${i}` }))
    writeQuestionFile('math/algebra/polynomials.json', validFile({ questions: many }))
    const result = buildManifest(questionsDir)
    expect(result.warnings).toEqual([])
  })

  describe('numeric and option-text validation', () => {
    test('expected_time_sec = 0 causes ok=false', () => {
      writeQuestionFile(
        'math/algebra/polynomials.json',
        validFile({ questions: [validQuestion({ expected_time_sec: 0 })] }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(false)
      expect(result.errors.some((e) => /expected_time_sec/.test(e))).toBe(true)
    })

    test('expected_time_sec negative causes ok=false', () => {
      writeQuestionFile(
        'math/algebra/polynomials.json',
        validFile({ questions: [validQuestion({ expected_time_sec: -10 })] }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(false)
      expect(result.errors.some((e) => /expected_time_sec/.test(e))).toBe(true)
    })

    test('expected_time_sec non-numeric causes ok=false', () => {
      writeQuestionFile(
        'math/algebra/polynomials.json',
        validFile({ questions: [validQuestion({ expected_time_sec: 'thirty' })] }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(false)
      expect(result.errors.some((e) => /expected_time_sec/.test(e))).toBe(true)
    })

    test('score negative causes ok=false', () => {
      writeQuestionFile(
        'math/algebra/polynomials.json',
        validFile({ questions: [validQuestion({ score: -1 })] }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(false)
      expect(result.errors.some((e) => /score/.test(e))).toBe(true)
    })

    test('score = 0 is allowed (non-negative)', () => {
      writeQuestionFile(
        'math/algebra/polynomials.json',
        validFile({ questions: [validQuestion({ score: 0 })] }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(true)
    })

    test('score non-numeric causes ok=false', () => {
      writeQuestionFile(
        'math/algebra/polynomials.json',
        validFile({ questions: [validQuestion({ score: '1' })] }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(false)
      expect(result.errors.some((e) => /score/.test(e))).toBe(true)
    })

    test('option with empty text causes ok=false', () => {
      writeQuestionFile(
        'math/algebra/polynomials.json',
        validFile({
          questions: [
            validQuestion({
              options: [
                { text: 'A', image: null },
                { text: '', image: null },
              ],
              correct: 0,
            }),
          ],
        }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(false)
      expect(result.errors.some((e) => /options\[1\]\.text/.test(e))).toBe(true)
    })

    test('option with whitespace-only text causes ok=false', () => {
      writeQuestionFile(
        'math/algebra/polynomials.json',
        validFile({
          questions: [
            validQuestion({
              options: [
                { text: 'A', image: null },
                { text: '   ', image: null },
              ],
              correct: 0,
            }),
          ],
        }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(false)
      expect(result.errors.some((e) => /options\[1\]\.text/.test(e))).toBe(true)
    })

    test('option with non-string text causes ok=false', () => {
      writeQuestionFile(
        'math/algebra/polynomials.json',
        validFile({
          questions: [
            validQuestion({
              options: [
                { text: 'A', image: null },
                { text: 42, image: null },
              ],
              correct: 0,
            }),
          ],
        }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(false)
      expect(result.errors.some((e) => /options\[1\]\.text/.test(e))).toBe(true)
    })
  })

  describe('duplicate question id detection', () => {
    test('duplicate id within a single file is reported', () => {
      writeQuestionFile(
        'math/algebra/polynomials.json',
        validFile({ questions: [validQuestion({ id: 'shared' }), validQuestion({ id: 'shared' })] }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toMatch(/duplicate question id "shared"/)
      expect(result.errors[0]).toMatch(/more than once in this file/)
      expect(result.errors[0]).toContain('polynomials.json')
    })

    test('duplicate id across two files is reported with both paths', () => {
      writeQuestionFile('math/algebra/polynomials.json', validFile({ questions: [validQuestion({ id: 'shared' })] }))
      writeQuestionFile(
        'science/physics/light.json',
        validFile({
          subject: 'Science',
          topic: 'Physics',
          subtopic: 'Light',
          questions: [validQuestion({ id: 'shared' })],
        }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(false)
      expect(result.errors).toHaveLength(1)
      // Files are scanned in sorted order, so polynomials.json (math/...) is
      // seen first; light.json (science/...) is the offending duplicate.
      expect(result.errors[0]).toMatch(/duplicate question id "shared"/)
      expect(result.errors[0]).toContain('light.json')
      expect(result.errors[0]).toMatch(/first seen in .*polynomials\.json/)
    })

    test('multiple distinct duplicates are all reported', () => {
      writeQuestionFile(
        'math/algebra/polynomials.json',
        validFile({
          questions: [
            validQuestion({ id: 'q1' }),
            validQuestion({ id: 'q2' }),
          ],
        }),
      )
      writeQuestionFile(
        'science/physics/light.json',
        validFile({
          subject: 'Science',
          topic: 'Physics',
          subtopic: 'Light',
          questions: [
            validQuestion({ id: 'q1' }),
            validQuestion({ id: 'q2' }),
            validQuestion({ id: 'q3' }), // unique, ok
          ],
        }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(false)
      expect(result.errors).toHaveLength(2)
      expect(result.errors.some((e) => e.includes('"q1"'))).toBe(true)
      expect(result.errors.some((e) => e.includes('"q2"'))).toBe(true)
      expect(result.errors.some((e) => e.includes('"q3"'))).toBe(false)
    })

    test('non-duplicate ids across files do not produce errors', () => {
      writeQuestionFile('math/algebra/polynomials.json', validFile({ questions: [validQuestion({ id: 'unique-a' })] }))
      writeQuestionFile(
        'science/physics/light.json',
        validFile({
          subject: 'Science',
          topic: 'Physics',
          subtopic: 'Light',
          questions: [validQuestion({ id: 'unique-b' })],
        }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(true)
      expect(result.errors).toEqual([])
      expect(result.manifest.topics).toHaveLength(2)
    })

    test('files that fail per-question validation do not poison the dup-id tracker', () => {
      // First file is valid and registers id "shared".
      writeQuestionFile('math/algebra/polynomials.json', validFile({ questions: [validQuestion({ id: 'shared' })] }))
      // Second file fails validateContents (invalid difficulty), so we skip
      // the file. Its (otherwise duplicate) id should NOT trigger a dup
      // error on top of the validation error, since validation already
      // disqualified the file.
      writeQuestionFile(
        'science/physics/light.json',
        validFile({
          subject: 'Science',
          topic: 'Physics',
          subtopic: 'Light',
          questions: [validQuestion({ id: 'shared', difficulty: 'extreme' })],
        }),
      )
      const result = buildManifest(questionsDir)
      expect(result.ok).toBe(false)
      // Only the difficulty error — no duplicate-id error.
      expect(result.errors.some((e) => e.includes('difficulty'))).toBe(true)
      expect(result.errors.some((e) => e.includes('duplicate'))).toBe(false)
    })
  })
})
