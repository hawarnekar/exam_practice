import { describe, test, expect } from 'vitest'
import { calculateState } from './stateCalculator'
import type { QuestionResult, TopicProgress } from '../types'

function r(
  topicId: string,
  questionId: string,
  correct: boolean,
  options: { elapsedSec?: number; expectedSec?: number; skipped?: boolean } = {}
): QuestionResult {
  return {
    topicId,
    questionId,
    correct,
    skipped: options.skipped ?? false,
    elapsedSec: options.elapsedSec ?? (options.expectedSec ?? 30),
    expectedSec: options.expectedSec ?? 30,
  }
}

function makeResults(topicId: string, correctCount: number, total: number, timeRatio = 0.5) {
  const out: QuestionResult[] = []
  for (let i = 0; i < total; i++) {
    out.push(
      r(topicId, `${topicId}-q${i}`, i < correctCount, {
        expectedSec: 30,
        elapsedSec: 30 * timeRatio,
      })
    )
  }
  return out
}

function emptyTopic(topicId: string, masteryState: TopicProgress['masteryState'] = 'unassessed'): TopicProgress {
  return {
    topicId,
    masteryState,
    lastSetAccuracy: 0,
    lastSetTimeRatio: 0,
    incorrectQuestionIds: [],
    seenQuestionIds: [],
  }
}

describe('calculateState — accuracy boundaries', () => {
  test('70% accuracy with low time ratio → in_progress (boundary, inclusive)', () => {
    const results = makeResults('t1', 7, 10, 0.5)
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].masteryState).toBe('in_progress')
    expect(out.topicProgress[0].lastSetAccuracy).toBeCloseTo(0.7)
  })

  test('60% accuracy → weak (below in_progress threshold)', () => {
    const results = makeResults('t1', 6, 10, 0.5)
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].masteryState).toBe('weak')
  })

  test('90% accuracy with low time ratio → mastered (boundary, inclusive)', () => {
    const results = makeResults('t1', 9, 10, 0.5)
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].masteryState).toBe('mastered')
  })

  test('80% accuracy with low time ratio → in_progress (between thresholds)', () => {
    const results = makeResults('t1', 8, 10, 0.5)
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].masteryState).toBe('in_progress')
  })
})

describe('calculateState — time ratio boundaries', () => {
  test('high accuracy with time ratio 1.00 → mastered (boundary, inclusive)', () => {
    const results = makeResults('t1', 9, 10, 1.0)
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].masteryState).toBe('mastered')
    expect(out.topicProgress[0].lastSetTimeRatio).toBeCloseTo(1.0)
  })

  test('high accuracy with time ratio 1.01 → in_progress (just over mastered limit)', () => {
    const results = makeResults('t1', 9, 10, 1.01)
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].masteryState).toBe('in_progress')
  })

  test('70% accuracy with time ratio 1.25 → in_progress (boundary, inclusive)', () => {
    const results = makeResults('t1', 7, 10, 1.25)
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].masteryState).toBe('in_progress')
  })

  test('70% accuracy with time ratio 1.26 → weak (just over in_progress limit)', () => {
    const results = makeResults('t1', 7, 10, 1.26)
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].masteryState).toBe('weak')
  })

  test('high accuracy (95%) with high time ratio (1.5) → weak (time ratio dominates)', () => {
    const results: QuestionResult[] = []
    for (let i = 0; i < 20; i++) {
      results.push(r('t1', `q${i}`, i < 19, { expectedSec: 30, elapsedSec: 45 }))
    }
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].masteryState).toBe('weak')
    expect(out.topicProgress[0].lastSetAccuracy).toBeCloseTo(0.95)
    expect(out.topicProgress[0].lastSetTimeRatio).toBeCloseTo(1.5)
  })
})

