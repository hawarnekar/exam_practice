import { useEffect, useMemo, useRef, useState } from 'react'
import type { Question, QuestionResult, SetRecord } from '../types'
import { useApp } from '../store/appContextValue'
import { getProgress, saveProgress } from '../store/sessionStore'
import { loadManifest, loadTopic } from '../data/questionLoader'
import { calculateState } from '../engine/stateCalculator'
import { QuestionCard } from '../components/QuestionCard'
import { FeedbackPanel } from '../components/FeedbackPanel'
import { QuestionPalette, type PaletteStatus } from '../components/QuestionPalette'

type LoadedQuestion = { q: Question; topicId: string }

function todayDateString(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isYesterday(prev: string, today: string): boolean {
  const p = new Date(prev + 'T00:00:00')
  const t = new Date(today + 'T00:00:00')
  return t.getTime() - p.getTime() === 24 * 60 * 60 * 1000
}

export function SessionScreen() {
  const { activeProfile, activeSet, navigate, setActiveSet } = useApp()
  const [loaded, setLoaded] = useState<Map<string, LoadedQuestion> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState<number>(activeSet?.currentIndex ?? 0)
  const [answers, setAnswers] = useState<Map<string, number | 'skipped'>>(
    () => new Map(activeSet?.answers ?? []),
  )
  const [timings, setTimings] = useState<Map<string, number>>(
    () => new Map(activeSet?.timings ?? []),
  )
  // Tracks the index for which the inline feedback panel is open. Deriving
  // showFeedback from this avoids resetting state in an effect when the
  // current question changes.
  const [feedbackForIndex, setFeedbackForIndex] = useState<number | null>(null)
  const [confirmingSubmit, setConfirmingSubmit] = useState(false)
  const viewStartRef = useRef<number>(Date.now())

  // Load every required question once.
  useEffect(() => {
    if (!activeSet) return
    let cancelled = false
    ;(async () => {
      try {
        const manifest = await loadManifest()
        const want = new Set(activeSet.questionIds)
        const out = new Map<string, LoadedQuestion>()
        for (const t of manifest.topics) {
          const qs = await loadTopic(t.filePath)
          for (const q of qs) {
            if (want.has(q.id)) out.set(q.id, { q, topicId: t.topicId })
          }
        }
        if (!cancelled) setLoaded(out)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load questions')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeSet])

  // Reset the view-start timestamp whenever the visible question changes.
  // Note: showFeedback is *derived* from feedbackForIndex, so it auto-clears
  // without a setState here (which would trip the lint rule).
  useEffect(() => {
    viewStartRef.current = Date.now()
  }, [currentIndex])

  const currentEntry: LoadedQuestion | null = useMemo(() => {
    if (!activeSet || !loaded) return null
    const id = activeSet.questionIds[currentIndex]
    return loaded.get(id) ?? null
  }, [activeSet, loaded, currentIndex])

  if (!activeSet) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h2 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
          No active set
        </h2>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
          Configure a new practice set to begin.
        </p>
        <button
          type="button"
          onClick={() => navigate('set_config')}
          className="min-h-12 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Go to Set Configuration
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

  if (!loaded || !currentEntry) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm text-gray-600 dark:text-gray-300">Loading questions…</p>
      </section>
    )
  }

  const { q: currentQuestion } = currentEntry
  const total = activeSet.questionIds.length
  const isLast = currentIndex === total - 1
  const isImmediate = activeSet.setConfig.feedbackMode === 'immediate'
  const selectedAnswer = answers.get(currentQuestion.id) ?? null
  const showFeedback = feedbackForIndex === currentIndex

  function recordAnswer(value: number | 'skipped') {
    const elapsed = Math.max(
      0,
      Math.round((Date.now() - viewStartRef.current) / 1000),
    )
    setAnswers((prev) => {
      const next = new Map(prev)
      next.set(currentQuestion.id, value)
      return next
    })
    setTimings((prev) => {
      const next = new Map(prev)
      // Skipped is treated as expected_time_sec (per PRD/CLAUDE.md). For
      // answered questions, store the actual elapsed time.
      next.set(
        currentQuestion.id,
        value === 'skipped' ? currentQuestion.expected_time_sec : elapsed,
      )
      return next
    })
  }

  function handleAnswer(idx: number) {
    if (isImmediate && showFeedback) return // forward-only after feedback shown
    recordAnswer(idx)
    if (isImmediate) setFeedbackForIndex(currentIndex)
  }

  function handleSkip() {
    if (isImmediate && showFeedback) return
    recordAnswer('skipped')
    if (isImmediate) setFeedbackForIndex(currentIndex)
  }

  function handleNext() {
    if (isLast) {
      submitSet()
      return
    }
    setCurrentIndex((i) => i + 1)
  }

  function handlePrev() {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1)
  }

  function buildResults(): QuestionResult[] {
    const out: QuestionResult[] = []
    for (const id of activeSet!.questionIds) {
      const entry = loaded!.get(id)
      if (!entry) continue
      const ans = answers.get(id)
      const skipped = ans === undefined || ans === 'skipped'
      const correct = !skipped && ans === entry.q.correct
      const elapsedSec = timings.get(id) ?? entry.q.expected_time_sec
      out.push({
        questionId: id,
        topicId: entry.topicId,
        selectedAnswer: ans ?? 'skipped',
        correct,
        skipped,
        elapsedSec,
        expectedSec: entry.q.expected_time_sec,
      })
    }
    return out
  }

  function submitSet() {
    if (!activeProfile) {
      navigate('profile_select')
      return
    }
    const progress = getProgress(activeProfile)
    const results = buildResults()
    const { topicProgress: nextTopicProgress, changes } = calculateState(
      results,
      progress.topicProgress,
    )

    const today = todayDateString()
    let nextStreak: number
    if (progress.lastSetDate === today) nextStreak = progress.streak
    else if (progress.lastSetDate && isYesterday(progress.lastSetDate, today)) {
      nextStreak = progress.streak + 1
    } else nextStreak = 1

    const setRecord: SetRecord = {
      setNumber: progress.setHistory.length + 1,
      date: new Date().toISOString(),
      size: activeSet!.setConfig.size,
      feedbackMode: activeSet!.setConfig.feedbackMode,
      results,
      topicStateChanges: changes,
    }

    saveProgress(activeProfile, {
      ...progress,
      topicProgress: nextTopicProgress,
      setHistory: [...progress.setHistory, setRecord],
      streak: nextStreak,
      lastSetDate: today,
    })

    setActiveSet(null)
    navigate('set_summary')
  }

  const paletteStatuses: PaletteStatus[] = activeSet.questionIds.map((id) => {
    if (!answers.has(id)) return 'unanswered'
    return answers.get(id) === 'skipped' ? 'skipped' : 'answered'
  })
  const unansweredCount = paletteStatuses.filter((s) => s === 'unanswered').length
  const skippedCount = paletteStatuses.filter((s) => s === 'skipped').length
  const allDone = unansweredCount === 0

  function handleSubmitClick() {
    if (skippedCount > 0) setConfirmingSubmit(true)
    else submitSet()
  }

  return (
    <section>
      <QuestionCard
        key={currentQuestion.id}
        question={currentQuestion}
        questionNumber={currentIndex + 1}
        totalQuestions={total}
        selectedAnswer={selectedAnswer}
        onAnswer={handleAnswer}
        onSkip={handleSkip}
        feedbackMode={activeSet.setConfig.feedbackMode}
      />

      {isImmediate && showFeedback && selectedAnswer !== null && (
        <FeedbackPanel
          question={currentQuestion}
          selectedIndex={selectedAnswer}
          isLast={isLast}
          onNext={handleNext}
        />
      )}

      {!isImmediate && (
        <>
          <QuestionPalette
            total={total}
            currentIndex={currentIndex}
            statuses={paletteStatuses}
            onNavigate={setCurrentIndex}
          />

          <div className="mx-auto mt-4 flex max-w-3xl items-center justify-between gap-3 px-4">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="min-h-12 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 dark:border-gray-600 dark:text-gray-100 disabled:opacity-40"
            >
              Previous
            </button>
            {!isLast && (
              <button
                type="button"
                onClick={handleNext}
                className="min-h-12 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 dark:border-gray-600 dark:text-gray-100"
              >
                Next
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmitClick}
              disabled={!allDone}
              title={!allDone ? `${unansweredCount} question${unansweredCount === 1 ? '' : 's'} still unanswered` : undefined}
              aria-label={
                !allDone
                  ? `Submit set (${unansweredCount} question${unansweredCount === 1 ? '' : 's'} still unanswered)`
                  : 'Submit set'
              }
              className="min-h-12 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Submit set
            </button>
          </div>

          {!allDone && (
            <p
              role="status"
              aria-live="polite"
              className="mx-auto mt-2 max-w-3xl px-4 text-sm text-gray-600 dark:text-gray-300"
            >
              {unansweredCount} question{unansweredCount === 1 ? '' : 's'} still unanswered.
            </p>
          )}

          <div className="pb-10" />

          {confirmingSubmit && (
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="submit-confirm-title"
              aria-describedby="submit-confirm-body"
              className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
            >
              <div className="w-full max-w-md rounded-md bg-white p-5 shadow-lg dark:bg-gray-800">
                <h3
                  id="submit-confirm-title"
                  className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                  Submit with skipped questions?
                </h3>
                <p
                  id="submit-confirm-body"
                  className="mt-2 text-sm text-gray-700 dark:text-gray-200"
                >
                  You have {skippedCount} skipped question{skippedCount === 1 ? '' : 's'}. Submit anyway?
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingSubmit(false)}
                    className="min-h-12 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 dark:border-gray-600 dark:text-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingSubmit(false)
                      submitSet()
                    }}
                    className="min-h-12 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
                  >
                    Submit anyway
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

