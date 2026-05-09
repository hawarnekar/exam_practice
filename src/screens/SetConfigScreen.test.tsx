import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetConfigScreen } from './SetConfigScreen'
import { AppProvider } from '../store/AppContext'
import { useApp } from '../store/appContextValue'
import { createProfile } from '../store/sessionStore'
import type { Manifest, Question } from '../types'

// Mock the question loader so tests don't depend on disk fetches.
vi.mock('../data/questionLoader', () => {
  return {
    loadManifest: vi.fn(),
    loadTopic: vi.fn(),
    getBankWarnings: vi.fn(),
  }
})

// Mock the adaptive engine — its correctness is covered in its own tests;
// here we only care that the screen invokes it and threads its output.
vi.mock('../engine/adaptiveEngine', () => {
  return {
    generateSet: vi.fn(),
  }
})

import { getBankWarnings, loadManifest, loadTopic } from '../data/questionLoader'
import { generateSet } from '../engine/adaptiveEngine'

const mockedLoadManifest = vi.mocked(loadManifest)
const mockedLoadTopic = vi.mocked(loadTopic)
const mockedGetBankWarnings = vi.mocked(getBankWarnings)
const mockedGenerateSet = vi.mocked(generateSet)

const sampleManifest: Manifest = {
  topics: [
    {
      topicId: 'science/physics/light',
      subject: 'Science',
      topic: 'Physics',
      subtopic: 'Light',
      filePath: 'questions/science/physics/light.json',
      questionCount: 25,
    },
    {
      topicId: 'math/algebra/polynomials',
      subject: 'Math',
      topic: 'Algebra',
      subtopic: 'Polynomials',
      filePath: 'questions/math/algebra/polynomials.json',
      questionCount: 12,
    },
  ],
}

const fakeQuestion: Question = {
  id: 'fake-1',
  text: 't',
  image: null,
  options: [
    { text: 'a', image: null },
    { text: 'b', image: null },
  ],
  correct: 0,
  difficulty: 'easy',
  expected_time_sec: 30,
  score: 1,
  explanation: '',
}

function ScreenProbe() {
  const { currentScreen, activeSet } = useApp()
  return (
    <div>
      <div data-testid="screen">{currentScreen}</div>
      <div data-testid="active-set-size">{activeSet?.questionIds.length ?? 0}</div>
      <div data-testid="active-set-mode">{activeSet?.setConfig.feedbackMode ?? '(none)'}</div>
    </div>
  )
}

function renderWith({ profile = 'Alice' }: { profile?: string | null } = {}) {
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
      <SetConfigScreen />
      <ScreenProbe />
    </AppProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  mockedLoadManifest.mockReset()
  mockedLoadTopic.mockReset()
  mockedGetBankWarnings.mockReset()
  mockedGenerateSet.mockReset()

  // Default: load resolves with the sample manifest, no warnings.
  mockedLoadManifest.mockResolvedValue(sampleManifest)
  mockedGetBankWarnings.mockReturnValue([])
  mockedLoadTopic.mockResolvedValue([fakeQuestion])
  mockedGenerateSet.mockReturnValue(['fake-1', 'fake-1', 'fake-1'])
})

afterEach(() => {
  localStorage.clear()
})

