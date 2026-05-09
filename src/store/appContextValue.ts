import { createContext, useContext } from 'react'
import type { ActiveSet, Screen } from '../types'

export type AppContextValue = {
  activeProfile: string | null
  currentScreen: Screen
  darkMode: boolean
  activeSet: ActiveSet | null
  navigate: (screen: Screen) => void
  setProfile: (name: string | null) => void
  toggleDarkMode: () => void
  setActiveSet: (set: ActiveSet | null) => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
