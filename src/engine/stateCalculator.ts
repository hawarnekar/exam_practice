import type {
  MasteryState,
  QuestionResult,
  TopicProgress,
  TopicStateChange,
} from '../types'

const MASTERED_ACCURACY = 0.9
const MASTERED_TIME_RATIO = 1.0
const IN_PROGRESS_ACCURACY = 0.7
const IN_PROGRESS_TIME_RATIO = 1.25

export type CalculateStateResult = {
  topicProgress: TopicProgress[]
  changes: TopicStateChange[]
}

function classify(accuracy: number, timeRatio: number): MasteryState {
  if (accuracy >= MASTERED_ACCURACY && timeRatio <= MASTERED_TIME_RATIO) return 'mastered'
  if (accuracy >= IN_PROGRESS_ACCURACY && timeRatio <= IN_PROGRESS_TIME_RATIO) return 'in_progress'
  return 'weak'
}

// Skipped questions count as having taken exactly the expected time (ratio = 1.0),
// independent of whatever elapsedSec the caller recorded.
function timeRatioOf(r: QuestionResult): number {
  if (r.skipped) return 1.0
  return r.elapsedSec / r.expectedSec
}

export function calculateState(
  results: QuestionResult[],
  currentProgress: TopicProgress[]
): CalculateStateResult {
  const progressByTopic = new Map<string, TopicProgress>(
    currentProgress.map((p) => [p.topicId, p])
  )

  const resultsByTopic = new Map<string, QuestionResult[]>()
  for (const r of results) {
    const list = resultsByTopic.get(r.topicId) ?? []
    list.push(r)
    resultsByTopic.set(r.topicId, list)
  }

  const updatedProgress: TopicProgress[] = []
  const changes: TopicStateChange[] = []
  const handled = new Set<string>()

  for (const [topicId, topicResults] of resultsByTopic) {
    handled.add(topicId)

    const total = topicResults.length
    const correctCount = topicResults.filter((r) => r.correct).length
    const accuracy = correctCount / total

    const ratios = topicResults.map(timeRatioOf)
    const avgTimeRatio = ratios.reduce((sum, t) => sum + t, 0) / ratios.length

    const newState = classify(accuracy, avgTimeRatio)

    const prev = progressByTopic.get(topicId)
    const prevState: MasteryState = prev?.masteryState ?? 'unassessed'
    const incorrectIds = new Set(prev?.incorrectQuestionIds ?? [])
    const seenIds = new Set(prev?.seenQuestionIds ?? [])

    for (const r of topicResults) {
      seenIds.add(r.questionId)
      if (r.correct) {
        incorrectIds.delete(r.questionId)
      } else {
        incorrectIds.add(r.questionId)
      }
    }

    updatedProgress.push({
      topicId,
      masteryState: newState,
      lastSetAccuracy: accuracy,
      lastSetTimeRatio: avgTimeRatio,
      incorrectQuestionIds: [...incorrectIds].sort(),
      seenQuestionIds: [...seenIds].sort(),
    })

    if (newState !== prevState) {
      changes.push({ topicId, previousState: prevState, newState })
    }
  }

  // Carry forward topics not touched by this set
  for (const p of currentProgress) {
    if (!handled.has(p.topicId)) updatedProgress.push(p)
  }

  updatedProgress.sort((a, b) => a.topicId.localeCompare(b.topicId))

  return { topicProgress: updatedProgress, changes }
}
