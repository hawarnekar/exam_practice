import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  capProgress,
  createProfile,
  deleteProfile,
  exportProgress,
  getDarkMode,
  getProfiles,
  getProgress,
  importProgress,
  MAX_FULL_HISTORY,
  profileExists,
  saveProgress,
  setDarkMode,
  StorageError,
} from './sessionStore'
import type { ProfileProgress, SetRecord, SetRecordSummary, TopicProgress } from '../types'

beforeEach(() => {
  localStorage.clear()
})

describe('getProfiles', () => {
  test('returns empty array when localStorage is fresh', () => {
    expect(getProfiles()).toEqual([])
  })

  test('returns parsed profiles array', () => {
    localStorage.setItem(
      'examPractice_profiles',
      JSON.stringify([{ name: 'Alice', createdAt: '2025-01-01T00:00:00Z' }])
    )
    expect(getProfiles()).toEqual([{ name: 'Alice', createdAt: '2025-01-01T00:00:00Z' }])
  })

  test('returns [] for corrupted JSON', () => {
    localStorage.setItem('examPractice_profiles', '{ not json')
    expect(getProfiles()).toEqual([])
  })

  test('returns [] when key holds a non-array', () => {
    localStorage.setItem('examPractice_profiles', JSON.stringify({ not: 'an array' }))
    expect(getProfiles()).toEqual([])
  })
})

describe('profileExists', () => {
  test('returns false when no profiles exist', () => {
    expect(profileExists('Alice')).toBe(false)
  })

  test('returns true after creating a profile', () => {
    createProfile('Alice')
    expect(profileExists('Alice')).toBe(true)
  })

  test('is case-sensitive', () => {
    createProfile('Alice')
    expect(profileExists('alice')).toBe(false)
  })
})

describe('createProfile', () => {
  test('persists the profile to the profiles list', () => {
    const profile = createProfile('Alice')
    expect(profile.name).toBe('Alice')
    expect(profile.createdAt).toBeTruthy()
    expect(getProfiles()).toEqual([profile])
  })

  test('initialises an empty ProfileProgress under the namespaced key', () => {
    createProfile('Alice')
    const raw = localStorage.getItem('examPractice_Alice_progress')
    expect(raw).toBeTruthy()
    const progress = JSON.parse(raw!) as ProfileProgress
    expect(progress.profile.name).toBe('Alice')
    expect(progress.topicProgress).toEqual([])
    expect(progress.setHistory).toEqual([])
    expect(progress.darkMode).toBe(false)
    expect(progress.streak).toBe(0)
    expect(progress.lastSetDate).toBe(null)
  })

  test('rejects duplicate name', () => {
    createProfile('Alice')
    expect(() => createProfile('Alice')).toThrow(/already exists/)
  })

  test('rejects empty name', () => {
    expect(() => createProfile('')).toThrow(/empty/)
  })

  test('rejects whitespace-only name', () => {
    expect(() => createProfile('   ')).toThrow(/empty/)
  })

  test('trims whitespace before storing', () => {
    const p = createProfile('  Alice  ')
    expect(p.name).toBe('Alice')
    expect(profileExists('Alice')).toBe(true)
    expect(localStorage.getItem('examPractice_Alice_progress')).toBeTruthy()
  })

  test('multiple profiles coexist', () => {
    createProfile('Alice')
    createProfile('Bob')
    const profiles = getProfiles()
    expect(profiles.map((p) => p.name).sort()).toEqual(['Alice', 'Bob'])
  })

  test('createdAt is a valid ISO 8601 timestamp', () => {
    const p = createProfile('Alice')
    expect(new Date(p.createdAt).toISOString()).toBe(p.createdAt)
  })
})

