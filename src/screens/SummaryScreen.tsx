import { useEffect, useMemo, useState } from 'react'
import type {
  MasteryState,
  Question,
  QuestionResult,
  SetRecord,
  TopicProgress,
  TopicStateChange,
} from '../types'
import { useApp } from '../store/appContextValue'
import { getProgress } from '../store/sessionStore'
import { loadManifest, loadTopic } from '../data/questionLoader'
import { MarkdownRenderer } from '../components/MarkdownRenderer'

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const

const STATE_LABEL: Record<MasteryState, string> = {
  unassessed: 'Unassessed',
  weak: 'Weak',
  in_progress: 'In Progress',
  mastered: 'Mastered',
}

const STATE_CHIP: Record<MasteryState, string> = {
  unassessed:
    'border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-200',
  weak:
    'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200',
  in_progress:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
  mastered:
    'border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200',
}

type Overview = {
  total: number
  correctCount: number
  incorrectCount: number
  skippedCount: number
  scoreEarned: number
  scorePossible: number
  accuracyPct: number
  avgTimeRatio: number
}

function computeOverview(
  results: QuestionResult[],
  questionsById: Map<string, Question>,
): Overview {
  let correctCount = 0
  let incorrectCount = 0
  let skippedCount = 0
  let scoreEarned = 0
  let scorePossible = 0
  let timeRatioSum = 0

  for (const r of results) {
    const q = questionsById.get(r.questionId)
    const score = q?.score ?? 0
    scorePossible += score
    if (r.skipped) {
      skippedCount += 1
      timeRatioSum += 1.0
    } else if (r.correct) {
      correctCount += 1
      scoreEarned += score
      timeRatioSum += r.expectedSec > 0 ? r.elapsedSec / r.expectedSec : 1.0
    } else {
      incorrectCount += 1
      timeRatioSum += r.expectedSec > 0 ? r.elapsedSec / r.expectedSec : 1.0
    }
  }
  const total = results.length
  const accuracyPct = total === 0 ? 0 : (correctCount / total) * 100
  const avgTimeRatio = total === 0 ? 0 : timeRatioSum / total
  return {
    total,
    correctCount,
    incorrectCount,
    skippedCount,
    scoreEarned,
    scorePossible,
    accuracyPct,
    avgTimeRatio,
  }
}

function recommendNextSize(topicProgress: TopicProgress[]): {
  size: 30 | 60 | 100
  reason: string
} {
  const weakCount = topicProgress.filter((t) => t.masteryState === 'weak').length
  if (weakCount > 3) {
    return { size: 100, reason: `${weakCount} topics still need work — try a 100-question set.` }
  }
  if (weakCount >= 1) {
    return {
      size: 60,
      reason: `${weakCount} weak topic${weakCount === 1 ? '' : 's'} — a 60-question set can shore them up.`,
    }
  }
  return {
    size: 30,
    reason: 'No weak topics — keep it light with a 30-question maintenance set.',
  }
}

