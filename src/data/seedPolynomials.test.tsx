import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Manifest, Question } from '../types'
import { MarkdownRenderer } from '../components/MarkdownRenderer'

const REPO_ROOT = resolve(__dirname, '..', '..')
const SEED_PATH = resolve(REPO_ROOT, 'public', 'questions', 'math', 'algebra', 'polynomials.json')
const MANIFEST_PATH = resolve(REPO_ROOT, 'public', 'questions', 'manifest.json')

type SeedFile = {
  subject: string
  topic: string
  subtopic: string
  questions: Question[]
}

const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as SeedFile
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest

// A question is considered "block math" if its text contains a $$...$$ block
// with newlines inside (the form remark-math 6 actually renders as display).
const BLOCK_MATH_RE = /\$\$\s*\n[\s\S]*?\n\s*\$\$/

// An option counts as an "equation option" if its text contains $...$.
const HAS_INLINE_MATH = /\$[^$]+\$/

describe('seed: math/algebra/polynomials.json', () => {
  it('has the required top-level fields', () => {
    expect(seed.subject).toBe('Math')
    expect(seed.topic).toBe('Algebra')
    expect(seed.subtopic).toBe('Polynomials')
    expect(Array.isArray(seed.questions)).toBe(true)
  })

  it('contains at least 10 questions', () => {
    expect(seed.questions.length).toBeGreaterThanOrEqual(10)
  })

  it('mixes difficulty levels (at least one of each)', () => {
    const set = new Set(seed.questions.map((q) => q.difficulty))
    expect(set.has('easy')).toBe(true)
    expect(set.has('medium')).toBe(true)
    expect(set.has('hard')).toBe(true)
  })

  it('has at least 3 questions with $$...$$ block math in the question text', () => {
    const blockMathQs = seed.questions.filter((q) => BLOCK_MATH_RE.test(q.text))
    expect(blockMathQs.length).toBeGreaterThanOrEqual(3)
  })

  it('has at least 2 questions where every option is an equation', () => {
    const allMathOptionQs = seed.questions.filter(
      (q) => q.options.length === 4 && q.options.every((o) => HAS_INLINE_MATH.test(o.text)),
    )
    expect(allMathOptionQs.length).toBeGreaterThanOrEqual(2)
  })

  it('has at least one hard question with expected_time_sec >= 90', () => {
    const multiStepHard = seed.questions.filter(
      (q) => q.difficulty === 'hard' && q.expected_time_sec >= 90,
    )
    expect(multiStepHard.length).toBeGreaterThanOrEqual(1)
  })

  it('has unique question IDs', () => {
    const ids = seed.questions.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every question has options length 2..4 and a valid `correct` index', () => {
    for (const q of seed.questions) {
      expect(q.options.length).toBeGreaterThanOrEqual(2)
      expect(q.options.length).toBeLessThanOrEqual(4)
      expect(q.correct).toBeGreaterThanOrEqual(0)
      expect(q.correct).toBeLessThan(q.options.length)
    }
  })

  it('manifest exposes this topic with the correct question count', () => {
    const entry = manifest.topics.find((t) => t.topicId === 'math/algebra/polynomials')
    expect(entry).toBeDefined()
    expect(entry?.questionCount).toBe(seed.questions.length)
    expect(entry?.filePath).toBe('questions/math/algebra/polynomials.json')
  })

  it('renders every question text, option, and explanation through MarkdownRenderer without throwing', () => {
    for (const q of seed.questions) {
      render(<MarkdownRenderer text={q.text} image={q.image} />).unmount()
      for (const o of q.options) {
        render(<MarkdownRenderer text={o.text} image={o.image} />).unmount()
      }
      render(<MarkdownRenderer text={q.explanation} />).unmount()
    }
  })

  it('block math actually renders as a katex-display element (not inline)', () => {
    const blockMathQs = seed.questions.filter((q) => BLOCK_MATH_RE.test(q.text))
    expect(blockMathQs.length).toBeGreaterThan(0)
    for (const q of blockMathQs) {
      const { container, unmount } = render(<MarkdownRenderer text={q.text} />)
      expect(
        container.querySelector('.katex-display'),
        `expected katex-display for question ${q.id}`,
      ).not.toBeNull()
      unmount()
    }
  })
})
