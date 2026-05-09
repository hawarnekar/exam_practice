import type { Question } from '../types'
import { MarkdownRenderer } from './MarkdownRenderer'

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const

type FeedbackPanelProps = {
  question: Question
  selectedIndex: number | 'skipped'
  isLast: boolean
  onNext: () => void
}

type Status = 'correct' | 'incorrect' | 'skipped'

const BANNER_CLASS: Record<Status, string> = {
  correct:
    'border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-900/30 dark:text-green-100',
  incorrect:
    'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-900/30 dark:text-red-100',
  skipped:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100',
}

const BANNER_TEXT: Record<Status, string> = {
  correct: 'Correct!',
  incorrect: 'Incorrect',
  skipped: 'You skipped this question',
}

function StatusIcon({ status }: { status: Status }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'h-6 w-6 shrink-0',
  }
  if (status === 'correct') {
    return (
      <svg {...common}>
        <path d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  if (status === 'incorrect') {
    return (
      <svg {...common}>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  )
}

export function FeedbackPanel({ question, selectedIndex, isLast, onNext }: FeedbackPanelProps) {
  const skipped = selectedIndex === 'skipped'
  const isAnswerCorrect = !skipped && selectedIndex === question.correct
  const status: Status = skipped ? 'skipped' : isAnswerCorrect ? 'correct' : 'incorrect'

  return (
    <aside
      role="region"
      aria-label="Answer feedback"
      data-status={status}
      className="mx-auto mt-2 max-w-3xl px-4 pb-10"
    >
      <div className={`flex items-center gap-3 rounded-md border p-4 ${BANNER_CLASS[status]}`}>
        <StatusIcon status={status} />
        <div className="text-lg font-semibold">{BANNER_TEXT[status]}</div>
      </div>

      <ol className="mt-4 space-y-2">
        {question.options.map((opt, i) => {
          const isCorrect = i === question.correct
          const isSelectedWrong = !skipped && selectedIndex === i && !isCorrect
          const optionState: 'correct' | 'selected-wrong' | 'neutral' = isCorrect
            ? 'correct'
            : isSelectedWrong
              ? 'selected-wrong'
              : 'neutral'
          const cls =
            optionState === 'correct'
              ? 'border-green-500 bg-green-50 dark:border-green-400 dark:bg-green-900/30'
              : optionState === 'selected-wrong'
                ? 'border-red-500 bg-red-50 dark:border-red-400 dark:bg-red-900/30'
                : 'border-gray-300 dark:border-gray-600'
          const tag =
            optionState === 'correct'
              ? 'Correct answer'
              : optionState === 'selected-wrong'
                ? 'Your answer'
                : null
          return (
            <li
              key={i}
              data-option-index={i}
              data-state={optionState}
              className={`flex items-start gap-3 rounded-md border px-4 py-3 ${cls}`}
            >
              <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">
                {OPTION_LABELS[i]}
              </span>
              <div className="flex-1">
                <MarkdownRenderer text={opt.text} image={opt.image} />
                {tag && (
                  <div
                    className={`mt-1 text-xs font-semibold uppercase tracking-wide ${
                      optionState === 'correct'
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}
                  >
                    {tag}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
          Explanation
        </h3>
        <MarkdownRenderer text={question.explanation} />
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={onNext}
          className="min-h-12 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {isLast ? 'Finish set' : 'Next question'}
        </button>
      </div>
    </aside>
  )
}
