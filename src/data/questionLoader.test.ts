import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCacheForTests,
  getBankWarnings,
  getQuestions,
  loadManifest,
  loadTopic,
} from './questionLoader'
import type { Manifest, Question } from '../types'

const mockFetch = vi.fn()

function ok(json: unknown): Response {
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const sampleManifest: Manifest = {
  topics: [
    {
      topicId: 'science/physics/light',
      subject: 'Science',
      topic: 'Physics',
      subtopic: 'Light',
      filePath: 'questions/science/physics/light.json',
      questionCount: 25,
    },
    {
      topicId: 'math/algebra/polynomials',
      subject: 'Math',
      topic: 'Algebra',
      subtopic: 'Polynomials',
      filePath: 'questions/math/algebra/polynomials.json',
      questionCount: 5,
    },
  ],
}

function makeQ(id: string, difficulty: Question['difficulty']): Question {
  return {
    id,
    text: 't',
    image: null,
    options: [
      { text: 'a', image: null },
      { text: 'b', image: null },
    ],
    correct: 0,
    difficulty,
    expected_time_sec: 30,
    score: 1,
    explanation: 'x',
  }
}

const lightQuestions: Question[] = [
  makeQ('q-easy-1', 'easy'),
  makeQ('q-easy-2', 'easy'),
  makeQ('q-medium-1', 'medium'),
  makeQ('q-hard-1', 'hard'),
]

beforeEach(() => {
  _resetCacheForTests()
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadManifest', () => {
  it('fetches manifest.json under the BASE_URL prefix and returns its contents', async () => {
    mockFetch.mockResolvedValueOnce(ok(sampleManifest))
    const m = await loadManifest()
    expect(m).toEqual(sampleManifest)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('questions/manifest.json')
  })

  it('caches the result across subsequent calls', async () => {
    mockFetch.mockResolvedValueOnce(ok(sampleManifest))
    await loadManifest()
    await loadManifest()
    await loadManifest()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('throws when fetch returns a non-ok status', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('not found', { status: 404, statusText: 'Not Found' }),
    )
    await expect(loadManifest()).rejects.toThrow(/Failed to load manifest/)
  })

  it('throws when manifest shape is invalid', async () => {
    mockFetch.mockResolvedValueOnce(ok({ wrong: 'shape' }))
    await expect(loadManifest()).rejects.toThrow(/Invalid manifest/)
  })
})

describe('loadTopic', () => {
  it('fetches topic JSON and returns the questions array', async () => {
    mockFetch.mockResolvedValueOnce(ok({ questions: lightQuestions }))
    const qs = await loadTopic('questions/science/physics/light.json')
    expect(qs).toEqual(lightQuestions)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('questions/science/physics/light.json')
  })

  it('caches per filePath so repeat calls hit cache', async () => {
    mockFetch.mockResolvedValueOnce(ok({ questions: lightQuestions }))
    await loadTopic('questions/science/physics/light.json')
    await loadTopic('questions/science/physics/light.json')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('throws when topic file shape is invalid', async () => {
    mockFetch.mockResolvedValueOnce(ok({ notQuestions: [] }))
    await expect(loadTopic('q.json')).rejects.toThrow(/Invalid topic file/)
  })

  it('throws on non-ok HTTP response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('', { status: 500, statusText: 'Server Error' }),
    )
    await expect(loadTopic('q.json')).rejects.toThrow(/Failed to load topic/)
  })
})

describe('getQuestions', () => {
  it('returns all questions for a known topicId', async () => {
    mockFetch
      .mockResolvedValueOnce(ok(sampleManifest))
      .mockResolvedValueOnce(ok({ questions: lightQuestions }))
    const qs = await getQuestions('science/physics/light')
    expect(qs).toHaveLength(lightQuestions.length)
  })

  it('filters by difficulty when provided', async () => {
    mockFetch
      .mockResolvedValueOnce(ok(sampleManifest))
      .mockResolvedValueOnce(ok({ questions: lightQuestions }))
    const easy = await getQuestions('science/physics/light', 'easy')
    expect(easy).toHaveLength(2)
    expect(easy.every((q) => q.difficulty === 'easy')).toBe(true)
  })

  it('throws on unknown topicId', async () => {
    mockFetch.mockResolvedValueOnce(ok(sampleManifest))
    await expect(getQuestions('does/not/exist')).rejects.toThrow(/Unknown topicId/)
  })
})

describe('getBankWarnings', () => {
  it('returns one entry per topic with fewer than 20 questions', () => {
    const warnings = getBankWarnings(sampleManifest)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('math/algebra/polynomials')
    expect(warnings[0]).toContain('5')
  })

  it('returns an empty array when every topic has ≥ 20 questions', () => {
    const m: Manifest = { topics: [sampleManifest.topics[0]] }
    expect(getBankWarnings(m)).toEqual([])
  })
})