describe('deleteProfile', () => {
  test('removes the profile from the profiles list', () => {
    createProfile('Alice')
    createProfile('Bob')
    deleteProfile('Alice')
    expect(getProfiles().map((p) => p.name)).toEqual(['Bob'])
  })

  test('removes the progress key for the deleted profile', () => {
    createProfile('Alice')
    expect(localStorage.getItem('examPractice_Alice_progress')).toBeTruthy()
    deleteProfile('Alice')
    expect(localStorage.getItem('examPractice_Alice_progress')).toBeNull()
  })

  test('removes ALL namespaced keys for the profile', () => {
    createProfile('Alice')
    // Simulate other future per-profile keys being stored
    localStorage.setItem('examPractice_Alice_settings', '{}')
    localStorage.setItem('examPractice_Alice_misc', 'x')
    deleteProfile('Alice')
    expect(localStorage.getItem('examPractice_Alice_settings')).toBeNull()
    expect(localStorage.getItem('examPractice_Alice_misc')).toBeNull()
  })

  test('does not remove other profiles\' keys', () => {
    createProfile('Alice')
    createProfile('Bob')
    deleteProfile('Alice')
    expect(localStorage.getItem('examPractice_Bob_progress')).toBeTruthy()
    expect(profileExists('Bob')).toBe(true)
  })

  test('does not remove unrelated keys', () => {
    createProfile('Alice')
    localStorage.setItem('unrelated_key', 'preserved')
    deleteProfile('Alice')
    expect(localStorage.getItem('unrelated_key')).toBe('preserved')
  })

  test('is idempotent — deleting a non-existent profile does not throw', () => {
    expect(() => deleteProfile('Ghost')).not.toThrow()
    expect(getProfiles()).toEqual([])
  })

  test('substring profile names are not over-matched', () => {
    // 'Al' should not be deleted when 'Alice' is deleted (prefix is 'examPractice_Al_')
    createProfile('Al')
    createProfile('Alice')
    deleteProfile('Al')
    expect(profileExists('Al')).toBe(false)
    expect(profileExists('Alice')).toBe(true)
    expect(localStorage.getItem('examPractice_Alice_progress')).toBeTruthy()
  })
})

function sampleTopicProgress(): TopicProgress {
  return {
    topicId: 'science/physics/light',
    masteryState: 'in_progress',
    lastSetAccuracy: 0.85,
    lastSetTimeRatio: 1.1,
    incorrectQuestionIds: ['q3'],
    seenQuestionIds: ['q1', 'q2', 'q3'],
  }
}

function sampleSetRecord(): SetRecord {
  return {
    setNumber: 1,
    date: '2026-05-07T10:00:00Z',
    size: 30,
    feedbackMode: 'immediate',
    results: [],
    topicStateChanges: [],
  }
}

describe('getProgress / saveProgress', () => {
  test('newly created profile has the initial empty progress', () => {
    createProfile('Alice')
    const progress = getProgress('Alice')
    expect(progress.profile.name).toBe('Alice')
    expect(progress.topicProgress).toEqual([])
    expect(progress.setHistory).toEqual([])
    expect(progress.darkMode).toBe(false)
    expect(progress.streak).toBe(0)
    expect(progress.lastSetDate).toBeNull()
  })

  test('saveProgress + getProgress round-trip preserves all fields', () => {
    createProfile('Alice')
    const updated: ProfileProgress = {
      profile: { name: 'Alice', createdAt: '2026-01-01T00:00:00Z' },
      topicProgress: [sampleTopicProgress()],
      setHistory: [sampleSetRecord()],
      darkMode: true,
      streak: 7,
      lastSetDate: '2026-05-07',
    }
    saveProgress('Alice', updated)
    expect(getProgress('Alice')).toEqual(updated)
  })

  test('throws when no progress exists for the profile', () => {
    expect(() => getProgress('Ghost')).toThrow(/No progress found/)
  })

  test('throws when stored JSON is corrupted', () => {
    createProfile('Alice')
    localStorage.setItem('examPractice_Alice_progress', '{ corrupt')
    expect(() => getProgress('Alice')).toThrow(/Corrupted/)
  })
})

