import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { createProfile } from './store/sessionStore'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

afterEach(() => {
  document.documentElement.classList.remove('dark')
})

describe('App shell', () => {
  it('renders the title and the empty Profile screen by default', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /Exam Practice/i })).toBeDefined()
    expect(screen.getByRole('heading', { name: /Create your first profile/i })).toBeDefined()
  })

  it('TopBar dashboard button navigates to the Dashboard screen', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /open dashboard/i }))
    // No profile is set, so the real DashboardScreen renders its empty state.
    // What matters is that navigation actually happened.
    expect(screen.getByRole('heading', { name: /No active profile/i })).toBeDefined()
  })

  it('TopBar settings button navigates to the Settings screen', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /open settings/i }))
    // No profile is set, so the real SettingsScreen renders its empty state.
    // What matters is that navigation actually happened.
    expect(screen.getByRole('heading', { name: /No active profile/i })).toBeDefined()
  })

  it('TopBar dark-mode toggle switches the dark class on <html>', async () => {
    render(<App />)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: /switch to light mode/i }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('selecting a profile navigates to the Set Configuration screen', async () => {
    createProfile('Alice')
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /Select profile Alice/i }))
    expect(screen.getByRole('heading', { name: /Set up your practice set/i })).toBeDefined()
  })

  // (Removed) The placeholder-navigation traversal test no longer applies —
  // Summary is now a real screen with its own loading flow. TopBar tests above
  // already cover global navigation; per-screen behavior is covered in each
  // screen's own test file.
})
