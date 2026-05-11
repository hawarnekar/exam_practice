import type {
  Profile,
  ProfileProgress,
  SetFilter,
  SetRecord,
  SetRecordSummary,
} from '../types'
import { clearInflightSet } from './inflightStore'

const KEY_PROFILES = 'examPractice_profiles'

// Maximum number of full SetRecord entries kept in setHistory. Older sets
// are rolled into setHistorySummary, which keeps accuracy + topic state
// changes (the only fields the dashboard needs across the long tail) but
// drops the bulky per-question results. Caps localStorage growth so a
// long-running profile can't push the origin over its quota.
export const MAX_FULL_HISTORY = 100

// Typed error for any localStorage write failure (most often quota
// exhaustion in private-browsing modes or after long usage).
export class StorageError extends Error {
  readonly kind: 'quota' | 'unknown'
  constructor(message: string, kind: 'quota' | 'unknown', cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'StorageError'
    this.kind = kind
  }
}

function isQuotaExceeded(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const name = (e as { name?: unknown }).name
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
  // Legacy DOMException numeric codes.
  const code = (e as { code?: unknown }).code
  return code === 22 || code === 1014
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (e) {
    const quota = isQuotaExceeded(e)
    const message = quota
      ? "Couldn't save: browser storage is full. Export your progress in Settings, then delete an old profile or clear site data and try again."
      : `Couldn't save to browser storage: ${e instanceof Error ? e.message : String(e)}`
    throw new StorageError(message, quota ? 'quota' : 'unknown', e)
  }
}

function profileKeyPrefix(name: string): string {
  return `examPractice_${name}_`
}

// One-time migration from the legacy `cbse10_` prefix used during early
// development to the generic `examPractice_` prefix. Idempotent and silent
// when no legacy keys exist. Runs at module load so it happens before any
// reads. Wrapped in try/catch end-to-end so a hostile storage environment
// (quota, SecurityError) can never prevent the module from importing.
function migrateLegacyKeys(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const legacy = 'cbse10_'
    const next = 'examPractice_'
    const toMove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(legacy)) toMove.push(k)
    }
    for (const oldKey of toMove) {
      const newKey = next + oldKey.slice(legacy.length)
      if (localStorage.getItem(newKey) !== null) continue
      const value = localStorage.getItem(oldKey)
      if (value === null) continue
      try {
        localStorage.setItem(newKey, value)
        localStorage.removeItem(oldKey)
      } catch {
        // Per-key failure: leave the legacy key in place so a later module
        // load can retry once the user has freed space.
      }
    }
  } catch {
    // End-to-end swallow: migration must never block app start.
  }
}
migrateLegacyKeys()

function progressKey(name: string): string {
  return `${profileKeyPrefix(name)}progress`
}

function toSummary(rec: SetRecord): SetRecordSummary {
  const total = rec.results.length
  const correct = rec.results.reduce((n, r) => (r.correct ? n + 1 : n), 0)
  return {
    setNumber: rec.setNumber,
    date: rec.date,
    size: rec.size,
    feedbackMode: rec.feedbackMode,
    accuracy: total === 0 ? 0 : correct / total,
    correctCount: correct,
    totalCount: total,
    topicStateChanges: rec.topicStateChanges,
  }
}

// Trim setHistory to the last MAX_FULL_HISTORY entries; rolled-off entries
// are appended (in chronological order) to setHistorySummary. No-op when
// already within bounds, and idempotent — calling repeatedly produces the
// same shape.
export function capProgress(progress: ProfileProgress): ProfileProgress {
  if (progress.setHistory.length <= MAX_FULL_HISTORY) return progress
  const overflowCount = progress.setHistory.length - MAX_FULL_HISTORY
  const overflow = progress.setHistory.slice(0, overflowCount)
  const kept = progress.setHistory.slice(overflowCount)
  const newSummaries = overflow.map(toSummary)
  return {
    ...progress,
    setHistory: kept,
    setHistorySummary: [...(progress.setHistorySummary ?? []), ...newSummaries],
  }
}

