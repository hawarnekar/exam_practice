import { describe, test, expect } from 'vitest'
import {
  allocateTopicSlots,
  computeDifficultyTargets,
  selectQuestions,
} from './adaptiveEngine'
import type {
  Difficulty,
  MasteryState,
  Question,
  SetConfig,
  TopicMeta,
  TopicProgress,
} from '../types'

// Deterministic PRNG (mulberry32) for repeatable test outcomes.
function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeQuestion(id: string, difficulty: Difficulty = 'easy'): Question {
  return {
    id,
    text: id,
    image: null,
    options: [
      { text: 'a', image: null },
      { text: 'b', image: null },
    ],
    correct: 0,
    difficulty,
    expected_time_sec: 30,
    score: 1,
    explanation: '',
  }
}

// Builds N questions for a topic using the given difficulty distribution.
function makeBank(topicId: string, easy: number, medium: number, hard: number): Question[] {
  const out: Question[] = []
  let i = 0
  for (let k = 0; k < easy; k++) out.push(makeQuestion(`${topicId}-e${i++}`, 'easy'))
  for (let k = 0; k < medium; k++) out.push(makeQuestion(`${topicId}-m${i++}`, 'medium'))
  for (let k = 0; k < hard; k++) out.push(makeQuestion(`${topicId}-h${i++}`, 'hard'))
  return out
}

function topic(id: string, questionCount = 100): TopicMeta {
  return {
    topicId: id,
    subject: 's',
    topic: 't',
    subtopic: id,
    filePath: `${id}.json`,
    questionCount,
  }
}

function progress(id: string, masteryState: MasteryState): TopicProgress {
  return {
    topicId: id,
    masteryState,
    lastSetAccuracy: 0,
    lastSetTimeRatio: 0,
    incorrectQuestionIds: [],
    seenQuestionIds: [],
  }
}

const cfg = (size: 30 | 60 | 100): SetConfig => ({ size, feedbackMode: 'immediate' })

describe('allocateTopicSlots — edge cases', () => {
  test('empty topics list returns empty Map', () => {
    expect(allocateTopicSlots([], [], cfg(30)).size).toBe(0)
  })

  test('single topic gets all slots regardless of state', () => {
    const topics = [topic('a')]
    expect(allocateTopicSlots(topics, [progress('a', 'weak')], cfg(30)).get('a')).toBe(30)
    expect(allocateTopicSlots(topics, [progress('a', 'mastered')], cfg(60)).get('a')).toBe(60)
    expect(allocateTopicSlots(topics, [], cfg(100)).get('a')).toBe(100)
  })

  test('topic missing from progress is treated as unassessed', () => {
    // 'a' is weak (weight 3), 'b' has no progress entry → unassessed (weight 1)
    // size=4 → weighted total 4 → a=3, b=1
    const topics = [topic('a'), topic('b')]
    const result = allocateTopicSlots(
      topics,
      [progress('a', 'weak')],
      { size: 4 as unknown as 30, feedbackMode: 'immediate' }
    )
    expect(result.get('a')).toBe(3)
    expect(result.get('b')).toBe(1)
  })

  test('topic in progress but not in topics list is ignored', () => {
    const topics = [topic('a')]
    const prog = [progress('a', 'weak'), progress('ghost', 'weak')]
    const result = allocateTopicSlots(topics, prog, cfg(30))
    expect(result.size).toBe(1)
    expect(result.get('a')).toBe(30)
    expect(result.has('ghost')).toBe(false)
  })
})

