import { useApp } from '../store/appContextValue'
import type { Screen } from '../types'

const NAV_TARGETS: { screen: Screen; label: string }[] = [
  { screen: 'profile_select', label: 'Profile' },
  { screen: 'set_config', label: 'Set Config' },
  { screen: 'active_set', label: 'Session' },
  { screen: 'set_summary', label: 'Summary' },
  { screen: 'dashboard', label: 'Dashboard' },
  { screen: 'settings', label: 'Settings' },
]

type PlaceholderScreenProps = {
  title: string
  current: Screen
}

// Temporary placeholder used by all six screens until their real
// implementations land. Heading + a row of nav buttons that exercise
// transitions between screens.
export function PlaceholderScreen({ title, current }: PlaceholderScreenProps) {
  const { navigate } = useApp()

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
        Placeholder. The full implementation lands in a later task.
      </p>

      <nav aria-label="Screen navigation" className="flex flex-wrap gap-2">
        {NAV_TARGETS.filter((t) => t.screen !== current).map((t) => (
          <button
            key={t.screen}
            type="button"
            onClick={() => navigate(t.screen)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            Go to {t.label}
          </button>
        ))}
      </nav>
    </section>
  )
}
