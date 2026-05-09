import { useEffect, useMemo, useState } from 'react'
import type { ActiveSet, FeedbackMode, Manifest, Question, SetConfig, SetSize } from '../types'
import { useApp } from '../store/appContextValue'
import { getProgress } from '../store/sessionStore'
import { getBankWarnings, loadManifest, loadTopic } from '../data/questionLoader'
import { generateSet } from '../engine/adaptiveEngine'

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

export function SetConfigScreen() {
  const { activeProfile, navigate, setActiveSet } = useApp()
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  const [size, setSize] = useState<SetSize | null>(null)
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)

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

  const warnings = useMemo(
    () => (manifest ? getBankWarnings(manifest) : []),
    [manifest],
  )

  const startDisabled = size === null || feedbackMode === null || manifest === null || building

  async function handleStart() {
    if (startDisabled || !manifest || size === null || feedbackMode === null || !activeProfile) {
      return
    }

    setBuilding(true)
    setBuildError(null)
    try {
      const progress = getProgress(activeProfile)
      const setConfig: SetConfig = { size, feedbackMode }

      // Load every topic's questions before running the engine. The engine
      // needs Question[] per topic for difficulty bucketing.
      const questionLists = await Promise.all(
        manifest.topics.map((t) => loadTopic(t.filePath)),
      )
      const questionsByTopic = new Map<string, Question[]>()
      manifest.topics.forEach((t, i) => questionsByTopic.set(t.topicId, questionLists[i]))

      const questionIds = generateSet(
        manifest.topics,
        questionsByTopic,
        progress.topicProgress,
        setConfig,
      )

      if (questionIds.length === 0) {
        throw new Error('The question bank is empty for this profile.')
      }

      const activeSet: ActiveSet = {
        questionIds,
        setConfig,
        currentIndex: 0,
        answers: new Map(),
        timings: new Map(),
      }
      setActiveSet(activeSet)
      navigate('active_set')
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
            className="rounded-md px-2 py-1 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50"
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
    </section>
  )
}
