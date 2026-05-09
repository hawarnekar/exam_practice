import type {
  Difficulty,
  MasteryState,
  Question,
  SetConfig,
  TopicMeta,
  TopicProgress,
} from '../types'

const WEIGHT_BY_STATE: Record<MasteryState, number> = {
  weak: 3,
  in_progress: 2,
  mastered: 1,
  unassessed: 1,
}

// Within a topic, questions are weighted for selection: a previously-incorrect
// question is most likely to be picked again, an unseen question is next, and
// a seen-and-correct question is least likely (but still possible).
const WEIGHT_INCORRECT = 3
const WEIGHT_UNSEEN = 2
const WEIGHT_SEEN_CORRECT = 1

const DIFFICULTY_SHARES: Record<Difficulty, number> = {
  easy: 0.4,
  medium: 0.3,
  hard: 0.3,
}

// Cascade for shortfall: if hard runs out, fill from medium; if medium runs
// out, fill from easy. Easy has no fallback.
const SHORTFALL_FALLBACK: Record<Difficulty, Difficulty | null> = {
  hard: 'medium',
  medium: 'easy',
  easy: null,
}

// Order in which we consume difficulty buckets so that shortfall flows
// downward correctly.
const DIFFICULTY_ORDER: Difficulty[] = ['hard', 'medium', 'easy']

// Distributes a set's question slots across topics, weighted by mastery state.
// Rounding: floor each topic's proportional share, then give the remainder
// to the highest-weight topics first (tie-break alphabetically by topicId).
// First-set behaviour (all topics unassessed) falls out for free since
// unassessed and mastered share weight 1 — even distribution within ±1.
export function allocateTopicSlots(
  topics: TopicMeta[],
  progress: TopicProgress[],
  setConfig: SetConfig
): Map<string, number> {
  if (topics.length === 0) return new Map()

  const stateByTopic = new Map<string, MasteryState>(
    progress.map((p) => [p.topicId, p.masteryState])
  )

  const weighted = topics.map((t) => ({
    topicId: t.topicId,
    weight: WEIGHT_BY_STATE[stateByTopic.get(t.topicId) ?? 'unassessed'],
  }))

  const totalWeight = weighted.reduce((sum, t) => sum + t.weight, 0)
  const { size } = setConfig

  const allocation = new Map<string, number>()
  for (const t of weighted) {
    allocation.set(t.topicId, Math.floor((size * t.weight) / totalWeight))
  }

  let allocated = 0
  for (const v of allocation.values()) allocated += v
  const remainder = size - allocated

  const ranked = [...weighted].sort(
    (a, b) => b.weight - a.weight || a.topicId.localeCompare(b.topicId)
  )

  for (let i = 0; i < remainder; i++) {
    const t = ranked[i]
    allocation.set(t.topicId, (allocation.get(t.topicId) ?? 0) + 1)
  }

  return allocation
}

// Splits N slots across difficulties using the largest-remainder method
// (Hamilton's apportionment). Ties on the remainder go to easier difficulty
// first — natural pedagogical bias toward easier questions for small N.
export function computeDifficultyTargets(N: number): Record<Difficulty, number> {
  if (N <= 0) return { easy: 0, medium: 0, hard: 0 }
  const exact: Record<Difficulty, number> = {
    easy: DIFFICULTY_SHARES.easy * N,
    medium: DIFFICULTY_SHARES.medium * N,
    hard: DIFFICULTY_SHARES.hard * N,
  }
  const result: Record<Difficulty, number> = {
    easy: Math.floor(exact.easy),
    medium: Math.floor(exact.medium),
    hard: Math.floor(exact.hard),
  }
  const remainder = N - (result.easy + result.medium + result.hard)
  const tiebreak: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 }
  const ranked: Difficulty[] = (['easy', 'medium', 'hard'] as const)
    .map((d) => ({ d, frac: exact[d] - result[d] }))
    .sort((a, b) => b.frac - a.frac || tiebreak[a.d] - tiebreak[b.d])
    .map((x) => x.d)
  for (let i = 0; i < remainder; i++) result[ranked[i]] += 1
  return result
}

function bucketByDifficulty(questions: Question[]): Record<Difficulty, Question[]> {
  return {
    easy: questions.filter((q) => q.difficulty === 'easy'),
    medium: questions.filter((q) => q.difficulty === 'medium'),
    hard: questions.filter((q) => q.difficulty === 'hard'),
  }
}