describe('SetConfigScreen', () => {
  it('renders the heading and active profile name', async () => {
    renderWith()
    expect(screen.getByRole('heading', { name: /Set up your practice set/i })).toBeDefined()
    await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())
    expect(screen.getByText(/Active profile:/i).textContent).toMatch(/Alice/)
  })

  it('renders all three set-size options', async () => {
    renderWith()
    expect(screen.getByRole('button', { name: '30' })).toBeDefined()
    expect(screen.getByRole('button', { name: '60' })).toBeDefined()
    expect(screen.getByRole('button', { name: '100' })).toBeDefined()
  })

  it('renders both feedback-mode options with descriptions', async () => {
    renderWith()
    expect(screen.getByText('Immediate Feedback')).toBeDefined()
    expect(screen.getByText('End-of-Set Review')).toBeDefined()
    expect(screen.getByText(/each answer is correct as you go/i)).toBeDefined()
    expect(screen.getByText(/review every answer at the end/i)).toBeDefined()
  })

  it('Start button is disabled until both options are picked', async () => {
    renderWith()
    const startBtn = screen.getByRole('button', { name: /Start set/i }) as HTMLButtonElement
    expect(startBtn.disabled).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: '60' }))
    expect(startBtn.disabled).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: /Immediate Feedback/i }))
    await waitFor(() => expect(startBtn.disabled).toBe(false))
  })

  it('selecting size and mode marks them aria-pressed=true', async () => {
    renderWith()
    await userEvent.click(screen.getByRole('button', { name: '60' }))
    expect(screen.getByRole('button', { name: '60' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '30' }).getAttribute('aria-pressed')).toBe('false')

    await userEvent.click(screen.getByRole('button', { name: /Immediate Feedback/i }))
    expect(
      screen.getByRole('button', { name: /Immediate Feedback/i }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('clicking Start calls the engine, stores the ActiveSet, and navigates to active_set', async () => {
    mockedGenerateSet.mockReturnValue(['q1', 'q2', 'q3'])
    renderWith()

    await userEvent.click(screen.getByRole('button', { name: '30' }))
    await userEvent.click(screen.getByRole('button', { name: /End-of-Set Review/i }))

    const startBtn = screen.getByRole('button', { name: /Start set/i }) as HTMLButtonElement
    await waitFor(() => expect(startBtn.disabled).toBe(false))
    await userEvent.click(startBtn)

    await waitFor(() => expect(mockedGenerateSet).toHaveBeenCalled())
    expect(mockedLoadTopic).toHaveBeenCalledTimes(sampleManifest.topics.length)

    // Engine was called with the user's chosen config
    const callArgs = mockedGenerateSet.mock.calls[0]
    expect(callArgs[3]).toEqual({ size: 30, feedbackMode: 'end_of_set' })

    // Navigation + active set stored in context
    await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('active_set'))
    expect(screen.getByTestId('active-set-size').textContent).toBe('3')
    expect(screen.getByTestId('active-set-mode').textContent).toBe('end_of_set')
  })

  it('shows the bank-warning banner when getBankWarnings returns warnings, and lets the user dismiss it', async () => {
    mockedGetBankWarnings.mockReturnValue(['math/algebra/polynomials: only 12 questions'])
    renderWith()

    const warning = await screen.findByRole('status', { name: /Question bank size warning/i })
    expect(warning.textContent).toMatch(/only 12 questions/)

    await userEvent.click(screen.getByRole('button', { name: /Dismiss bank size warning/i }))
    expect(screen.queryByRole('status', { name: /Question bank size warning/i })).toBeNull()
  })

  it('does not render the warning banner when there are no warnings', async () => {
    renderWith()
    await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())
    expect(screen.queryByRole('status', { name: /Question bank size warning/i })).toBeNull()
  })

  it('clicking "Switch profile" navigates back to profile_select', async () => {
    renderWith()
    await userEvent.click(screen.getByRole('button', { name: /Switch profile/i }))
    expect(screen.getByTestId('screen').textContent).toBe('profile_select')
  })

  it('shows an error when the manifest fails to load', async () => {
    mockedLoadManifest.mockRejectedValueOnce(new Error('boom'))
    renderWith()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/boom/)
  })

  it('shows an error when the engine produces an empty set', async () => {
    mockedGenerateSet.mockReturnValue([])
    renderWith()

    await userEvent.click(screen.getByRole('button', { name: '30' }))
    await userEvent.click(screen.getByRole('button', { name: /Immediate Feedback/i }))

    const startBtn = screen.getByRole('button', { name: /Start set/i }) as HTMLButtonElement
    await waitFor(() => expect(startBtn.disabled).toBe(false))
    await userEvent.click(startBtn)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/empty/i)
    // Should not have navigated to active_set.
    expect(screen.getByTestId('screen').textContent).not.toBe('active_set')
  })
})