describe('calculateState — skipped questions', () => {
  test('skipped question contributes time ratio 1.0 regardless of elapsedSec', () => {
    const results = [
      r('t1', 'q1', true, { expectedSec: 30, elapsedSec: 15 }), // ratio 0.5
      r('t1', 'q2', false, { expectedSec: 30, elapsedSec: 999, skipped: true }), // ratio 1.0
    ]
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].lastSetTimeRatio).toBeCloseTo(0.75) // (0.5 + 1.0) / 2
  })

  test('skipped question counts as incorrect for accuracy', () => {
    const results = [
      r('t1', 'q1', true, { expectedSec: 30, elapsedSec: 15 }),
      r('t1', 'q2', false, { expectedSec: 30, elapsedSec: 30, skipped: true }),
    ]
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].lastSetAccuracy).toBe(0.5)
  })

  test('skipped question is added to incorrectQuestionIds', () => {
    const results = [r('t1', 'q1', false, { skipped: true })]
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].incorrectQuestionIds).toContain('q1')
  })
})

describe('calculateState — topic carry-over', () => {
  test('topic absent from results stays unchanged', () => {
    const t1 = emptyTopic('t1', 'mastered')
    t1.lastSetAccuracy = 0.95
    t1.seenQuestionIds = ['t1-q1', 't1-q2']
    const t2 = emptyTopic('t2', 'weak')

    const results = makeResults('t2', 7, 10, 0.5) // affects only t2
    const out = calculateState(results, [t1, t2])

    const updatedT1 = out.topicProgress.find((p) => p.topicId === 't1')!
    expect(updatedT1).toEqual(t1) // unchanged reference-equal contents
    expect(updatedT1.masteryState).toBe('mastered')
    expect(updatedT1.lastSetAccuracy).toBe(0.95)
  })

  test('topic in results but not in currentProgress creates a new entry', () => {
    const results = makeResults('new-topic', 9, 10, 0.5)
    const out = calculateState(results, [])
    expect(out.topicProgress).toHaveLength(1)
    expect(out.topicProgress[0].topicId).toBe('new-topic')
    expect(out.topicProgress[0].masteryState).toBe('mastered')
    // New topic starts unassessed → mastered counts as a state change
    expect(out.changes).toHaveLength(1)
    expect(out.changes[0]).toEqual({
      topicId: 'new-topic',
      previousState: 'unassessed',
      newState: 'mastered',
    })
  })

  test('empty results returns currentProgress unchanged with no changes', () => {
    const t1 = emptyTopic('t1', 'in_progress')
    const out = calculateState([], [t1])
    expect(out.topicProgress).toEqual([t1])
    expect(out.changes).toEqual([])
  })
})

describe('calculateState — incorrectQuestionIds tracking', () => {
  test('newly correct question is removed from incorrectQuestionIds', () => {
    const t1: TopicProgress = {
      ...emptyTopic('t1', 'weak'),
      incorrectQuestionIds: ['q1', 'q2'],
      seenQuestionIds: ['q1', 'q2'],
    }
    // Get correct on q1
    const results = [r('t1', 'q1', true, { expectedSec: 30, elapsedSec: 15 })]
    const out = calculateState(results, [t1])
    expect(out.topicProgress[0].incorrectQuestionIds).toEqual(['q2'])
  })

  test('newly incorrect question is added to incorrectQuestionIds', () => {
    const t1 = emptyTopic('t1', 'in_progress')
    const results = [r('t1', 'q3', false, { expectedSec: 30, elapsedSec: 30 })]
    const out = calculateState(results, [t1])
    expect(out.topicProgress[0].incorrectQuestionIds).toEqual(['q3'])
  })

  test('seenQuestionIds accumulates across calls', () => {
    const t1: TopicProgress = {
      ...emptyTopic('t1'),
      seenQuestionIds: ['q1'],
    }
    const results = [
      r('t1', 'q2', true),
      r('t1', 'q3', false),
    ]
    const out = calculateState(results, [t1])
    expect(out.topicProgress[0].seenQuestionIds.sort()).toEqual(['q1', 'q2', 'q3'])
  })

  test('seenQuestionIds is deduplicated when a question reappears', () => {
    const t1: TopicProgress = {
      ...emptyTopic('t1'),
      seenQuestionIds: ['q1'],
    }
    const results = [r('t1', 'q1', true)]
    const out = calculateState(results, [t1])
    expect(out.topicProgress[0].seenQuestionIds).toEqual(['q1'])
  })
})

