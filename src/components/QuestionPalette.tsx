export type PaletteStatus = 'answered' | 'skipped' | 'unanswered'

type QuestionPaletteProps = {
  total: number
  currentIndex: number
  statuses: PaletteStatus[]
  onNavigate: (index: number) => void
}

const STATUS_CLASS: Record<PaletteStatus, string> = {
  answered:
    'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-900/40 dark:text-blue-100',
  skipped:
    'border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-400 dark:bg-amber-900/40 dark:text-amber-100',
  unanswered:
    'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200',
}

function SkipIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="absolute right-1 top-1 h-3 w-3 text-amber-600 dark:text-amber-300"
      aria-hidden="true"
    >
      <path d="M12 2L1 21h22L12 2zm0 6l7 12H5l7-12zm-1 4h2v4h-2v-4zm0 5h2v2h-2v-2z" />
    </svg>
  )
}

export function QuestionPalette({
  total,
  currentIndex,
  statuses,
  onNavigate,
}: QuestionPaletteProps) {
  return (
    <nav
      aria-label="Question palette"
      className="mx-auto mt-2 max-w-3xl px-4"
    >
      <ul
        className="grid max-h-96 grid-cols-6 gap-2 overflow-auto py-1 sm:grid-cols-10"
        data-testid="question-palette"
      >
        {Array.from({ length: total }, (_, i) => {
          const status = statuses[i] ?? 'unanswered'
          const isCurrent = i === currentIndex
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onNavigate(i)}
                aria-label={`Question ${i + 1}, ${status}${isCurrent ? ', current' : ''}`}
                aria-current={isCurrent ? 'true' : undefined}
                data-status={status}
                className={`relative min-h-12 w-full rounded-md border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${STATUS_CLASS[status]} ${
                  isCurrent ? 'ring-2 ring-blue-500 dark:ring-blue-300' : ''
                }`}
              >
                <span>{i + 1}</span>
                {status === 'skipped' && <SkipIcon />}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
