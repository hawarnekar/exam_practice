import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsScreen } from './SettingsScreen'
import { AppProvider } from '../store/AppContext'
import { useApp } from '../store/appContextValue'
import {
  createProfile,
  exportProgress,
  getDarkMode,
  getProgress,
  saveProgress,
} from '../store/sessionStore'

function ScreenProbe() {
  const { currentScreen, darkMode, activeProfile } = useApp()
  return (
    <div>
      <div data-testid="screen">{currentScreen}</div>
      <div data-testid="dark">{String(darkMode)}</div>
      <div data-testid="profile">{activeProfile ?? '(none)'}</div>
    </div>
  )
}

function renderWith({ profile = 'Alice' as string | null } = {}) {
  if (profile) createProfile(profile)
  function Setup() {
    const { setProfile } = useApp()
    useEffect(() => {
      if (profile) setProfile(profile)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return null
  }
  return render(
    <AppProvider>
      <Setup />
      <SettingsScreen />
      <ScreenProbe />
    </AppProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('SettingsScreen', () => {
  describe('empty state', () => {
    it('shows the "no active profile" state when none is set', () => {
      render(
        <AppProvider>
          <SettingsScreen />
        </AppProvider>,
      )
      expect(screen.getByRole('heading', { name: /No active profile/i })).toBeDefined()
    })
  })

  describe('profile info', () => {
    it('renders the profile name and creation date', async () => {
      renderWith()
      await waitFor(() =>
        expect(screen.getByTestId('profile').textContent).toBe('Alice'),
      )
      expect(screen.getByTestId('profile-name').textContent).toBe('Alice')
      // Created date is formatted with toLocaleDateString — exact format depends
      // on locale; just confirm it's not the placeholder dash.
      expect(screen.getByTestId('profile-created').textContent).not.toBe('—')
    })
  })

  describe('dark mode toggle', () => {
    it('checkbox reflects current darkMode and toggling persists to the active profile', async () => {
      renderWith()
      await waitFor(() => expect(screen.getByTestId('profile').textContent).toBe('Alice'))

      const cb = screen.getByLabelText(/Dark mode/i) as HTMLInputElement
      expect(cb.checked).toBe(false)
      expect(getDarkMode('Alice')).toBe(false)

      await userEvent.click(cb)
      expect(cb.checked).toBe(true)
      expect(screen.getByTestId('dark').textContent).toBe('true')
      expect(getDarkMode('Alice')).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(true)

      await userEvent.click(cb)
      expect(cb.checked).toBe(false)
      expect(getDarkMode('Alice')).toBe(false)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })

  describe('export', () => {
    it('clicking Download progress calls URL.createObjectURL with a JSON Blob and triggers an anchor download', async () => {
      const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url')
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

      renderWith()
      await waitFor(() => expect(screen.getByTestId('profile').textContent).toBe('Alice'))

      await userEvent.click(screen.getByRole('button', { name: /Download progress/i }))

      expect(createSpy).toHaveBeenCalledTimes(1)
      const blobArg = createSpy.mock.calls[0][0]
      expect(blobArg).toBeInstanceOf(Blob)
      // Blob carries the JSON serialization of the active profile's progress.
      const blobText = await (blobArg as Blob).text()
      expect(blobText).toBe(exportProgress('Alice'))

      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeSpy).toHaveBeenCalledTimes(1)

      createSpy.mockRestore()
      revokeSpy.mockRestore()
      clickSpy.mockRestore()
    })
  })

  describe('import', () => {
    it('uploading a valid JSON restores progress and shows a success message', async () => {
      // Build a profile with a non-trivial progress, export it, delete the
      // profile's data, then import.
      createProfile('Bob')
      const original = getProgress('Bob')
      saveProgress('Bob', { ...original, streak: 7, lastSetDate: '2026-05-08' })
      const exportedJson = exportProgress('Bob')
      // Reset Bob's progress
      saveProgress('Bob', { ...original, streak: 0, lastSetDate: null })

      function Setup() {
        const { setProfile } = useApp()
        useEffect(() => {
          setProfile('Bob')
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
        return null
      }
      render(
        <AppProvider>
          <Setup />
          <SettingsScreen />
          <ScreenProbe />
        </AppProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('profile').textContent).toBe('Bob'))

      const file = new File([exportedJson], 'bob.json', { type: 'application/json' })
      const input = screen.getByLabelText(/Import progress/i) as HTMLInputElement
      await userEvent.upload(input, file)

      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toMatch(/imported successfully/i),
      )
      // Restored values
      expect(getProgress('Bob').streak).toBe(7)
      expect(getProgress('Bob').lastSetDate).toBe('2026-05-08')
    })

    it('uploading an invalid JSON file shows an error message', async () => {
      renderWith()
      await waitFor(() => expect(screen.getByTestId('profile').textContent).toBe('Alice'))

      const file = new File(['not even { json'], 'bad.json', { type: 'application/json' })
      const input = screen.getByLabelText(/Import progress/i) as HTMLInputElement
      await userEvent.upload(input, file)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toMatch(/invalid JSON/i)
    })

    it('uploading a JSON file missing required fields shows an error message', async () => {
      renderWith()
      await waitFor(() => expect(screen.getByTestId('profile').textContent).toBe('Alice'))

      const file = new File(
        [JSON.stringify({ profile: { name: 'X' }, somethingElse: true })],
        'partial.json',
        { type: 'application/json' },
      )
      const input = screen.getByLabelText(/Import progress/i) as HTMLInputElement
      await userEvent.upload(input, file)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toMatch(/missing or invalid/i)
    })
  })
})
