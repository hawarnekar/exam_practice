import { useEffect, useMemo, useState } from 'react'
import type {
  Manifest,
  MasteryState,
  SetRecord,
  SetRecordSummary,
  TopicMeta,
  TopicStateChange,
} from '../types'
import { useApp } from '../store/appContextValue'
import { getLastSetFilter, getProgress } from '../store/sessionStore'
import { loadManifest } from '../data/questionLoader'

const STATE_BG: Record<MasteryState, string> = {
  unassessed: 'bg-gray-300 dark:bg-gray-600',
  weak: 'bg-red-500 dark:bg-red-500',
  in_progress: 'bg-amber-500 dark:bg-amber-400',
  mastered: 'bg-green-500 dark:bg-green-500',
}

const STATE_LABEL: Record<MasteryState, string> = {
  unassessed: 'Unassessed',
  weak: 'Weak',
  in_progress: 'In Progress',
  mastered: 'Mastered',
}

function setAccuracy(rec: SetRecord): number {
  if (rec.results.length === 0) return 0
  return rec.results.filter((r) => r.correct).length / rec.results.length
}

function groupBySubject(topics: TopicMeta[]): Map<string, TopicMeta[]> {
  const out = new Map<string, TopicMeta[]>()
  for (const t of topics) {
    const list = out.get(t.subject) ?? []
    list.push(t)
    out.set(t.subject, list)
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.topicId.localeCompare(b.topicId))
  }
  return out
}