export function SummaryScreen() {
  const { activeProfile, navigate } = useApp()
  const [questionsById, setQuestionsById] = useState<Map<string, Question> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())
  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(new Set())

  const progress = useMemo(() => {
    if (!activeProfile) return null
    try {
      return getProgress(activeProfile)
    } catch {
      return null
    }
  }, [activeProfile])

  const lastSet: SetRecord | null = useMemo(() => {
    if (!progress || progress.setHistory.length === 0) return null
    return progress.setHistory[progress.setHistory.length - 1]
  }, [progress])

  // Load every question referenced by the last set so the drilldown can show
  // question text, options, and explanation.
  useEffect(() => {
    if (!lastSet) return
    let cancelled = false
    ;(async () => {
      try {
        const manifest = await loadManifest()
        const want = new Set(lastSet.results.map((r) => r.questionId))
        const out = new Map<string, Question>()
        for (const t of manifest.topics) {
          const qs = await loadTopic(t.filePath)
          for (const q of qs) {
            if (want.has(q.id)) out.set(q.id, q)
          }
        }
        if (!cancelled) setQuestionsById(out)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load questions')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [lastSet])

  if (!activeProfile) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
          No active profile
        </h2>
        <button
          type="button"
          onClick={() => navigate('profile_select')}
          className="min-h-12 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Choose a profile
        </button>
      </section>
    )
  }

  if (!lastSet) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
          No completed sets yet
        </h2>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
          Finish a practice set to see a summary here.
        </p>
        <button
          type="button"
          onClick={() => navigate('set_config')}
          className="min-h-12 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Start a set
        </button>
      </section>
    )
  }

  if (loadError) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-12">
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {loadError}
        </p>
      </section>
    )
  }

  const overview = computeOverview(lastSet.results, questionsById ?? new Map())
  const recommendation = recommendNextSize(progress!.topicProgress)

  const resultsByTopic = new Map<string, QuestionResult[]>()
  for (const r of lastSet.results) {
    const list = resultsByTopic.get(r.topicId) ?? []
    list.push(r)
    resultsByTopic.set(r.topicId, list)
  }

  function toggleTopic(topicId: string) {
    setExpandedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(topicId)) next.delete(topicId)
      else next.add(topicId)
      return next
    })
  }

  function toggleExplanation(qid: string) {
    setExpandedExplanations((prev) => {
      const next = new Set(prev)
      if (next.has(qid)) next.delete(qid)
      else next.add(qid)
      return next
    })
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Set summary</h2>

      <OverviewCard overview={overview} />

      {lastSet.topicStateChanges.length > 0 && (
        <TopicStateChangesCard changes={lastSet.topicStateChanges} />
      )}

      <article
        aria-label="Recommendation"
        className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-100"
      >
        <h3 className="text-base font-semibold">Recommended next set</h3>
        <p className="mt-1">
          <span className="font-bold">{recommendation.size} questions</span> — {recommendation.reason}
        </p>
      </article>

      <article aria-label="Per-topic drilldown" className="space-y-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Per-topic results
        </h3>
        {[...resultsByTopic.entries()].map(([topicId, results]) => {
          const expanded = expandedTopics.has(topicId)
          const correct = results.filter((r) => r.correct).length
          const skipped = results.filter((r) => r.skipped).length
          return (
            <div
              key={topicId}
              className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-700"
            >
              <button
                type="button"
                onClick={() => toggleTopic(topicId)}
                aria-expanded={expanded}
                aria-controls={`topic-panel-${topicId}`}
                className="flex w-full items-center justify-between gap-3 bg-gray-50 px-4 py-3 text-left dark:bg-gray-800"
              >
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">{topicId}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-300">
                    {correct} correct · {results.length - correct - skipped} incorrect · {skipped} skipped
                  </div>
                </div>
                <span aria-hidden="true" className="text-gray-500 dark:text-gray-300">
                  {expanded ? '▾' : '▸'}
                </span>
              </button>
              {expanded && (
                <ul id={`topic-panel-${topicId}`} className="divide-y divide-gray-200 dark:divide-gray-700">
                  {results.map((r) => {
                    const q = questionsById?.get(r.questionId)
                    const explanationOpen = expandedExplanations.has(r.questionId)
                    const sel = r.selectedAnswer
                    const yourAnswerText = (() => {
                      if (sel === undefined || sel === 'skipped') return 'Skipped'
                      const optText = q?.options[sel]?.text ?? ''
                      return `${OPTION_LABELS[sel]} — ${optText}`
                    })()
                    const correctAnswerText = (() => {
                      if (!q) return null
                      return `${OPTION_LABELS[q.correct]} — ${q.options[q.correct].text}`
                    })()
                    return (
                      <li
                        key={r.questionId}
                        data-qid={r.questionId}
                        data-result={r.skipped ? 'skipped' : r.correct ? 'correct' : 'incorrect'}
                        className="px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            {q ? (
                              <MarkdownRenderer text={q.text} image={q.image} />
                            ) : (
                              <p className="text-sm text-gray-600 dark:text-gray-300">
                                Question {r.questionId}
                              </p>
                            )}
                          </div>
                          <span
                            aria-hidden="true"
                            className={
                              r.skipped
                                ? 'text-amber-700 dark:text-amber-400'
                                : r.correct
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                            }
                          >
                            {r.skipped ? '⊘' : r.correct ? '✓' : '✗'}
                          </span>
                        </div>
                        <dl className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                              Your answer
                            </dt>
                            <dd className="text-gray-900 dark:text-gray-100">
                              <MarkdownRenderer text={yourAnswerText} />
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                              Correct answer
                            </dt>
                            <dd className="text-gray-900 dark:text-gray-100">
                              {correctAnswerText ? (
                                <MarkdownRenderer text={correctAnswerText} />
                              ) : (
                                <span className="text-sm">—</span>
                              )}
                            </dd>
                          </div>
                        </dl>
                        {q && (
                          <button
                            type="button"
                            onClick={() => toggleExplanation(r.questionId)}
                            aria-expanded={explanationOpen}
                            aria-controls={`explanation-${r.questionId}`}
                            className="mt-2 text-xs font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
                          >
                            {explanationOpen ? 'Hide explanation' : 'Show explanation'}
                          </button>
                        )}
                        {q && explanationOpen && (
                          <div
                            id={`explanation-${r.questionId}`}
                            className="mt-2 rounded-md bg-gray-50 p-3 dark:bg-gray-800"
                          >
                            <MarkdownRenderer text={q.explanation} />
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </article>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={() => navigate('set_config')}
          className="min-h-12 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Start next set
        </button>
        <button
          type="button"
          onClick={() => navigate('dashboard')}
          className="min-h-12 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 dark:border-gray-600 dark:text-gray-100"
        >
          View dashboard
        </button>
      </div>
    </section>
  )
}

function OverviewCard({ overview }: { overview: Overview }) {
  return (
    <article
      aria-label="Set overview"
      className="grid grid-cols-2 gap-4 rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:grid-cols-4"
    >
      <Stat label="Score" value={`${overview.scoreEarned} / ${overview.scorePossible}`} />
      <Stat label="Accuracy" value={`${overview.accuracyPct.toFixed(0)}%`} />
      <Stat label="Avg time ratio" value={`${overview.avgTimeRatio.toFixed(2)}`} />
      <Stat
        label="Correct / Incorrect / Skipped"
        value={`${overview.correctCount} / ${overview.incorrectCount} / ${overview.skippedCount}`}
      />
    </article>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  )
}

function TopicStateChangesCard({ changes }: { changes: TopicStateChange[] }) {
  return (
    <article
      aria-label="Topic state changes"
      className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        Topic state changes
      </h3>
      <ul className="mt-2 space-y-2">
        {changes.map((c) => (
          <li
            key={c.topicId}
            data-topic-id={c.topicId}
            data-from-state={c.previousState}
            data-to-state={c.newState}
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <span className="font-medium text-gray-800 dark:text-gray-200">{c.topicId}</span>
            <StateChip state={c.previousState} />
            <span aria-hidden="true" className="text-gray-500 dark:text-gray-400">
              →
            </span>
            <StateChip state={c.newState} />
          </li>
        ))}
      </ul>
    </article>
  )
}

function StateChip({ state }: { state: MasteryState }) {
  return (
    <span
      data-state={state}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATE_CHIP[state]}`}
    >
      {STATE_LABEL[state]}
    </span>
  )
}