describe('calculateState — state-change recording', () => {
  test('no change recorded when state stays the same', () => {
    const t1 = emptyTopic('t1', 'weak')
    const results = makeResults('t1', 5, 10, 0.5) // 50% → still weak
    const out = calculateState(results, [t1])
    expect(out.topicProgress[0].masteryState).toBe('weak')
    expect(out.changes).toEqual([])
  })

  test('change recorded when transitioning weak → in_progress', () => {
    const t1 = emptyTopic('t1', 'weak')
    const results = makeResults('t1', 8, 10, 0.5)
    const out = calculateState(results, [t1])
    expect(out.changes).toHaveLength(1)
    expect(out.changes[0]).toEqual({
      topicId: 't1',
      previousState: 'weak',
      newState: 'in_progress',
    })
  })

  test('change recorded when transitioning mastered → in_progress (regression)', () => {
    const t1 = emptyTopic('t1', 'mastered')
    const results = makeResults('t1', 9, 10, 1.2) // accuracy 0.9 but time too slow → in_progress
    const out = calculateState(results, [t1])
    expect(out.topicProgress[0].masteryState).toBe('in_progress')
    expect(out.changes[0]).toEqual({
      topicId: 't1',
      previousState: 'mastered',
      newState: 'in_progress',
    })
  })
})

describe('calculateState — bad expectedSec defenses', () => {
  // The build-manifest validator now rejects expected_time_sec <= 0 at build
  // time, but legacy localStorage data and untrusted imports could still
  // carry bad values. The engine must not produce Infinity/NaN ratios from
  // those — that would silently pin every affected topic to "weak".

  test('expectedSec = 0 falls back to ratio 1.0 (does not produce Infinity)', () => {
    const results = [
      r('t1', 'q1', true, { expectedSec: 0, elapsedSec: 30 }),
      r('t1', 'q2', true, { expectedSec: 0, elapsedSec: 30 }),
    ]
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].lastSetTimeRatio).toBe(1.0)
    expect(Number.isFinite(out.topicProgress[0].lastSetTimeRatio)).toBe(true)
  })

  test('negative expectedSec falls back to ratio 1.0', () => {
    const results = [r('t1', 'q1', true, { expectedSec: -5, elapsedSec: 30 })]
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].lastSetTimeRatio).toBe(1.0)
  })

  test('NaN expectedSec falls back to ratio 1.0', () => {
    const results = [r('t1', 'q1', true, { expectedSec: NaN, elapsedSec: 30 })]
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].lastSetTimeRatio).toBe(1.0)
    expect(Number.isNaN(out.topicProgress[0].lastSetTimeRatio)).toBe(false)
  })

  test('all-correct topic with bad expectedSec is mastered, not pinned to weak', () => {
    // 10/10 correct, expectedSec=0 → without the guard, ratio=Infinity → weak.
    // With the guard, ratio=1.0 → mastered (boundary inclusive).
    const results: QuestionResult[] = []
    for (let i = 0; i < 10; i++) {
      results.push(r('t1', `q${i}`, true, { expectedSec: 0, elapsedSec: 30 }))
    }
    const out = calculateState(results, [emptyTopic('t1')])
    expect(out.topicProgress[0].masteryState).toBe('mastered')
  })
})

describe('calculateState — multiple topics in one set', () => {
  test('each topic is computed independently', () => {
    const t1 = emptyTopic('t1', 'weak')
    const t2 = emptyTopic('t2', 'weak')
    const results = [
      ...makeResults('t1', 9, 10, 0.5), // → mastered
      ...makeResults('t2', 6, 10, 0.5), // → weak (still)
    ]
    const out = calculateState(results, [t1, t2])
    const out1 = out.topicProgress.find((p) => p.topicId === 't1')!
    const out2 = out.topicProgress.find((p) => p.topicId === 't2')!
    expect(out1.masteryState).toBe('mastered')
    expect(out2.masteryState).toBe('weak')
    expect(out.changes).toHaveLength(1) // only t1 changed
    expect(out.changes[0].topicId).toBe('t1')
  })

  test('output is sorted by topicId for determinism', () => {
    const results = [...makeResults('zebra', 9, 10, 0.5), ...makeResults('alpha', 9, 10, 0.5)]
    const out = calculateState(results, [])
    expect(out.topicProgress.map((p) => p.topicId)).toEqual(['alpha', 'zebra'])
  })
})