function weightFor(
  questionId: string,
  incorrectIds: Set<string>,
  effectiveSeen: Set<string>
): number {
  if (incorrectIds.has(questionId)) return WEIGHT_INCORRECT
  if (!effectiveSeen.has(questionId)) return WEIGHT_UNSEEN
  return WEIGHT_SEEN_CORRECT
}

// Weighted random sampling without replacement using inverse-CDF.
function weightedSample(
  pool: Question[],
  count: number,
  incorrectIds: Set<string>,
  effectiveSeen: Set<string>,
  random: () => number
): string[] {
  if (count <= 0 || pool.length === 0) return []
  if (count >= pool.length) return pool.map((q) => q.id)

  const items = pool.map((q) => ({
    id: q.id,
    weight: weightFor(q.id, incorrectIds, effectiveSeen),
  }))

  const selected: string[] = []
  while (selected.length < count && items.length > 0) {
    let total = 0
    for (const it of items) total += it.weight
    let r = random() * total
    let picked = items.length - 1
    for (let j = 0; j < items.length; j++) {
      r -= items[j].weight
      if (r <= 0) {
        picked = j
        break
      }
    }
    selected.push(items[picked].id)
    items.splice(picked, 1)
  }
  return selected
}

function fisherYatesShuffle<T>(arr: T[], random: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function selectForTopic(
  slots: number,
  questions: Question[],
  topicProgress: TopicProgress | undefined,
  random: () => number
): string[] {
  if (slots <= 0 || questions.length === 0) return []

  const incorrectIds = new Set(topicProgress?.incorrectQuestionIds ?? [])
  const seenIds = new Set(topicProgress?.seenQuestionIds ?? [])

  // Bank-exhaustion: if every question in the topic has been seen and none
  // are flagged incorrect, treat all seen-correct questions as unseen for
  // this set's weighting. Incorrect-flagged questions never participate in
  // this reset (their weighting is preserved across the topic's lifetime).
  const bankExhausted =
    questions.length > 0 &&
    questions.every((q) => seenIds.has(q.id)) &&
    questions.every((q) => !incorrectIds.has(q.id))
  const effectiveSeen = bankExhausted ? new Set<string>() : seenIds

  const targets = computeDifficultyTargets(slots)
  const buckets = bucketByDifficulty(questions)
  const remaining: Record<Difficulty, number> = { ...targets }

  const selected: string[] = []
  for (const diff of DIFFICULTY_ORDER) {
    const bucket = buckets[diff]
    const need = remaining[diff]
    if (need <= 0) continue

    if (bucket.length >= need) {
      selected.push(...weightedSample(bucket, need, incorrectIds, effectiveSeen, random))
    } else {
      selected.push(
        ...weightedSample(bucket, bucket.length, incorrectIds, effectiveSeen, random)
      )
      const shortfall = need - bucket.length
      const fallback = SHORTFALL_FALLBACK[diff]
      if (fallback) remaining[fallback] += shortfall
    }
  }

  return selected
}

// Picks the actual question IDs for a set, given per-topic slot counts (from
// allocateTopicSlots), the question pool per topic, and the student's history.
// The final list is shuffled across topics so questions don't appear grouped
// by topic.
export function selectQuestions(
  slotsByTopic: Map<string, number>,
  questionsByTopic: Map<string, Question[]>,
  progress: TopicProgress[],
  random: () => number = Math.random
): string[] {
  const progressByTopic = new Map(progress.map((p) => [p.topicId, p]))
  const collected: string[] = []
  for (const [topicId, slots] of slotsByTopic) {
    const questions = questionsByTopic.get(topicId) ?? []
    collected.push(...selectForTopic(slots, questions, progressByTopic.get(topicId), random))
  }
  return fisherYatesShuffle(collected, random)
}

// Convenience wrapper that combines slot allocation and question selection
// into a single call — the typical entry point from the session controller.
export function generateSet(
  topics: TopicMeta[],
  questionsByTopic: Map<string, Question[]>,
  progress: TopicProgress[],
  setConfig: SetConfig,
  random: () => number = Math.random
): string[] {
  const slots = allocateTopicSlots(topics, progress, setConfig)
  return selectQuestions(slots, questionsByTopic, progress, random)
}