describe('allocateTopicSlots — first-set diagnostic (all unassessed)', () => {
  test('even distribution within ±1 across all topics', () => {
    const topics = ['a', 'b', 'c', 'd'].map((id) => topic(id))
    const result = allocateTopicSlots(topics, [], cfg(30))
    const counts = [...result.values()]
    expect(counts.reduce((s, v) => s + v, 0)).toBe(30)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  test('exact even distribution when size divides evenly', () => {
    const topics = ['a', 'b', 'c'].map((id) => topic(id))
    const result = allocateTopicSlots(topics, [], cfg(30))
    expect(result.get('a')).toBe(10)
    expect(result.get('b')).toBe(10)
    expect(result.get('c')).toBe(10)
  })
})

describe('allocateTopicSlots — weighted distribution', () => {
  test('weak gets exactly 3× mastered when proportions divide evenly', () => {
    // 1 weak + 1 mastered: weights 3+1=4. size=100 → weak=75, mastered=25.
    const topics = [topic('a'), topic('b')]
    const prog = [progress('a', 'weak'), progress('b', 'mastered')]
    const result = allocateTopicSlots(topics, prog, cfg(100))
    expect(result.get('a')).toBe(75)
    expect(result.get('b')).toBe(25)
    expect(result.get('a')! / result.get('b')!).toBe(3)
  })

  test('full mix produces 3:2:1 ratio when divisible', () => {
    // weak=3, in_progress=2, mastered=1 → total weight 6. size=60 → 30/20/10.
    const topics = [topic('w'), topic('ip'), topic('m')]
    const prog = [progress('w', 'weak'), progress('ip', 'in_progress'), progress('m', 'mastered')]
    const result = allocateTopicSlots(topics, prog, cfg(60))
    expect(result.get('w')).toBe(30)
    expect(result.get('ip')).toBe(20)
    expect(result.get('m')).toBe(10)
  })

  test('weak topic gets more slots than mastered (general invariant)', () => {
    const topics = ['w', 'm'].map((id) => topic(id))
    const prog = [progress('w', 'weak'), progress('m', 'mastered')]
    for (const size of [30, 60, 100] as const) {
      const result = allocateTopicSlots(topics, prog, cfg(size))
      expect(result.get('w')!).toBeGreaterThan(result.get('m')!)
    }
  })

  test('unassessed and mastered topics are weighted equally (both = 1)', () => {
    const topics = [topic('u'), topic('m')]
    const result = allocateTopicSlots(topics, [progress('m', 'mastered')], cfg(30))
    expect(result.get('u')).toBe(15)
    expect(result.get('m')).toBe(15)
  })
})

describe('allocateTopicSlots — slot total invariant', () => {
  test.each([
    { size: 30 as const },
    { size: 60 as const },
    { size: 100 as const },
  ])('counts sum exactly to size $size for all-state mix', ({ size }) => {
    const topics = ['a', 'b', 'c', 'd', 'e'].map((id) => topic(id))
    const prog = [
      progress('a', 'weak'),
      progress('b', 'in_progress'),
      progress('c', 'mastered'),
      progress('d', 'unassessed'),
      // 'e' missing → unassessed
    ]
    const result = allocateTopicSlots(topics, prog, cfg(size))
    const total = [...result.values()].reduce((s, v) => s + v, 0)
    expect(total).toBe(size)
  })

  test('counts sum to size when many small floors create large remainder', () => {
    // 100 topics, size=30, all unassessed → each floors to 0, remainder=30 distributed
    const topics = Array.from({ length: 100 }, (_, i) => topic(`t${i.toString().padStart(3, '0')}`))
    const result = allocateTopicSlots(topics, [], cfg(30))
    const total = [...result.values()].reduce((s, v) => s + v, 0)
    expect(total).toBe(30)
  })
})

describe('allocateTopicSlots — remainder distribution', () => {
  test('remainder slots go to highest-weight topic first', () => {
    // 1 weak (z-weak), 1 mastered (a-mastered): weights 3+1=4
    // size=30 → floor(30*3/4)=22, floor(30*1/4)=7, sum=29, remainder=1
    // Highest weight: z-weak → +1
    const topics = [topic('z-weak'), topic('a-mastered')]
    const prog = [progress('z-weak', 'weak'), progress('a-mastered', 'mastered')]
    const result = allocateTopicSlots(topics, prog, cfg(30))
    expect(result.get('z-weak')).toBe(23)
    expect(result.get('a-mastered')).toBe(7)
  })

  test('remainder ties broken alphabetically when weights are equal', () => {
    // 4 unassessed, size=30 → each floors to 7, sum=28, remainder=2
    // Tie broken alphabetically: a, b get +1; c, d stay at 7.
    const topics = ['d', 'b', 'a', 'c'].map((id) => topic(id))
    const result = allocateTopicSlots(topics, [], cfg(30))
    expect(result.get('a')).toBe(8)
    expect(result.get('b')).toBe(8)
    expect(result.get('c')).toBe(7)
    expect(result.get('d')).toBe(7)
  })

  test('remainder respects weight class even when alphabetic order differs', () => {
    // a=mastered (weight 1), z=weak (weight 3): weights 4
    // size=30 → a=7, z=22, sum=29, remainder=1
    // Highest weight = z (weak) gets +1, even though 'a' is alphabetically first.
    const topics = [topic('a'), topic('z')]
    const prog = [progress('a', 'mastered'), progress('z', 'weak')]
    const result = allocateTopicSlots(topics, prog, cfg(30))
    expect(result.get('z')).toBe(23)
    expect(result.get('a')).toBe(7)
  })
})

describe('computeDifficultyTargets', () => {
  test('clean 40/30/30 split when N is divisible by 10', () => {
    expect(computeDifficultyTargets(10)).toEqual({ easy: 4, medium: 3, hard: 3 })
    expect(computeDifficultyTargets(30)).toEqual({ easy: 12, medium: 9, hard: 9 })
  })

  test('always sums to N', () => {
    for (let n = 1; n <= 30; n++) {
      const t = computeDifficultyTargets(n)
      expect(t.easy + t.medium + t.hard).toBe(n)
    }
  })

  test('N = 1 → single easy question (small-N pedagogical bias)', () => {
    expect(computeDifficultyTargets(1)).toEqual({ easy: 1, medium: 0, hard: 0 })
  })

  test('N = 2 → easy + medium (no hard)', () => {
    expect(computeDifficultyTargets(2)).toEqual({ easy: 1, medium: 1, hard: 0 })
  })

  test('N = 0 → all zeros', () => {
    expect(computeDifficultyTargets(0)).toEqual({ easy: 0, medium: 0, hard: 0 })
  })
})

describe('selectQuestions — difficulty split', () => {
  test('40/30/30 split on a large bank (10 slots)', () => {
    const bank = makeBank('t1', 20, 20, 20)
    const ids = selectQuestions(
      new Map([['t1', 10]]),
      new Map([['t1', bank]]),
      [],
      makeRandom(1)
    )
    expect(ids).toHaveLength(10)
    const byId = new Map(bank.map((q) => [q.id, q.difficulty]))
    const counts = { easy: 0, medium: 0, hard: 0 }
    for (const id of ids) counts[byId.get(id)!]++
    expect(counts).toEqual({ easy: 4, medium: 3, hard: 3 })
  })

  test('40/30/30 split scales to 30 slots', () => {
    const bank = makeBank('t1', 50, 50, 50)
    const ids = selectQuestions(
      new Map([['t1', 30]]),
      new Map([['t1', bank]]),
      [],
      makeRandom(2)
    )
    expect(ids).toHaveLength(30)
    const byId = new Map(bank.map((q) => [q.id, q.difficulty]))
    const counts = { easy: 0, medium: 0, hard: 0 }
    for (const id of ids) counts[byId.get(id)!]++
    expect(counts).toEqual({ easy: 12, medium: 9, hard: 9 })
  })
})

describe('selectQuestions — shortfall cascade', () => {
  test('hard shortfall fills from medium', () => {
    // 10 slots → targets 4 easy / 3 medium / 3 hard
    // Bank: 10 easy, 10 medium, 1 hard → hard short by 2 → medium target = 5
    // Result: 4 easy + 5 medium + 1 hard = 10
    const bank = makeBank('t1', 10, 10, 1)
    const ids = selectQuestions(
      new Map([['t1', 10]]),
      new Map([['t1', bank]]),
      [],
      makeRandom(3)
    )
    const byId = new Map(bank.map((q) => [q.id, q.difficulty]))
    const counts = { easy: 0, medium: 0, hard: 0 }
    for (const id of ids) counts[byId.get(id)!]++
    expect(counts).toEqual({ easy: 4, medium: 5, hard: 1 })
  })

  test('medium shortfall (after hard exhausts) fills from easy', () => {
    // 10 slots → targets 4/3/3
    // Bank: 10 easy, 1 medium, 0 hard
    //   hard target 3, available 0 → medium target += 3 = 6
    //   medium target 6, available 1 → take 1, easy target += 5 = 9
    //   easy target 9, available 10 → take 9
    // Result: 9 easy + 1 medium + 0 hard = 10
    const bank = makeBank('t1', 10, 1, 0)
    const ids = selectQuestions(
      new Map([['t1', 10]]),
      new Map([['t1', bank]]),
      [],
      makeRandom(4)
    )
    const byId = new Map(bank.map((q) => [q.id, q.difficulty]))
    const counts = { easy: 0, medium: 0, hard: 0 }
    for (const id of ids) counts[byId.get(id)!]++
    expect(counts).toEqual({ easy: 9, medium: 1, hard: 0 })
  })

  test('full cascade — only easy available — returns easy only', () => {
    const bank = makeBank('t1', 30, 0, 0)
    const ids = selectQuestions(
      new Map([['t1', 10]]),
      new Map([['t1', bank]]),
      [],
      makeRandom(5)
    )
    expect(ids).toHaveLength(10)
    const byId = new Map(bank.map((q) => [q.id, q.difficulty]))
    for (const id of ids) expect(byId.get(id)).toBe('easy')
  })

  test('topic with fewer total questions than slots returns the topic-level shortfall', () => {
    // Asked for 10, but only 5 questions exist → returns 5
    const bank = makeBank('t1', 5, 0, 0)
    const ids = selectQuestions(
      new Map([['t1', 10]]),
      new Map([['t1', bank]]),
      [],
      makeRandom(6)
    )
    expect(ids).toHaveLength(5)
  })
})

describe('selectQuestions — prioritisation', () => {
  test('incorrect questions appear more often than unseen across many simulations', () => {
    // 20 easy questions: 5 incorrect (also seen), 15 unseen
    const bank = makeBank('t1', 20, 0, 0)
    const incorrectIds = bank.slice(0, 5).map((q) => q.id)
    const prog: TopicProgress = {
      topicId: 't1',
      masteryState: 'weak',
      lastSetAccuracy: 0,
      lastSetTimeRatio: 0,
      incorrectQuestionIds: incorrectIds,
      seenQuestionIds: [...incorrectIds], // seen subset = incorrect
    }
    const counts = new Map<string, number>()
    for (let seed = 1; seed <= 200; seed++) {
      const ids = selectQuestions(
        new Map([['t1', 5]]),
        new Map([['t1', bank]]),
        [prog],
        makeRandom(seed)
      )
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    const incorrectAvg =
      incorrectIds.reduce((s, id) => s + (counts.get(id) ?? 0), 0) / incorrectIds.length
    const unseenIds = bank.slice(5).map((q) => q.id)
    const unseenAvg = unseenIds.reduce((s, id) => s + (counts.get(id) ?? 0), 0) / unseenIds.length
    expect(incorrectAvg).toBeGreaterThan(unseenAvg)
  })

  test('unseen questions appear more often than seen-correct across many simulations', () => {
    // 20 easy questions: 0 incorrect, 10 seen-correct, 10 unseen
    const bank = makeBank('t1', 20, 0, 0)
    const seenCorrectIds = bank.slice(0, 10).map((q) => q.id)
    const prog: TopicProgress = {
      topicId: 't1',
      masteryState: 'mastered',
      lastSetAccuracy: 1,
      lastSetTimeRatio: 0.5,
      incorrectQuestionIds: [],
      seenQuestionIds: seenCorrectIds,
    }
    const counts = new Map<string, number>()
    for (let seed = 1; seed <= 200; seed++) {
      const ids = selectQuestions(
        new Map([['t1', 5]]),
        new Map([['t1', bank]]),
        [prog],
        makeRandom(seed)
      )
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    const unseenIds = bank.slice(10).map((q) => q.id)
    const unseenAvg = unseenIds.reduce((s, id) => s + (counts.get(id) ?? 0), 0) / unseenIds.length
    const seenAvg =
      seenCorrectIds.reduce((s, id) => s + (counts.get(id) ?? 0), 0) / seenCorrectIds.length
    expect(unseenAvg).toBeGreaterThan(seenAvg)
  })
})

describe('selectQuestions — bank exhaustion', () => {
  test('topic with all questions seen and none incorrect still returns valid IDs', () => {
    const bank = makeBank('t1', 5, 0, 0)
    const prog: TopicProgress = {
      topicId: 't1',
      masteryState: 'mastered',
      lastSetAccuracy: 1,
      lastSetTimeRatio: 0.5,
      incorrectQuestionIds: [],
      seenQuestionIds: bank.map((q) => q.id),
    }
    const ids = selectQuestions(
      new Map([['t1', 3]]),
      new Map([['t1', bank]]),
      [prog],
      makeRandom(7)
    )
    expect(ids).toHaveLength(3)
    const validIds = new Set(bank.map((q) => q.id))
    for (const id of ids) expect(validIds.has(id)).toBe(true)
    expect(new Set(ids).size).toBe(3) // no duplicates within set
  })

  test('topic with all seen but some incorrect: bank not exhausted, incorrect prioritised', () => {
    // 10 easy, all in seenIds, 2 of them in incorrectIds. Pick all 10.
    const bank = makeBank('t1', 10, 0, 0)
    const incorrectIds = [bank[0].id, bank[1].id]
    const prog: TopicProgress = {
      topicId: 't1',
      masteryState: 'in_progress',
      lastSetAccuracy: 0.8,
      lastSetTimeRatio: 1.0,
      incorrectQuestionIds: incorrectIds,
      seenQuestionIds: bank.map((q) => q.id),
    }
    const ids = selectQuestions(
      new Map([['t1', 10]]),
      new Map([['t1', bank]]),
      [prog],
      makeRandom(8)
    )
    expect(ids).toHaveLength(10)
    expect(ids).toContain(incorrectIds[0])
    expect(ids).toContain(incorrectIds[1])
  })
})

describe('selectQuestions — invariants', () => {
  test('no question repeats within a single set', () => {
    const bank = makeBank('t1', 10, 10, 10)
    const ids = selectQuestions(
      new Map([['t1', 30]]),
      new Map([['t1', bank]]),
      [],
      makeRandom(9)
    )
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('zero-slot topic contributes nothing', () => {
    const bank = makeBank('t1', 5, 0, 0)
    const ids = selectQuestions(
      new Map([['t1', 0]]),
      new Map([['t1', bank]]),
      [],
      makeRandom(10)
    )
    expect(ids).toEqual([])
  })

  test('empty slots map returns empty list', () => {
    const ids = selectQuestions(new Map(), new Map(), [], makeRandom(11))
    expect(ids).toEqual([])
  })

  test('topic with no questions in pool is skipped silently', () => {
    const ids = selectQuestions(
      new Map([['t1', 5]]),
      new Map([['t1', []]]),
      [],
      makeRandom(12)
    )
    expect(ids).toEqual([])
  })

  test('IDs returned are all valid members of their topic banks', () => {
    const bankA = makeBank('a', 5, 5, 5)
    const bankB = makeBank('b', 5, 5, 5)
    const validIds = new Set([...bankA, ...bankB].map((q) => q.id))
    const ids = selectQuestions(
      new Map([
        ['a', 6],
        ['b', 6],
      ]),
      new Map([
        ['a', bankA],
        ['b', bankB],
      ]),
      [],
      makeRandom(13)
    )
    expect(ids).toHaveLength(12)
    for (const id of ids) expect(validIds.has(id)).toBe(true)
  })
})

describe('selectQuestions — cross-topic shuffling', () => {
  test('questions from different topics are interleaved (not topic-grouped)', () => {
    const bankA = makeBank('a', 30, 0, 0)
    const bankB = makeBank('b', 30, 0, 0)
    const idsA = new Set(bankA.map((q) => q.id))
    // Pick 10 from each topic; check the output is not the simple
    // concatenation of all-A then all-B.
    let interleaved = false
    for (let seed = 1; seed <= 5; seed++) {
      const ids = selectQuestions(
        new Map([
          ['a', 10],
          ['b', 10],
        ]),
        new Map([
          ['a', bankA],
          ['b', bankB],
        ]),
        [],
        makeRandom(seed)
      )
      // Find position of the first B question; ensure at least one A question
      // appears after it (i.e., the topics aren't strictly grouped).
      const firstBIdx = ids.findIndex((id) => !idsA.has(id))
      const aAfterB = ids.slice(firstBIdx + 1).some((id) => idsA.has(id))
      if (aAfterB) {
        interleaved = true
        break
      }
    }
    expect(interleaved).toBe(true)
  })
})
