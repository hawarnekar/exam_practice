import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ActiveSet, Screen } from '../types'
import { getDarkMode, setDarkMode as persistDarkMode } from './sessionStore'
import { AppContext, type AppContextValue } from './appContextValue'

function detectInitialDarkMode(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeProfile, setActiveProfile] = useState<string | null>(null)
  const [currentScreen, setCurrentScreen] = useState<Screen>('profile_select')
  const [darkMode, setDarkModeState] = useState<boolean>(detectInitialDarkMode)
  const [activeSet, setActiveSetState] = useState<ActiveSet | null>(null)

  // Apply dark class to <html> whenever darkMode changes.
  useEffect(() => {
    const root = document.documentElement
    if (darkMode) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [darkMode])

  const navigate = useCallback((screen: Screen) => setCurrentScreen(screen), [])

  const setProfile = useCallback((name: string | null) => {
    setActiveProfile(name)
    setActiveSetState(null) // dropping a profile invalidates any in-flight set
    if (name) {
      // Adopt that profile's saved dark-mode preference.
      try {
        setDarkModeState(getDarkMode(name))
      } catch {
        // Profile has no progress yet; keep current darkMode.
      }
    }
  }, [])

  const setActiveSet = useCallback((set: ActiveSet | null) => {
    setActiveSetState(set)
  }, [])

  const toggleDarkMode = useCallback(() => {
    setDarkModeState((prev) => {
      const next = !prev
      if (activeProfile) {
        try {
          persistDarkMode(activeProfile, next)
        } catch {
          // Persistence failure is non-fatal for UI state.
        }
      }
      return next
    })
  }, [activeProfile])

  const value = useMemo<AppContextValue>(
    () => ({
      activeProfile,
      currentScreen,
      darkMode,
      activeSet,
      navigate,
      setProfile,
      toggleDarkMode,
      setActiveSet,
    }),
    [
      activeProfile,
      currentScreen,
      darkMode,
      activeSet,
      navigate,
      setProfile,
      toggleDarkMode,
      setActiveSet,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
