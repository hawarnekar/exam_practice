import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  clearInflightSet,
  loadInflightSet,
  saveInflightSet,
} from './inflightStore'
import type { ActiveSet } from '../types'

function sampleSet(): ActiveSet {
  return {
    questionIds: ['q1', 'q2', 'q3'],
    setConfig: { size: 30, feedbackMode: 'immediate' },
    currentIndex: 1,
    answers: new Map<string, number | 'skipped'>([
      ['q1', 0],
      ['q2', 'skipped'],
    ]),
    timings: new Map<string, number>([
      ['q1', 12],
      ['q2', 30],
    ]),
  }
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('inflightStore', () => {
  test('loadInflightSet returns null when no snapshot exists', () => {
    expect(loadInflightSet('Alice')).toBeNull()
  })

  test('save → load round-trip reconstructs Maps and preserves all fields', () => {
    saveInflightSet('Alice', sampleSet())
    const restored = loadInflightSet('Alice')!
    expect(restored).not.toBeNull()
    expect(restored.questionIds).toEqual(['q1', 'q2', 'q3'])
    expect(restored.setConfig).toEqual({ size: 30, feedbackMode: 'immediate' })
    expect(restored.currentIndex).toBe(1)
    expect(restored.answers).toBeInstanceOf(Map)
    expect(restored.answers.get('q1')).toBe(0)
    expect(restored.answers.get('q2')).toBe('skipped')
    expect(restored.timings).toBeInstanceOf(Map)
    expect(restored.timings.get('q1')).toBe(12)
    expect(restored.timings.get('q2')).toBe(30)
  })

  test('save uses a per-profile namespaced key', () => {
    saveInflightSet('Alice', sampleSet())
    expect(sessionStorage.getItem('examPractice_Alice_inflightSet')).toBeTruthy()
    expect(sessionStorage.getItem('examPractice_Bob_inflightSet')).toBeNull()
  })

  test('different profiles do not share snapshots', () => {
    saveInflightSet('Alice', { ...sampleSet(), currentIndex: 5 })
    saveInflightSet('Bob', { ...sampleSet(), currentIndex: 9 })
    expect(loadInflightSet('Alice')!.currentIndex).toBe(5)
    expect(loadInflightSet('Bob')!.currentIndex).toBe(9)
  })

  test('clear removes the snapshot', () => {
    saveInflightSet('Alice', sampleSet())
    clearInflightSet('Alice')
    expect(loadInflightSet('Alice')).toBeNull()
  })

  test('load returns null on corrupted JSON', () => {
    sessionStorage.setItem('examPractice_Alice_inflightSet', '{ not json')
    expect(loadInflightSet('Alice')).toBeNull()
  })

  test('load returns null on JSON with the wrong shape', () => {
    sessionStorage.setItem(
      'examPractice_Alice_inflightSet',
      JSON.stringify({ what: 'no questions array' }),
    )
    expect(loadInflightSet('Alice')).toBeNull()
  })

  test('save silently swallows quota errors', () => {
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => saveInflightSet('Alice', sampleSet())).not.toThrow()
  })

  test('clear silently swallows storage errors', () => {
    vi.spyOn(window.sessionStorage, 'removeItem').mockImplementation(() => {
      throw new Error('removal forbidden')
    })
    expect(() => clearInflightSet('Alice')).not.toThrow()
  })
})
