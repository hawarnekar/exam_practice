import { useEffect } from 'react'
import type { FeedbackMode, Question } from '../types'
import { MarkdownRenderer } from './MarkdownRenderer'
import { useQuestionTimer } from '../hooks/useQuestionTimer'

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const

type QuestionCardProps = {
  question: Question
  questionNumber: number
  totalQuestions: number
  selectedAnswer: number | 'skipped' | null
  onAnswer: (index: number) => void
  onSkip: () => void
  feedbackMode: FeedbackMode
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const COLOR_CLASS = {
  normal: 'text-gray-700 dark:text-gray-300',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
} as const

export function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  selectedAnswer,
  onAnswer,
  onSkip,
  feedbackMode,
}: QuestionCardProps) {
  const { elapsedSec, colorState, reset } = useQuestionTimer(question.expected_time_sec)

  // Restart the stopwatch whenever the question changes. Parents that swap
  // questions in place (no `key` change) still get a fresh timer per question.
  useEffect(() => {
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key >= '1' && e.key <= '4') {
        const idx = Number(e.key) - 1
        if (idx < question.options.length) {
          e.preventDefault()
          onAnswer(idx)
        }
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        onSkip()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [question.options.length, onAnswer, onSkip])

  const modeHint =
    feedbackMode === 'immediate'
      ? 'Immediate feedback after each answer'
      : 'Review all answers at end of set'

  return (
    <article className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-4 flex items-baseline justify-between">
        <span
          className="text-sm font-medium text-gray-600 dark:text-gray-400"
          aria-label={`Question ${questionNumber} of ${totalQuestions}`}
        >
          Q {questionNumber} / {totalQuestions}
        </span>
        <span
          role="timer"
          aria-live="off"
          aria-label={`Elapsed time ${formatTime(elapsedSec)}`}
          data-color-state={colorState}
          className={`text-sm font-medium tabular-nums ${COLOR_CLASS[colorState]}`}
        >
          {formatTime(elapsedSec)}
        </span>
      </header>

      <div className="mb-6">
        <MarkdownRenderer text={question.text} image={question.image} />
      </div>

      <ol className="space-y-2">
        {question.options.map((opt, i) => {
          const isSelected = selectedAnswer === i
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onAnswer(i)}
                aria-pressed={isSelected}
                aria-keyshortcuts={String(i + 1)}
                className={`flex min-h-12 w-full items-start gap-3 rounded-md border px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">
                  {OPTION_LABELS[i]}
                </span>
                <div className="flex-1">
                  <MarkdownRenderer text={opt.text} image={opt.image} />
                </div>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onSkip}
          aria-pressed={selectedAnswer === 'skipped'}
          aria-keyshortcuts="S"
          className={`min-h-12 rounded-md border px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            selectedAnswer === 'skipped'
              ? 'border-amber-500 bg-amber-50 text-amber-800 dark:border-amber-400 dark:bg-amber-900/30 dark:text-amber-200'
              : 'border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
          }`}
        >
          Skip
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Press 1–4 to answer · S to skip · {modeHint}
        </p>
      </div>
    </article>
  )
}
