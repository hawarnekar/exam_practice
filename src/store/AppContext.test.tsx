import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from './AppContext'
import { useApp } from './appContextValue'
import { createProfile, deleteProfile, getDarkMode, setDarkMode } from './sessionStore'

function Probe({ profileToSet = 'alice' }: { profileToSet?: string }) {
  const { activeProfile, currentScreen, darkMode, navigate, setProfile, toggleDarkMode } = useApp()
  return (
    <div>
      <div data-testid="screen">{currentScreen}</div>
      <div data-testid="profile">{activeProfile ?? '(none)'}</div>
      <div data-testid="dark">{String(darkMode)}</div>
      <button onClick={() => navigate('dashboard')}>go-dashboard</button>
      <button onClick={() => setProfile(profileToSet)}>set-profile</button>
      <button onClick={toggleDarkMode}>toggle-dark</button>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

afterEach(() => {
  document.documentElement.classList.remove('dark')
})

describe('AppProvider / useApp', () => {
  it('starts on profile_select with no active profile and dark mode off', () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    expect(screen.getByTestId('screen').textContent).toBe('profile_select')
    expect(screen.getByTestId('profile').textContent).toBe('(none)')
    expect(screen.getByTestId('dark').textContent).toBe('false')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('navigate() updates currentScreen', async () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    await userEvent.click(screen.getByText('go-dashboard'))
    expect(screen.getByTestId('screen').textContent).toBe('dashboard')
  })

  it('toggleDarkMode flips state and toggles the dark class on <html>', async () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    await userEvent.click(screen.getByText('toggle-dark'))
    expect(screen.getByTestId('dark').textContent).toBe('true')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    await userEvent.click(screen.getByText('toggle-dark'))
    expect(screen.getByTestId('dark').textContent).toBe('false')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it("setProfile adopts that profile's saved dark-mode preference", async () => {
    createProfile('alice')
    setDarkMode('alice', true)

    render(
      <AppProvider>
        <Probe profileToSet="alice" />
      </AppProvider>,
    )
    expect(screen.getByTestId('dark').textContent).toBe('false')

    await userEvent.click(screen.getByText('set-profile'))
    expect(screen.getByTestId('profile').textContent).toBe('alice')
    expect(screen.getByTestId('dark').textContent).toBe('true')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    deleteProfile('alice')
  })

  it("toggleDarkMode persists the new value into the active profile's progress", async () => {
    createProfile('bob')

    render(
      <AppProvider>
        <Probe profileToSet="bob" />
      </AppProvider>,
    )
    await userEvent.click(screen.getByText('set-profile'))
    expect(getDarkMode('bob')).toBe(false)

    await userEvent.click(screen.getByText('toggle-dark'))
    expect(getDarkMode('bob')).toBe(true)

    deleteProfile('bob')
  })

  it('useApp throws when used outside AppProvider', () => {
    expect(() => renderHook(() => useApp())).toThrow(/AppProvider/)
  })
})
