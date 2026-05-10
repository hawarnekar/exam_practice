import type { ActiveSet } from '../types'

// Per-profile snapshot of an in-progress set, kept in sessionStorage so it
// survives a page refresh but not a new tab or a closed-and-reopened tab.
// All access is best-effort: snapshot persistence is a recovery nicety, not
// a correctness requirement, so any storage failure is silently ignored.

const inflightKey = (profileName: string): string =>
  `examPractice_${profileName}_inflightSet`

type SerializedActiveSet = {
  questionIds: string[]
  setConfig: ActiveSet['setConfig']
  currentIndex: number
  answers: [string, number | 'skipped'][]
  timings: [string, number][]
}

function isSerialized(v: unknown): v is SerializedActiveSet {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (!Array.isArray(o.questionIds) || !o.questionIds.every((x) => typeof x === 'string'))
    return false
  if (typeof o.setConfig !== 'object' || o.setConfig === null) return false
  if (typeof o.currentIndex !== 'number') return false
  if (!Array.isArray(o.answers)) return false
  if (!Array.isArray(o.timings)) return false
  return true
}

export function saveInflightSet(profileName: string, set: ActiveSet): void {
  if (typeof sessionStorage === 'undefined') return
  const serialized: SerializedActiveSet = {
    questionIds: set.questionIds,
    setConfig: set.setConfig,
    currentIndex: set.currentIndex,
    answers: [...set.answers.entries()],
    timings: [...set.timings.entries()],
  }
  try {
    sessionStorage.setItem(inflightKey(profileName), JSON.stringify(serialized))
  } catch {
    // Best-effort: a refresh would lose the snapshot, but the live React
    // state is unaffected so the user can finish the set normally.
  }
}

export function loadInflightSet(profileName: string): ActiveSet | null {
  if (typeof sessionStorage === 'undefined') return null
  let raw: string | null
  try {
    raw = sessionStorage.getItem(inflightKey(profileName))
  } catch {
    return null
  }
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isSerialized(parsed)) return null
  return {
    questionIds: parsed.questionIds,
    setConfig: parsed.setConfig,
    currentIndex: parsed.currentIndex,
    answers: new Map(parsed.answers),
    timings: new Map(parsed.timings),
  }
}

export function clearInflightSet(profileName: string): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(inflightKey(profileName))
  } catch {
    // Ignore: stale snapshot is harmless, will be overwritten on next save.
  }
}
