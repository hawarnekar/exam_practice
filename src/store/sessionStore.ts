import type { Profile, ProfileProgress } from '../types'

const KEY_PROFILES = 'cbse10_profiles'

function profileKeyPrefix(name: string): string {
  return `cbse10_${name}_`
}

function progressKey(name: string): string {
  return `${profileKeyPrefix(name)}progress`
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
  localStorage.setItem(KEY_PROFILES, JSON.stringify(profiles))

  const initialProgress: ProfileProgress = {
    profile,
    topicProgress: [],
    setHistory: [],
    darkMode: false,
    streak: 0,
    lastSetDate: null,
  }
  localStorage.setItem(progressKey(trimmed), JSON.stringify(initialProgress))

  return profile
}

// Idempotent: deleting a non-existent profile is a no-op.
export function deleteProfile(name: string): void {
  const filtered = getProfiles().filter((p) => p.name !== name)
  localStorage.setItem(KEY_PROFILES, JSON.stringify(filtered))

  const prefix = profileKeyPrefix(name)
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix)) toRemove.push(key)
  }
  for (const key of toRemove) localStorage.removeItem(key)
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
  localStorage.setItem(progressKey(profileName), JSON.stringify(progress))
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
    localStorage.setItem(KEY_PROFILES, JSON.stringify(profiles))
  }

  const rebound: ProfileProgress = {
    ...parsed,
    profile: { name: profileName, createdAt: parsed.profile.createdAt },
  }
  saveProgress(profileName, rebound)
}
