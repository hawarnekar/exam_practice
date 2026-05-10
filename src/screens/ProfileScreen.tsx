import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Profile } from '../types'
import { useApp } from '../store/appContextValue'
import {
  createProfile,
  deleteProfile,
  getProfiles,
  profileExists,
} from '../store/sessionStore'
import { loadInflightSet } from '../store/inflightStore'

export function ProfileScreen() {
  const { setProfile, setActiveSet, navigate } = useApp()
  const [profiles, setProfiles] = useState<Profile[]>(() => getProfiles())
  const [inputName, setInputName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isEmpty = profiles.length === 0

  useEffect(() => {
    if (isEmpty) inputRef.current?.focus()
  }, [isEmpty])

  function refresh() {
    setProfiles(getProfiles())
  }

  function handleSelect(name: string) {
    setProfile(name)
    // If the profile has an in-flight set in sessionStorage (e.g. after a
    // refresh), drop them straight back into it instead of forcing them to
    // configure a new set.
    const inflight = loadInflightSet(name)
    if (inflight) {
      setActiveSet(inflight)
      navigate('active_set')
    } else {
      navigate('set_config')
    }
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    const trimmed = inputName.trim()
    if (!trimmed) {
      setError('Profile name cannot be empty')
      return
    }
    if (profileExists(trimmed)) {
      setError(`A profile named "${trimmed}" already exists`)
      return
    }
    try {
      createProfile(trimmed)
      setInputName('')
      setError(null)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
    }
  }

  function handleConfirmDelete(name: string) {
    deleteProfile(name)
    setPendingDelete(null)
    refresh()
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {isEmpty ? 'Create your first profile' : 'Choose a profile'}
      </h2>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
        {isEmpty
          ? 'Each profile has its own progress and settings.'
          : 'Select a profile to continue, or create a new one below.'}
      </p>

      {!isEmpty && (
        <ul className="mb-8 space-y-3">
          {profiles.map((p) => {
            const confirming = pendingDelete === p.name
            return (
              <li
                key={p.name}
                className="flex items-stretch overflow-hidden rounded-md border border-gray-300 dark:border-gray-600"
              >
                <button
                  type="button"
                  onClick={() => handleSelect(p.name)}
                  aria-label={`Select profile ${p.name}`}
                  className="min-h-12 flex-1 px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <div className="font-medium text-gray-900 dark:text-gray-100">{p.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Created {new Date(p.createdAt).toLocaleDateString()}
                  </div>
                </button>
                {confirming ? (
                  <div className="flex items-center gap-2 pr-3">
                    <button
                      type="button"
                      onClick={() => handleConfirmDelete(p.name)}
                      aria-label={`Confirm delete profile ${p.name}`}
                      className="min-h-12 rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(null)}
                      aria-label={`Cancel deleting profile ${p.name}`}
                      className="min-h-12 rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingDelete(p.name)}
                    aria-label={`Delete profile ${p.name}`}
                    className="min-h-12 px-4 text-sm font-medium text-red-700 dark:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    Delete
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={handleCreate} noValidate>
        <label
          htmlFor="new-profile-name"
          className="block text-sm font-medium text-gray-800 dark:text-gray-200"
        >
          {isEmpty ? 'Profile name' : 'New profile name'}
        </label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            id="new-profile-name"
            ref={inputRef}
            type="text"
            value={inputName}
            onChange={(e) => {
              setInputName(e.target.value)
              if (error) setError(null)
            }}
            placeholder="e.g. Alice"
            aria-invalid={error !== null}
            aria-describedby={error ? 'new-profile-error' : undefined}
            className="min-h-12 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          <button
            type="submit"
            className="min-h-12 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
          >
            Create profile
          </button>
        </div>
        {error && (
          <p
            id="new-profile-error"
            role="alert"
            className="mt-2 text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
      </form>
    </section>
  )
}
