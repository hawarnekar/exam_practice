import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Manifest, Question } from '../types'
import { MarkdownRenderer } from '../components/MarkdownRenderer'

const REPO_ROOT = resolve(__dirname, '..', '..')
const SEED_PATH = resolve(REPO_ROOT, 'public', 'questions', 'science', 'physics', 'light.json')
const MANIFEST_PATH = resolve(REPO_ROOT, 'public', 'questions', 'manifest.json')
const PUBLIC_DIR = resolve(REPO_ROOT, 'public')

type SeedFile = {
  subject: string
  topic: string
  subtopic: string
  questions: Question[]
}

const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as SeedFile
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest

describe('seed: science/physics/light.json', () => {
  it('has the required top-level fields', () => {
    expect(seed.subject).toBe('Science')
    expect(seed.topic).toBe('Physics')
    expect(seed.subtopic).toBe('Light')
    expect(Array.isArray(seed.questions)).toBe(true)
  })

  it('contains at least 10 questions', () => {
    expect(seed.questions.length).toBeGreaterThanOrEqual(10)
  })

  it('meets the difficulty distribution required by T13', () => {
    const counts = seed.questions.reduce<Record<string, number>>((acc, q) => {
      acc[q.difficulty] = (acc[q.difficulty] ?? 0) + 1
      return acc
    }, {})
    expect(counts.easy ?? 0).toBeGreaterThanOrEqual(2)
    expect(counts.medium ?? 0).toBeGreaterThanOrEqual(4)
    expect(counts.hard ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('has unique question IDs', () => {
    const ids = seed.questions.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has at least one question with a question-level image', () => {
    expect(seed.questions.some((q) => typeof q.image === 'string' && q.image.length > 0)).toBe(true)
  })

  it('has at least one option with an option-level image', () => {
    const hasOptionImage = seed.questions.some((q) =>
      q.options.some((o) => typeof o.image === 'string' && o.image.length > 0),
    )
    expect(hasOptionImage).toBe(true)
  })

  it('has at least one option containing a KaTeX equation ($...$)', () => {
    const hasOptionMath = seed.questions.some((q) =>
      q.options.some((o) => /\$[^$]+\$/.test(o.text)),
    )
    expect(hasOptionMath).toBe(true)
  })

  it('every question has options length 2..4 and a valid `correct` index', () => {
    for (const q of seed.questions) {
      expect(q.options.length).toBeGreaterThanOrEqual(2)
      expect(q.options.length).toBeLessThanOrEqual(4)
      expect(q.correct).toBeGreaterThanOrEqual(0)
      expect(q.correct).toBeLessThan(q.options.length)
    }
  })

  it('every referenced image (question-level and option-level) exists on disk', () => {
    const refs: string[] = []
    for (const q of seed.questions) {
      if (q.image) refs.push(q.image)
      for (const o of q.options) if (o.image) refs.push(o.image)
    }
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) {
      const abs = resolve(PUBLIC_DIR, ref)
      expect(existsSync(abs), `missing image: ${abs}`).toBe(true)
    }
  })

  it('manifest exposes this topic with the correct question count', () => {
    const entry = manifest.topics.find((t) => t.topicId === 'science/physics/light')
    expect(entry).toBeDefined()
    expect(entry?.questionCount).toBe(seed.questions.length)
    expect(entry?.filePath).toBe('questions/science/physics/light.json')
  })

  it('renders every question text, option, and explanation through MarkdownRenderer without throwing', () => {
    for (const q of seed.questions) {
      // Will throw if KaTeX or react-markdown errors on the content.
      render(<MarkdownRenderer text={q.text} image={q.image} />).unmount()
      for (const o of q.options) {
        render(<MarkdownRenderer text={o.text} image={o.image} />).unmount()
      }
      render(<MarkdownRenderer text={q.explanation} />).unmount()
    }
  })
})
