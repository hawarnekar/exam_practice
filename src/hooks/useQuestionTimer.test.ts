import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useQuestionTimer } from './useQuestionTimer'

const EXPECTED = 30 // seconds

describe('useQuestionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('starts at elapsed=0 with colorState="normal"', () => {
    const { result } = renderHook(() => useQuestionTimer(EXPECTED))
    expect(result.current.elapsedSec).toBe(0)
    expect(result.current.colorState).toBe('normal')
  })

  it('counts up one second per tick', () => {
    const { result } = renderHook(() => useQuestionTimer(EXPECTED))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.elapsedSec).toBe(3)
    expect(result.current.colorState).toBe('normal')
  })

  it('switches to amber when elapsed reaches expectedTimeSec', () => {
    const { result } = renderHook(() => useQuestionTimer(EXPECTED))
    act(() => {
      vi.advanceTimersByTime(EXPECTED * 1000)
    })
    expect(result.current.elapsedSec).toBe(EXPECTED)
    expect(result.current.colorState).toBe('amber')
  })

  it('stays amber between 100% and just under 150%', () => {
    const { result } = renderHook(() => useQuestionTimer(EXPECTED))
    act(() => {
      // 1 second short of 1.5x
      vi.advanceTimersByTime((EXPECTED * 1.5 - 1) * 1000)
    })
    expect(result.current.colorState).toBe('amber')
  })

  it('switches to red at expectedTimeSec * 1.5', () => {
    const { result } = renderHook(() => useQuestionTimer(EXPECTED))
    act(() => {
      vi.advanceTimersByTime(EXPECTED * 1.5 * 1000)
    })
    expect(result.current.elapsedSec).toBe(EXPECTED * 1.5)
    expect(result.current.colorState).toBe('red')
  })

  it('reset() restarts elapsedSec to 0 and goes back to normal', () => {
    const { result } = renderHook(() => useQuestionTimer(EXPECTED))
    act(() => {
      vi.advanceTimersByTime(EXPECTED * 1000)
    })
    expect(result.current.colorState).toBe('amber')

    act(() => {
      result.current.reset()
    })
    expect(result.current.elapsedSec).toBe(0)
    expect(result.current.colorState).toBe('normal')

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.elapsedSec).toBe(2)
  })

  it('clears the interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useQuestionTimer(EXPECTED))
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
