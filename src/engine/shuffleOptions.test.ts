import { describe, expect, test } from 'vitest'
import { applyOptionOrder, randomPermutation } from './shuffleOptions'
import type { Question } from '../types'

function seededRandom(seed: number): () => number {
  // Mulberry32 — small, deterministic; enough for test reproducibility.
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const baseQ: Question = {
  id: 'q1',
  text: 'pick',
  image: null,
  options: [
    { text: 'A', image: null },
    { text: 'B', image: null },
    { text: 'C', image: null },
    { text: 'D', image: null },
  ],
  correct: 1,
  difficulty: 'easy',
  expected_time_sec: 30,
  score: 1,
  explanation: '',
}

describe('randomPermutation', () => {
  test('returns identity for n=0 and n=1', () => {
    expect(randomPermutation(0)).toEqual([])
    expect(randomPermutation(1)).toEqual([0])
  })

  test('produces a valid permutation of [0..n-1]', () => {
    const p = randomPermutation(4, seededRandom(42))
    expect(p).toHaveLength(4)
    expect([...p].sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })

  test('is deterministic given the same seeded rng', () => {
    const a = randomPermutation(6, seededRandom(7))
    const b = randomPermutation(6, seededRandom(7))
    expect(a).toEqual(b)
  })
})

describe('applyOptionOrder', () => {
  test('reorders options and remaps the correct index', () => {
    // Original correct = 1 (option 'B'). Order says: displayed[0]=orig 2, displayed[1]=orig 0,
    // displayed[2]=orig 1, displayed[3]=orig 3. So 'B' (orig 1) is now at displayed index 2.
    const order = [2, 0, 1, 3]
    const out = applyOptionOrder(baseQ, order)
    expect(out.options.map((o) => o.text)).toEqual(['C', 'A', 'B', 'D'])
    expect(out.correct).toBe(2)
  })

  test('returns the original question when order length mismatches', () => {
    expect(applyOptionOrder(baseQ, [0, 1])).toBe(baseQ)
  })

  test('identity order is a no-op on visible content', () => {
    const out = applyOptionOrder(baseQ, [0, 1, 2, 3])
    expect(out.options.map((o) => o.text)).toEqual(['A', 'B', 'C', 'D'])
    expect(out.correct).toBe(1)
  })
})