describe('getDarkMode / setDarkMode', () => {
  test('defaults to false for a freshly created profile', () => {
    createProfile('Alice')
    expect(getDarkMode('Alice')).toBe(false)
  })

  test('setDarkMode true → getDarkMode returns true', () => {
    createProfile('Alice')
    setDarkMode('Alice', true)
    expect(getDarkMode('Alice')).toBe(true)
  })

  test('setDarkMode does NOT clobber other progress fields', () => {
    createProfile('Alice')
    const populated: ProfileProgress = {
      profile: { name: 'Alice', createdAt: '2026-01-01T00:00:00Z' },
      topicProgress: [sampleTopicProgress()],
      setHistory: [sampleSetRecord()],
      darkMode: false,
      streak: 5,
      lastSetDate: '2026-05-07',
    }
    saveProgress('Alice', populated)
    setDarkMode('Alice', true)
    const after = getProgress('Alice')
    expect(after.topicProgress).toEqual(populated.topicProgress)
    expect(after.setHistory).toEqual(populated.setHistory)
    expect(after.streak).toBe(5)
    expect(after.lastSetDate).toBe('2026-05-07')
    expect(after.darkMode).toBe(true)
  })

  test('per-profile: changing one profile\'s dark mode does not affect another', () => {
    createProfile('Alice')
    createProfile('Bob')
    setDarkMode('Alice', true)
    expect(getDarkMode('Alice')).toBe(true)
    expect(getDarkMode('Bob')).toBe(false)
  })

  test('throws when profile has no progress', () => {
    expect(() => getDarkMode('Ghost')).toThrow()
    expect(() => setDarkMode('Ghost', true)).toThrow()
  })
})

describe('exportProgress', () => {
  test('returns a JSON string parseable back to ProfileProgress', () => {
    createProfile('Alice')
    const populated: ProfileProgress = {
      profile: { name: 'Alice', createdAt: '2026-01-01T00:00:00Z' },
      topicProgress: [sampleTopicProgress()],
      setHistory: [sampleSetRecord()],
      darkMode: true,
      streak: 3,
      lastSetDate: '2026-05-07',
    }
    saveProgress('Alice', populated)
    const json = exportProgress('Alice')
    expect(typeof json).toBe('string')
    expect(JSON.parse(json)).toEqual(populated)
  })

  test('throws when profile does not exist (no progress to export)', () => {
    expect(() => exportProgress('Ghost')).toThrow()
  })
})

describe('importProgress', () => {
  test('round-trip: export then import produces identical progress', () => {
    createProfile('Alice')
    const populated: ProfileProgress = {
      profile: { name: 'Alice', createdAt: '2026-01-01T00:00:00Z' },
      topicProgress: [sampleTopicProgress()],
      setHistory: [sampleSetRecord()],
      darkMode: true,
      streak: 3,
      lastSetDate: '2026-05-07',
    }
    saveProgress('Alice', populated)
    const json = exportProgress('Alice')
    // Wipe Alice's progress
    localStorage.removeItem('examPractice_Alice_progress')
    importProgress('Alice', json)
    expect(getProgress('Alice')).toEqual(populated)
  })

  test('throws on syntactically invalid JSON', () => {
    createProfile('Alice')
    expect(() => importProgress('Alice', '{ not valid')).toThrow(/invalid JSON/)
  })

  test('throws when required top-level field is missing', () => {
    createProfile('Alice')
    const broken = {
      profile: { name: 'Alice', createdAt: '2026-01-01T00:00:00Z' },
      // topicProgress missing
      setHistory: [],
      darkMode: false,
      streak: 0,
      lastSetDate: null,
    }
    expect(() => importProgress('Alice', JSON.stringify(broken))).toThrow(/invalid ProfileProgress/)
  })

  test('throws when a field has the wrong type', () => {
    createProfile('Alice')
    const broken = {
      profile: { name: 'Alice', createdAt: '2026-01-01T00:00:00Z' },
      topicProgress: 'not-an-array',
      setHistory: [],
      darkMode: false,
      streak: 0,
      lastSetDate: null,
    }
    expect(() => importProgress('Alice', JSON.stringify(broken))).toThrow()
  })

  test('throws when profile sub-object is missing required fields', () => {
    createProfile('Alice')
    const broken = {
      profile: { name: 'Alice' }, // createdAt missing
      topicProgress: [],
      setHistory: [],
      darkMode: false,
      streak: 0,
      lastSetDate: null,
    }
    expect(() => importProgress('Alice', JSON.stringify(broken))).toThrow()
  })

  test('rebinds profile.name to the local profile name (cross-device restore)', () => {
    createProfile('LocalAlice')
    const exported: ProfileProgress = {
      profile: { name: 'OriginalAlice', createdAt: '2025-12-01T00:00:00Z' },
      topicProgress: [sampleTopicProgress()],
      setHistory: [],
      darkMode: false,
      streak: 0,
      lastSetDate: null,
    }
    importProgress('LocalAlice', JSON.stringify(exported))
    const got = getProgress('LocalAlice')
    expect(got.profile.name).toBe('LocalAlice')
    expect(got.topicProgress).toEqual(exported.topicProgress)
  })

  test('preserves the imported createdAt rather than the local one', () => {
    createProfile('Alice')
    const exported: ProfileProgress = {
      profile: { name: 'Alice', createdAt: '2024-01-01T00:00:00Z' },
      topicProgress: [],
      setHistory: [],
      darkMode: false,
      streak: 0,
      lastSetDate: null,
    }
    importProgress('Alice', JSON.stringify(exported))
    expect(getProgress('Alice').profile.createdAt).toBe('2024-01-01T00:00:00Z')
  })

  test('overwrites existing progress (does not merge field-by-field)', () => {
    createProfile('Alice')
    const old: ProfileProgress = {
      profile: { name: 'Alice', createdAt: '2026-01-01T00:00:00Z' },
      topicProgress: [sampleTopicProgress()],
      setHistory: [sampleSetRecord()],
      darkMode: true,
      streak: 5,
      lastSetDate: '2026-05-07',
    }
    saveProgress('Alice', old)

    const incoming: ProfileProgress = {
      profile: { name: 'Alice', createdAt: '2026-01-01T00:00:00Z' },
      topicProgress: [],
      setHistory: [],
      darkMode: false,
      streak: 0,
      lastSetDate: null,
    }
    importProgress('Alice', JSON.stringify(incoming))
    const after = getProgress('Alice')
    expect(after.topicProgress).toEqual([])
    expect(after.setHistory).toEqual([])
    expect(after.streak).toBe(0)
  })

  test('auto-creates the profile in the profiles list if missing', () => {
    expect(profileExists('NewAlice')).toBe(false)
    const exported: ProfileProgress = {
      profile: { name: 'OldName', createdAt: '2025-01-01T00:00:00Z' },
      topicProgress: [],
      setHistory: [],
      darkMode: false,
      streak: 0,
      lastSetDate: null,
    }
    importProgress('NewAlice', JSON.stringify(exported))
    expect(profileExists('NewAlice')).toBe(true)
    expect(getProfiles().find((p) => p.name === 'NewAlice')!.createdAt).toBe(
      '2025-01-01T00:00:00Z'
    )
  })
})