function uniqueSubjects(topics: TopicMeta[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of topics) {
    if (!seen.has(t.subject)) {
      seen.add(t.subject)
      out.push(t.subject)
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

function topicsInSubject(topics: TopicMeta[], subject: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of topics) {
    if (t.subject === subject && !seen.has(t.topic)) {
      seen.add(t.topic)
      out.push(t.topic)
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

// Walks the set history and produces a per-topic snapshot of mastery state
// after each set. Topics that first appear later are padded with
// 'unassessed' for the prior sets so all timelines have equal length.
// Accepts the union of (old) summarized entries followed by full SetRecords
// so the timeline survives the rolloff that keeps localStorage bounded.
function buildTimeline(
  changeStream: { topicStateChanges: TopicStateChange[] }[],
): Map<string, MasteryState[]> {
  const current = new Map<string, MasteryState>()
  const timelines = new Map<string, MasteryState[]>()
  for (let i = 0; i < changeStream.length; i++) {
    const rec = changeStream[i]
    for (const change of rec.topicStateChanges) {
      current.set(change.topicId, change.newState)
      if (!timelines.has(change.topicId)) {
        timelines.set(change.topicId, new Array(i).fill('unassessed'))
      }
    }
    for (const [topicId, arr] of timelines) {
      arr.push(current.get(topicId) ?? 'unassessed')
    }
  }
  return timelines
}

const SPARK_W = 220
const SPARK_H = 48
const SPARK_PAD = 4

function AccuracySparkline({ values }: { values: number[] }) {
  if (values.length === 0) {
    return (
      <div
        data-testid="accuracy-sparkline"
        data-points="0"
        className="text-sm text-gray-500 dark:text-gray-400"
      >
        No completed sets yet.
      </div>
    )
  }
  const innerW = SPARK_W - SPARK_PAD * 2
  const innerH = SPARK_H - SPARK_PAD * 2
  const step = values.length === 1 ? 0 : innerW / (values.length - 1)
  const pts = values
    .map((v, i) => {
      const x = SPARK_PAD + step * i
      const y = SPARK_PAD + innerH * (1 - v)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      data-testid="accuracy-sparkline"
      data-points={String(values.length)}
      role="img"
      aria-label={`Accuracy trend for the last ${values.length} sets`}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className="h-12 w-full max-w-xs"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-blue-600 dark:text-blue-400"
      />
      {values.map((v, i) => {
        const x = SPARK_PAD + step * i
        const y = SPARK_PAD + innerH * (1 - v)
        return (
          <circle
            key={i}
            cx={x.toFixed(1)}
            cy={y.toFixed(1)}
            r={2}
            className="fill-blue-600 dark:fill-blue-400"
          />
        )
      })}
    </svg>
  )
}

export function DashboardScreen() {
  const { activeProfile, navigate } = useApp()
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  // null = "All Subjects" (no subject filter). "All Topics" within a subject
  // is represented as `topicFilter === null`. Pre-filled from the profile's
  // saved SetConfig filter; dashboard does NOT persist further changes.
  const [subjectFilter, setSubjectFilter] = useState<string | null>(() => {
    if (!activeProfile) return null
    try {
      return getLastSetFilter(activeProfile)?.subject ?? null
    } catch {
      return null
    }
  })
  const [topicFilter, setTopicFilter] = useState<string | null>(() => {
    if (!activeProfile) return null
    try {
      return getLastSetFilter(activeProfile)?.topic ?? null
    } catch {
      return null
    }
  })

  const progress = useMemo(() => {
    if (!activeProfile) return null
    try {
      return getProgress(activeProfile)
    } catch {
      return null
    }
  }, [activeProfile])

  useEffect(() => {
    let cancelled = false
    loadManifest()
      .then((m) => {
        if (!cancelled) setManifest(m)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setManifestError(err instanceof Error ? err.message : 'Failed to load manifest')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  if (!progress) return null

  const setHistory = progress.setHistory
  const setHistorySummary: SetRecordSummary[] = progress.setHistorySummary ?? []
  const totalSetsCompleted = setHistorySummary.length + setHistory.length
  const stateById = new Map(progress.topicProgress.map((p) => [p.topicId, p.masteryState]))

  const filteredTopics = manifest
    ? manifest.topics.filter(
        (t) =>
          (subjectFilter === null || t.subject === subjectFilter) &&
          (topicFilter === null || t.topic === topicFilter),
      )
    : []
  const filteredTopicIds = new Set(filteredTopics.map((t) => t.topicId))
  const subjects = manifest ? uniqueSubjects(manifest.topics) : []
  const topicChoices =
    manifest && subjectFilter ? topicsInSubject(manifest.topics, subjectFilter) : []

  // Sparkline always uses the most recent 10 sets. With the rolloff cap
  // those almost always live in setHistory, but we fall back to summaries
  // for the gap on profiles that have very few recent full records.
  const recentForSpark: { accuracy: number }[] = [
    ...setHistorySummary.map((s) => ({ accuracy: s.accuracy })),
    ...setHistory.map((r) => ({ accuracy: setAccuracy(r) })),
  ].slice(-10)
  const accuracyValues = recentForSpark.map((r) => r.accuracy)

  const timelines = buildTimeline([...setHistorySummary, ...setHistory])

  return (
    <section className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h2>

      <article
        aria-label="Activity summary"
        className="grid grid-cols-2 gap-4 rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Streak
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <span data-testid="streak-count">{progress.streak}</span>{' '}
            <span className="text-sm font-normal text-gray-600 dark:text-gray-300">
              day{progress.streak === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Sets completed
          </div>
          <div
            data-testid="sets-completed"
            className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100"
          >
            {totalSetsCompleted}
          </div>
        </div>
      </article>

      {manifestError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {manifestError}
        </p>
      )}

      {manifest && (
        <article
          aria-label="Filter dashboard by subject and topic"
          className="grid grid-cols-1 gap-4 rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:grid-cols-2"
        >
          <div>
            <label
              htmlFor="dashboard-subject"
              className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200"
            >
              Subject
            </label>
            <select
              id="dashboard-subject"
              value={subjectFilter ?? ''}
              onChange={(e) => {
                const next = e.target.value || null
                setSubjectFilter(next)
                setTopicFilter(null)
              }}
              className="block min-h-12 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="dashboard-topic"
              className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200"
            >
              Topic
            </label>
            <select
              id="dashboard-topic"
              value={topicFilter ?? ''}
              disabled={subjectFilter === null}
              onChange={(e) => setTopicFilter(e.target.value || null)}
              className="block min-h-12 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">All topics</option>
              {topicChoices.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </article>
      )}

      {manifest && (
        <article aria-label="Subject heatmap" className="space-y-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Subject heatmap
          </h3>
          {filteredTopics.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              No topics match the current filter.
            </p>
          ) : (
            [...groupBySubject(filteredTopics).entries()].map(([subject, topics]) => (
              <div key={subject} data-subject={subject}>
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                  {subject}
                </div>
                <ul
                  role="list"
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
                >
                  {topics.map((t) => {
                    const state = stateById.get(t.topicId) ?? 'unassessed'
                    return (
                      <li
                        key={t.topicId}
                        data-topic-id={t.topicId}
                        data-state={state}
                        className={`rounded-md p-3 text-xs font-medium text-white ${STATE_BG[state]}`}
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-wide opacity-90">
                          {t.subtopic}
                        </div>
                        <div className="mt-1 text-xs opacity-90">{STATE_LABEL[state]}</div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </article>
      )}

      <article
        aria-label="Accuracy trend"
        className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-gray-100">
          Accuracy — last {Math.min(10, totalSetsCompleted) || 0} sets
        </h3>
        <AccuracySparkline values={accuracyValues} />
      </article>

      {timelines.size > 0 && (
        <article aria-label="Per-topic state timeline" className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Per-topic state timeline
          </h3>
          <ul className="space-y-2">
            {[...timelines.entries()]
              .filter(([topicId]) => !manifest || filteredTopicIds.has(topicId))
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([topicId, states]) => (
                <li
                  key={topicId}
                  data-topic-id={topicId}
                  className="flex flex-wrap items-center gap-3"
                >
                  <span className="min-w-40 truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                    {topicId}
                  </span>
                  <div
                    data-testid={`timeline-${topicId}`}
                    className="flex flex-wrap items-center gap-1"
                  >
                    {states.map((s, i) => (
                      <span
                        key={i}
                        data-state={s}
                        title={`Set ${i + 1}: ${STATE_LABEL[s]}`}
                        aria-label={`Set ${i + 1}: ${STATE_LABEL[s]}`}
                        className={`inline-block h-3 w-3 rounded-full ${STATE_BG[s]}`}
                      />
                    ))}
                  </div>
                </li>
              ))}
          </ul>
        </article>
      )}

      <div>
        <button
          type="button"
          onClick={() => navigate('set_config')}
          className="min-h-12 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Start new set
        </button>
      </div>
    </section>
  )
}
