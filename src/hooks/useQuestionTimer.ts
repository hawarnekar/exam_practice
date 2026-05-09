import { useCallback, useEffect, useRef, useState } from 'react'

export type TimerColorState = 'normal' | 'amber' | 'red'

export type UseQuestionTimerResult = {
  elapsedSec: number
  colorState: TimerColorState
  reset: () => void
}

// Stopwatch hook for the per-question timer.
//   normal: elapsed <  expectedTimeSec
//   amber:  expectedTimeSec        <= elapsed < expectedTimeSec * 1.5
//   red:    expectedTimeSec * 1.5  <= elapsed
export function useQuestionTimer(expectedTimeSec: number): UseQuestionTimerResult {
  const [elapsedSec, setElapsedSec] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(() => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setElapsedSec((s) => s + 1)
    }, 1000)
  }, [])

  useEffect(() => {
    start()
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [start])

  const reset = useCallback(() => {
    setElapsedSec(0)
    start()
  }, [start])

  let colorState: TimerColorState = 'normal'
  if (elapsedSec >= expectedTimeSec * 1.5) colorState = 'red'
  else if (elapsedSec >= expectedTimeSec) colorState = 'amber'

  return { elapsedSec, colorState, reset }
}