describe('StorageError on quota / write failure', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('createProfile throws a quota-tagged StorageError when setItem rejects with QuotaExceededError', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    let caught: unknown
    try {
      createProfile('Alice')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(StorageError)
    expect((caught as StorageError).kind).toBe('quota')
    expect((caught as StorageError).message).toMatch(/storage is full/i)
  })

  test('saveProgress wraps non-quota write errors as StorageError with kind="unknown"', () => {
    createProfile('Alice')
    const progress = getProgress('Alice')
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('access denied')
    })
    let caught: unknown
    try {
      saveProgress('Alice', progress)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(StorageError)
    expect((caught as StorageError).kind).toBe('unknown')
    expect((caught as StorageError).message).toMatch(/access denied/)
  })

  test('setDarkMode propagates StorageError from the underlying save', () => {
    createProfile('Alice')
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => setDarkMode('Alice', true)).toThrow(StorageError)
  })

  test('importProgress surfaces StorageError when the underlying write fails', () => {
    createProfile('Alice')
    const exported: ProfileProgress = {
      profile: { name: 'Alice', createdAt: '2026-01-01T00:00:00Z' },
      topicProgress: [],
      setHistory: [],
      darkMode: false,
      streak: 0,
      lastSetDate: null,
    }
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => importProgress('Alice', JSON.stringify(exported))).toThrow(StorageError)
  })
})

