import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useApp } from '../store/appContextValue'
import {
  exportProgress,
  getProgress,
  importProgress,
} from '../store/sessionStore'

type ImportStatus = { kind: 'success' | 'error'; message: string } | null

export function SettingsScreen() {
  const { activeProfile, darkMode, navigate, setProfile, toggleDarkMode } = useApp()
  const [refreshKey, setRefreshKey] = useState(0)
  const [importStatus, setImportStatus] = useState<ImportStatus>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const progress = useMemo(() => {
    if (!activeProfile) return null
    try {
      return getProgress(activeProfile)
    } catch {
      return null
    }
    // refreshKey is intentional — bumping it forces a re-read after import.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile, refreshKey])

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

  function handleExport() {
    if (!activeProfile) return
    try {
      const json = exportProgress(activeProfile)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cbse10_${activeProfile}_progress.json`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setImportStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Export failed',
      })
    }
  }

  async function handleImportChange(e: ChangeEvent<HTMLInputElement>) {
    if (!activeProfile) return
    setImportStatus(null)
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      importProgress(activeProfile, text)
      // Force a re-read so profile info reflects the imported file.
      setRefreshKey((k) => k + 1)
      // Re-adopt the imported profile so darkMode (and any other context-bound
      // preferences) re-sync from localStorage.
      setProfile(activeProfile)
      setImportStatus({ kind: 'success', message: 'Progress imported successfully.' })
    } catch (err) {
      setImportStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Import failed',
      })
    } finally {
      // Reset the input so re-uploading the same file fires onChange again.
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const createdLabel = progress?.profile.createdAt
    ? new Date(progress.profile.createdAt).toLocaleDateString()
    : '—'

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h2>

      <article
        aria-label="Profile info"
        className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Profile</h3>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Name
            </dt>
            <dd
              data-testid="profile-name"
              className="text-gray-900 dark:text-gray-100"
            >
              {progress?.profile.name ?? activeProfile}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Created
            </dt>
            <dd
              data-testid="profile-created"
              className="text-gray-900 dark:text-gray-100"
            >
              {createdLabel}
            </dd>
          </div>
        </dl>
      </article>

      <article
        aria-label="Appearance settings"
        className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Appearance</h3>
        <label className="mt-3 flex items-center gap-3">
          <input
            type="checkbox"
            checked={darkMode}
            onChange={toggleDarkMode}
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-500"
          />
          <span className="text-sm text-gray-900 dark:text-gray-100">Dark mode</span>
        </label>
      </article>

      <article
        aria-label="Data settings"
        className="rounded-md border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
      >
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Data</h3>
        <div className="mt-3 space-y-4">
          <div>
            <button
              type="button"
              onClick={handleExport}
              className="min-h-12 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              Download progress
            </button>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
              Saves your progress as a JSON file.
            </p>
          </div>

          <div>
            <label
              htmlFor="import-file"
              className="block text-sm font-medium text-gray-800 dark:text-gray-200"
            >
              Import progress
            </label>
            <input
              id="import-file"
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportChange}
              className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700 dark:text-gray-200"
            />
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
              Restores progress from a previously downloaded JSON.
            </p>
            {importStatus && (
              <p
                role={importStatus.kind === 'success' ? 'status' : 'alert'}
                className={`mt-2 text-sm ${
                  importStatus.kind === 'success'
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {importStatus.message}
              </p>
            )}
          </div>
        </div>
      </article>
    </section>
  )
}
