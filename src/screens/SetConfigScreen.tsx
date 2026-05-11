import { useEffect, useMemo, useState } from 'react'
import type {
  ActiveSet,
  FeedbackMode,
  Manifest,
  Question,
  SetConfig,
  SetSize,
  TopicMeta,
} from '../types'
import { useApp } from '../store/appContextValue'
import { getLastSetFilter, getProgress, setLastSetFilter } from '../store/sessionStore'
import { getBankWarnings, loadManifest, loadTopic } from '../data/questionLoader'
import { generateSet, type GeneratedSet } from '../engine/adaptiveEngine'
import { randomPermutation } from '../engine/shuffleOptions'

const SET_SIZES: SetSize[] = [30, 60, 100]

const FEEDBACK_OPTIONS: { mode: FeedbackMode; label: string; description: string }[] = [
  {
    mode: 'immediate',
    label: 'Immediate Feedback',
    description: 'See whether each answer is correct as you go.',
  },
  {
    mode: 'end_of_set',
    label: 'End-of-Set Review',
    description: 'Answer freely, review every answer at the end.',
  },
]

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

export function SetConfigScreen() {
  const { activeProfile, navigate, setActiveSet } = useApp()
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  // Pre-fill the Subject/Topic from the profile's saved filter at mount.
  // Validation against the loaded manifest happens implicitly: if the saved
  // subject no longer exists in the manifest, the <select> renders with no
  // matching <option> selected and the user must pick again.
  const [subject, setSubject] = useState<string | null>(() => {
    if (!activeProfile) return null
    try {
      return getLastSetFilter(activeProfile)?.subject ?? null
    } catch {
      return null
    }
  })
  const [topic, setTopic] = useState<string | null>(() => {
    if (!activeProfile) return null
    try {
      return getLastSetFilter(activeProfile)?.topic ?? null
    } catch {
      return null
    }
  })
  const [size, setSize] = useState<SetSize | null>(null)
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [shortfallPrompt, setShortfallPrompt] = useState<
    {
      result: GeneratedSet
      setConfig: SetConfig
      questionsByTopic: Map<string, Question[]>
    } | null
  >(null)

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

  const subjects = useMemo(
    () => (manifest ? uniqueSubjects(manifest.topics) : []),
    [manifest],
  )
  const topicChoices = useMemo(
    () => (manifest && subject ? topicsInSubject(manifest.topics, subject) : []),
    [manifest, subject],
  )

  const filteredTopics = useMemo(() => {
    if (!manifest || !subject) return []
    return manifest.topics.filter(
      (t) => t.subject === subject && (topic === null || t.topic === topic),
    )
  }, [manifest, subject, topic])

  const warnings = useMemo(() => {
    if (!manifest || !subject) return []
    const allWarnings = getBankWarnings(manifest)
    const eligibleIds = new Set(filteredTopics.map((t) => t.topicId))
    return allWarnings.filter((w) => {
      const id = w.split(':')[0]
      return eligibleIds.has(id)
    })
  }, [manifest, subject, filteredTopics])

  const startDisabled =
    subject === null ||
    size === null ||
    feedbackMode === null ||
    manifest === null ||
    building

  function launchSet(
    result: GeneratedSet,
    setConfig: SetConfig,
    questionsByTopic: Map<string, Question[]>,
  ) {
    // Shuffle each question's options independently. Same questionId can
    // appear once in a set, but if it ever recurs the same permutation is
    // reused so the user doesn't see "the same question with different
    // option positions" within one set.
    const optionOrder = new Map<string, number[]>()
    const questionsById = new Map<string, Question>()
    for (const list of questionsByTopic.values()) {
      for (const q of list) questionsById.set(q.id, q)
    }
    for (const qid of result.questionIds) {
      if (optionOrder.has(qid)) continue
      const q = questionsById.get(qid)
      if (!q) continue
      optionOrder.set(qid, randomPermutation(q.options.length))
    }

    const activeSet: ActiveSet = {
      questionIds: result.questionIds,
      setConfig,
      currentIndex: 0,
      answers: new Map(),
      timings: new Map(),
      optionOrder,
    }
    setActiveSet(activeSet)
    navigate('active_set')
  }

  async function handleStart() {
    if (
      startDisabled ||
      !manifest ||
      size === null ||
      feedbackMode === null ||
      subject === null ||
      !activeProfile
    ) {
      return
    }

    setBuilding(true)
    setBuildError(null)
    try {
      const progress = getProgress(activeProfile)
      const setConfig: SetConfig = {
        size,
        feedbackMode,
        filter: { subject, topic },
      }

      if (filteredTopics.length === 0) {
        throw new Error('No topics match the selected Subject/Topic.')
      }

      const questionLists = await Promise.all(
        filteredTopics.map((t) => loadTopic(t.filePath)),
      )
      const questionsByTopic = new Map<string, Question[]>()
      filteredTopics.forEach((t, i) => questionsByTopic.set(t.topicId, questionLists[i]))

      const result = generateSet(
        filteredTopics,
        questionsByTopic,
        progress.topicProgress,
        setConfig,
      )

      if (result.questionIds.length === 0) {
        throw new Error('The question bank is empty for the selected Subject/Topic.')
      }

      // Persist the chosen filter so the dashboard and the next session
      // pre-fill to the same scope.
      setLastSetFilter(activeProfile, setConfig.filter)

      if (result.shortfall > 0) {
        setShortfallPrompt({ result, setConfig, questionsByTopic })
        return
      }

      launchSet(result, setConfig, questionsByTopic)
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Failed to build set')
    } finally {
      setBuilding(false)
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Set up your practice set
          </h2>
          {activeProfile && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Active profile: <span className="font-medium">{activeProfile}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('profile_select')}
          className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
        >
          Switch profile
        </button>
      </div>

      {manifestError && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
        >
          {manifestError}
        </p>
      )}

      <fieldset className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="subject-select"
            className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200"
          >
            Subject <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <select
            id="subject-select"
            value={subject ?? ''}
            onChange={(e) => {
              const next = e.target.value || null
              setSubject(next)
              setTopic(null)
            }}
            className="block min-h-12 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">— Select subject —</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="topic-select"
            className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200"
          >
            Topic
          </label>
          <select
            id="topic-select"
            value={topic ?? ''}
            disabled={subject === null}
            onChange={(e) => setTopic(e.target.value || null)}
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
      </fieldset>

      {warnings.length > 0 && !bannerDismissed && (
        <div
          role="status"
          aria-label="Question bank size warning"
          className="mb-6 flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100"
        >
          <div>
            <p className="font-medium">Some topics have a small question bank:</p>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss bank size warning"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-xl text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600 dark:text-amber-100 dark:hover:bg-amber-900/50"
          >
            ×
          </button>
        </div>
      )}

      <fieldset className="mb-6">
        <legend className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
          Set size
        </legend>
        <div className="grid grid-cols-3 gap-3">
          {SET_SIZES.map((n) => {
            const selected = size === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => setSize(n)}
                aria-pressed={selected}
                className={`min-h-12 rounded-md border px-4 py-3 text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  selected
                    ? 'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-100'
                    : 'border-gray-300 text-gray-800 dark:border-gray-600 dark:text-gray-100'
                }`}
              >
                {n}
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="mb-6">
        <legend className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
          Feedback mode
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FEEDBACK_OPTIONS.map((opt) => {
            const selected = feedbackMode === opt.mode
            return (
              <button
                key={opt.mode}
                type="button"
                onClick={() => setFeedbackMode(opt.mode)}
                aria-pressed={selected}
                className={`min-h-12 rounded-md border px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  selected
                    ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <div className="font-semibold text-gray-900 dark:text-gray-100">{opt.label}</div>
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {opt.description}
                </div>
              </button>
            )
          })}
        </div>
      </fieldset>

      {buildError && (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {buildError}
        </p>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={startDisabled}
        className="min-h-12 w-full rounded-md bg-blue-600 px-4 py-3 text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {building ? 'Building set…' : 'Start set'}
      </button>

      {shortfallPrompt && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="shortfall-title"
          aria-describedby="shortfall-body"
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-md rounded-md bg-white p-5 shadow-lg dark:bg-gray-800">
            <h3
              id="shortfall-title"
              className="text-lg font-semibold text-amber-700 dark:text-amber-300"
            >
              Limited questions available
            </h3>
            <p
              id="shortfall-body"
              className="mt-2 text-sm text-gray-800 dark:text-gray-100"
            >
              Your bank has only {shortfallPrompt.result.questionIds.length} eligible question
              {shortfallPrompt.result.questionIds.length === 1 ? '' : 's'} for the requested{' '}
              {shortfallPrompt.result.requestedSize}. Start a shorter set anyway?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShortfallPrompt(null)}
                className="min-h-12 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 dark:border-gray-600 dark:text-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { result, setConfig, questionsByTopic } = shortfallPrompt
                  setShortfallPrompt(null)
                  launchSet(result, setConfig, questionsByTopic)
                }}
                className="min-h-12 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                Start with {shortfallPrompt.result.questionIds.length}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
