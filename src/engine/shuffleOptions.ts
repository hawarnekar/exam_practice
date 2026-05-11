import type { Question } from '../types'

// A permutation of [0..n-1]. `order[displayed] = originalJsonIndex`. Apply via
// `applyOptionOrder` to produce a Question whose `options` array is in the
// displayed order and whose `correct` field has been remapped to the displayed
// index of the originally-correct option.

export function randomPermutation(n: number, rand: () => number = Math.random): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(i)
  // Fisher–Yates.
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

export function applyOptionOrder(q: Question, order: number[]): Question {
  // Defensive: if the order is missing or doesn't match the option count,
  // fall back to the original question rather than rendering a broken card.
  if (!order || order.length !== q.options.length) return q
  const newOptions = order.map((origIdx) => q.options[origIdx])
  const newCorrect = order.indexOf(q.correct)
  if (newCorrect === -1) return q
  return { ...q, options: newOptions, correct: newCorrect }
}