describe('capProgress (setHistory rollover)', () => {
  function makeRecord(setNumber: number, correct = true): SetRecord {
    return {
      setNumber,
      date: `2026-01-${String(((setNumber - 1) % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      size: 30,
      feedbackMode: 'immediate',
      results: [
        {
          questionId: `q${setNumber}`,
          topicId: 'science/physics/light',
          selectedAnswer: 0,
          correct,
          skipped: false,
          elapsedSec: 30,
          expectedSec: 30,
        },
      ],
      topicStateChanges: [
        {
          topicId: 'science/physics/light',
          previousState: 'unassessed',
          newState: 'mastered',
        },
      ],
    }
  }

  function baseProgress(): ProfileProgress {
    return {
      profile: { name: 'A', createdAt: '2026-01-01T00:00:00Z' },
      topicProgress: [],
      setHistory: [],
      darkMode: false,
      streak: 0,
      lastSetDate: null,
    }
  }

  test('is identity when setHistory is at or below the cap', () => {
    const recs = Array.from({ length: MAX_FULL_HISTORY }, (_, i) => makeRecord(i + 1))
    const p: ProfileProgress = { ...baseProgress(), setHistory: recs }
    expect(capProgress(p)).toEqual(p)
  })

  test('rolls overflow into setHistorySummary, oldest first', () => {
    const recs = Array.from({ length: MAX_FULL_HISTORY + 5 }, (_, i) => makeRecord(i + 1))
    const p: ProfileProgress = { ...baseProgress(), setHistory: recs }
    const capped = capProgress(p)
    expect(capped.setHistory).toHaveLength(MAX_FULL_HISTORY)
    expect(capped.setHistorySummary).toBeDefined()
    expect(capped.setHistorySummary).toHaveLength(5)
    expect(capped.setHistorySummary![0].setNumber).toBe(1)
    expect(capped.setHistorySummary![4].setNumber).toBe(5)
    expect(capped.setHistory[0].setNumber).toBe(6)
    expect(capped.setHistory[MAX_FULL_HISTORY - 1].setNumber).toBe(MAX_FULL_HISTORY + 5)
  })

  test('summary preserves accuracy and topicStateChanges from the rolled-off records', () => {
    const recs = Array.from({ length: MAX_FULL_HISTORY + 1 }, (_, i) =>
      makeRecord(i + 1, i % 2 === 0),
    )
    const capped = capProgress({ ...baseProgress(), setHistory: recs })
    const rolled = capped.setHistorySummary![0]
    expect(rolled.setNumber).toBe(1)
    expect(rolled.accuracy).toBe(1) // only result was correct
    expect(rolled.totalCount).toBe(1)
    expect(rolled.correctCount).toBe(1)
    expect(rolled.topicStateChanges).toEqual(recs[0].topicStateChanges)
  })

  test('appends to a pre-existing setHistorySummary on subsequent rollovers', () => {
    const existing: SetRecordSummary[] = [
      {
        setNumber: 1,
        date: '2025-12-01T00:00:00Z',
        size: 30,
        feedbackMode: 'immediate',
        accuracy: 0.5,
        correctCount: 5,
        totalCount: 10,
        topicStateChanges: [],
      },
    ]
    const recs = Array.from({ length: MAX_FULL_HISTORY + 2 }, (_, i) => makeRecord(i + 2))
    const capped = capProgress({
      ...baseProgress(),
      setHistory: recs,
      setHistorySummary: existing,
    })
    expect(capped.setHistorySummary).toHaveLength(3) // 1 pre-existing + 2 new
    expect(capped.setHistorySummary![0].setNumber).toBe(1) // pre-existing first
    expect(capped.setHistorySummary![1].setNumber).toBe(2) // first overflow
    expect(capped.setHistorySummary![2].setNumber).toBe(3)
  })

  test('saveProgress enforces the cap on write', () => {
    createProfile('Alice')
    const recs = Array.from({ length: MAX_FULL_HISTORY + 10 }, (_, i) => makeRecord(i + 1))
    saveProgress('Alice', { ...getProgress('Alice'), setHistory: recs })
    const stored = getProgress('Alice')
    expect(stored.setHistory).toHaveLength(MAX_FULL_HISTORY)
    expect(stored.setHistorySummary).toHaveLength(10)
    expect(stored.setHistorySummary![0].setNumber).toBe(1)
  })

  test('round-trip preserves an explicit setHistorySummary', () => {
    createProfile('Alice')
    const summary: SetRecordSummary[] = [
      {
        setNumber: 1,
        date: '2025-12-01T00:00:00Z',
        size: 30,
        feedbackMode: 'immediate',
        accuracy: 0.7,
        correctCount: 7,
        totalCount: 10,
        topicStateChanges: [],
      },
    ]
    const updated: ProfileProgress = {
      profile: { name: 'Alice', createdAt: '2026-01-01T00:00:00Z' },
      topicProgress: [],
      setHistory: [],
      setHistorySummary: summary,
      darkMode: false,
      streak: 0,
      lastSetDate: null,
    }
    saveProgress('Alice', updated)
    expect(getProgress('Alice')).toEqual(updated)
  })
})
