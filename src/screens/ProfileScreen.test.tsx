import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileScreen } from './ProfileScreen'
import { AppProvider } from '../store/AppContext'
import { useApp } from '../store/appContextValue'
import { createProfile, deleteProfile, getProfiles } from '../store/sessionStore'
import { saveInflightSet, loadInflightSet } from '../store/inflightStore'
import type { ActiveSet } from '../types'

// Probe to read the screen the AppProvider thinks is current.
function ScreenProbe() {
  const { currentScreen, activeProfile } = useApp()
  return (
    <div>
      <div data-testid="screen">{currentScreen}</div>
      <div data-testid="profile">{activeProfile ?? '(none)'}</div>
    </div>
  )
}

function renderWithProvider() {
  return render(
    <AppProvider>
      <ProfileScreen />
      <ScreenProbe />
    </AppProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('ProfileScreen', () => {
  describe('empty state', () => {
    it('renders the create-first-profile heading and helper text', () => {
      renderWithProvider()
      expect(screen.getByRole('heading', { name: /Create your first profile/i })).toBeDefined()
      expect(screen.getByText(/own progress and settings/i)).toBeDefined()
    })

    it('does not render any profile list', () => {
      renderWithProvider()
      const lists = document.querySelectorAll('ul')
      // Either no <ul> at all, or any present <ul> has zero <li> children.
      for (const ul of lists) {
        expect(ul.children.length).toBe(0)
      }
    })

    it('auto-focuses the new profile name input', () => {
      renderWithProvider()
      const input = screen.getByLabelText(/Profile name/i) as HTMLInputElement
      expect(document.activeElement).toBe(input)
    })
  })

  describe('creating profiles', () => {
    it('rejects an empty name with an inline error', async () => {
      renderWithProvider()
      await userEvent.click(screen.getByRole('button', { name: /Create profile/i }))
      expect(screen.getByRole('alert').textContent).toMatch(/cannot be empty/i)
    })

    it('rejects a whitespace-only name', async () => {
      renderWithProvider()
      const input = screen.getByLabelText(/Profile name/i)
      await userEvent.type(input, '   ')
      await userEvent.click(screen.getByRole('button', { name: /Create profile/i }))
      expect(screen.getByRole('alert').textContent).toMatch(/cannot be empty/i)
    })

    it('rejects a duplicate name', async () => {
      createProfile('Alice')
      renderWithProvider()
      const input = screen.getByLabelText(/New profile name/i)
      await userEvent.type(input, 'Alice')
      await userEvent.click(screen.getByRole('button', { name: /Create profile/i }))
      expect(screen.getByRole('alert').textContent).toMatch(/already exists/i)
    })

    it('creates a valid profile, clears the input, and adds it to the list', async () => {
      renderWithProvider()
      const input = screen.getByLabelText(/Profile name/i) as HTMLInputElement
      await userEvent.type(input, 'Alice')
      await userEvent.click(screen.getByRole('button', { name: /Create profile/i }))

      // Persisted
      expect(getProfiles().map((p) => p.name)).toContain('Alice')
      // Visible in the list
      expect(screen.getByText('Alice')).toBeDefined()
      // Input cleared, no error
      expect(input.value).toBe('')
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('clears the error message as soon as the user edits the input again', async () => {
      renderWithProvider()
      await userEvent.click(screen.getByRole('button', { name: /Create profile/i }))
      expect(screen.getByRole('alert')).toBeDefined()
      await userEvent.type(screen.getByLabelText(/Profile name/i), 'A')
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  describe('selecting profiles', () => {
    it('clicking a profile card sets the active profile and navigates to set_config', async () => {
      createProfile('Alice')
      renderWithProvider()
      await userEvent.click(screen.getByRole('button', { name: /Select profile Alice/i }))
      expect(screen.getByTestId('profile').textContent).toBe('Alice')
      expect(screen.getByTestId('screen').textContent).toBe('set_config')
    })

    it('restores an in-flight set from sessionStorage and navigates to active_set', async () => {
      createProfile('Alice')
      const inflight: ActiveSet = {
        questionIds: ['q1', 'q2'],
        setConfig: { size: 30, feedbackMode: 'immediate' },
        currentIndex: 1,
        answers: new Map([['q1', 0]]),
        timings: new Map([['q1', 12]]),
      }
      saveInflightSet('Alice', inflight)
      renderWithProvider()
      await userEvent.click(screen.getByRole('button', { name: /Select profile Alice/i }))
      expect(screen.getByTestId('profile').textContent).toBe('Alice')
      expect(screen.getByTestId('screen').textContent).toBe('active_set')
    })

    it('does not restore another profile\'s in-flight set', async () => {
      createProfile('Alice')
      createProfile('Bob')
      const inflight: ActiveSet = {
        questionIds: ['q1'],
        setConfig: { size: 30, feedbackMode: 'immediate' },
        currentIndex: 0,
        answers: new Map(),
        timings: new Map(),
      }
      saveInflightSet('Bob', inflight)
      renderWithProvider()
      await userEvent.click(screen.getByRole('button', { name: /Select profile Alice/i }))
      // Alice has no inflight → goes to set_config, not active_set.
      expect(screen.getByTestId('screen').textContent).toBe('set_config')
    })
  })

  describe('deleting profiles', () => {
    it('clicking Delete shows Confirm/Cancel and does not yet delete', async () => {
      createProfile('Alice')
      renderWithProvider()
      await userEvent.click(screen.getByRole('button', { name: /Delete profile Alice/i }))
      expect(screen.getByRole('button', { name: /Confirm delete profile Alice/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /Cancel deleting profile Alice/i })).toBeDefined()
      // Still persisted
      expect(getProfiles().map((p) => p.name)).toContain('Alice')
    })

    it('clicking Cancel reverts the confirmation UI', async () => {
      createProfile('Alice')
      renderWithProvider()
      await userEvent.click(screen.getByRole('button', { name: /Delete profile Alice/i }))
      await userEvent.click(screen.getByRole('button', { name: /Cancel deleting profile Alice/i }))
      // Back to the original Delete button
      expect(screen.getByRole('button', { name: /Delete profile Alice/i })).toBeDefined()
      expect(getProfiles().map((p) => p.name)).toContain('Alice')
    })

    it('clicking Confirm deletes the profile and removes it from the list', async () => {
      createProfile('Alice')
      createProfile('Bob')
      renderWithProvider()
      await userEvent.click(screen.getByRole('button', { name: /Delete profile Alice/i }))
      await userEvent.click(screen.getByRole('button', { name: /Confirm delete profile Alice/i }))

      expect(getProfiles().map((p) => p.name)).toEqual(['Bob'])
      expect(screen.queryByText('Alice')).toBeNull()
      expect(screen.getByText('Bob')).toBeDefined()
    })

    it('deleting the last profile reverts the screen to the empty state', async () => {
      createProfile('Alice')
      renderWithProvider()
      await userEvent.click(screen.getByRole('button', { name: /Delete profile Alice/i }))
      await userEvent.click(screen.getByRole('button', { name: /Confirm delete profile Alice/i }))
      expect(screen.getByRole('heading', { name: /Create your first profile/i })).toBeDefined()
    })

    it('also clears the in-flight snapshot so a recreated namesake does not inherit it', () => {
      createProfile('Alice')
      saveInflightSet('Alice', {
        questionIds: ['q1'],
        setConfig: { size: 30, feedbackMode: 'immediate' },
        currentIndex: 0,
        answers: new Map(),
        timings: new Map(),
      })
      expect(loadInflightSet('Alice')).not.toBeNull()
      deleteProfile('Alice')
      expect(loadInflightSet('Alice')).toBeNull()
    })
  })
})