export function getProfiles(): Profile[] {
  const raw = localStorage.getItem(KEY_PROFILES)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function profileExists(name: string): boolean {
  return getProfiles().some((p) => p.name === name)
}

export function createProfile(name: string): Profile {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Profile name cannot be empty')
  if (profileExists(trimmed)) throw new Error(`Profile "${trimmed}" already exists`)

  const profile: Profile = {
    name: trimmed,
    createdAt: new Date().toISOString(),
  }

  const profiles = getProfiles()
  profiles.push(profile)
  safeSetItem(KEY_PROFILES, JSON.stringify(profiles))

  const initialProgress: ProfileProgress = {
    profile,
    topicProgress: [],
    setHistory: [],
    darkMode: false,
    streak: 0,
    lastSetDate: null,
  }
  safeSetItem(progressKey(trimmed), JSON.stringify(initialProgress))

  return profile
}

// Idempotent: deleting a non-existent profile is a no-op.
export function deleteProfile(name: string): void {
  const filtered = getProfiles().filter((p) => p.name !== name)
  safeSetItem(KEY_PROFILES, JSON.stringify(filtered))

  const prefix = profileKeyPrefix(name)
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix)) toRemove.push(key)
  }
  for (const key of toRemove) localStorage.removeItem(key)

  // The in-flight snapshot lives in sessionStorage, not localStorage, so the
  // prefix sweep above won't catch it. Clear it explicitly so a recreated
  // profile with the same name doesn't inherit the deleted profile's set.
  clearInflightSet(name)
}

export function getProgress(profileName: string): ProfileProgress {
  const raw = localStorage.getItem(progressKey(profileName))
  if (raw === null) {
    throw new Error(`No progress found for profile "${profileName}"`)
  }
  try {
    return JSON.parse(raw) as ProfileProgress
  } catch {
    throw new Error(`Corrupted progress data for profile "${profileName}"`)
  }
}

export function saveProgress(profileName: string, progress: ProfileProgress): void {
  const capped = capProgress(progress)
  safeSetItem(progressKey(profileName), JSON.stringify(capped))
}

export function getDarkMode(profileName: string): boolean {
  return getProgress(profileName).darkMode
}

// Reads the existing progress, mutates only the darkMode field, and writes
// it back. Other fields (topicProgress, setHistory, etc.) are preserved.
export function setDarkMode(profileName: string, value: boolean): void {
  const current = getProgress(profileName)
  saveProgress(profileName, { ...current, darkMode: value })
}

export function getLastSetFilter(profileName: string): SetFilter | null {
  return getProgress(profileName).lastSetFilter ?? null
}

export function setLastSetFilter(profileName: string, filter: SetFilter): void {
  const current = getProgress(profileName)
  saveProgress(profileName, { ...current, lastSetFilter: filter })
}

export function exportProgress(profileName: string): string {
  return JSON.stringify(getProgress(profileName), null, 2)
}

function isProfileProgress(v: unknown): v is ProfileProgress {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.profile !== 'object' || o.profile === null) return false
  const p = o.profile as Record<string, unknown>
  if (typeof p.name !== 'string' || typeof p.createdAt !== 'string') return false
  if (!Array.isArray(o.topicProgress)) return false
  if (!Array.isArray(o.setHistory)) return false
  if (typeof o.darkMode !== 'boolean') return false
  if (typeof o.streak !== 'number') return false
  if (o.lastSetDate !== null && typeof o.lastSetDate !== 'string') return false
  if (o.setHistorySummary !== undefined && !Array.isArray(o.setHistorySummary)) return false
  if (o.lastSetFilter !== undefined && o.lastSetFilter !== null) {
    if (typeof o.lastSetFilter !== 'object') return false
    const f = o.lastSetFilter as Record<string, unknown>
    if (typeof f.subject !== 'string') return false
    if (f.topic !== null && typeof f.topic !== 'string') return false
  }
  return true
}

// Imports a previously-exported ProfileProgress JSON into the named profile.
// The profile field's name is forced to match the local profileName so that
// the imported data is rebound to the local profile identity (supporting
// cross-device restore). createdAt from the import is preserved.
// If the profile doesn't yet exist, it is auto-created in the profiles list.
export function importProgress(profileName: string, json: string): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Import failed: invalid JSON')
  }
  if (!isProfileProgress(parsed)) {
    throw new Error('Import failed: missing or invalid ProfileProgress fields')
  }

  if (!profileExists(profileName)) {
    const profiles = getProfiles()
    profiles.push({ name: profileName, createdAt: parsed.profile.createdAt })
    safeSetItem(KEY_PROFILES, JSON.stringify(profiles))
  }

  const rebound: ProfileProgress = {
    ...parsed,
    profile: { name: profileName, createdAt: parsed.profile.createdAt },
  }
  saveProgress(profileName, rebound)
}
