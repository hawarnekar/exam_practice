import '@testing-library/react'
import { vi } from 'vitest'

// jsdom does not implement URL.createObjectURL/revokeObjectURL. The Settings
// screen uses both for its "Download progress" flow; supply minimal stubs so
// the call doesn't throw in tests. Individual tests can spy on URL via
// `vi.spyOn(URL, 'createObjectURL')` to assert the call.
if (typeof URL.createObjectURL !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (URL as any).createObjectURL = vi.fn(() => 'blob:test-url')
}
if (typeof URL.revokeObjectURL !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (URL as any).revokeObjectURL = vi.fn()
}

// jsdom does not implement matchMedia. AppProvider reads it on mount to seed
// initial dark mode from prefers-color-scheme; supply a stub that reports
// false so tests start in light mode unless explicitly overridden.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  })
}

// Vitest 4 ships an empty `localStorage` placeholder; replace it with a
// proper in-memory Web Storage implementation so unit tests can persist
// values during a test run.
class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
})
