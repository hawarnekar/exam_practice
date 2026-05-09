import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardScreen } from './DashboardScreen'
import { AppProvider } from '../store/AppContext'
import { useApp } from '../store/appContextValue'
import { createProfile, getProgress, saveProgress } from '../store/sessionStore'
import type {
  Manifest,
  ProfileProgress,
  QuestionResult,
  SetRecord,
  TopicProgress,
} from '../types'

vi.mock('../data/questionLoader', () => ({
  loadManifest: vi.fn(),
  loadTopic: vi.fn(),
  getBankWarnings: vi.fn(() => []),
}))
import { loadManifest } from '../data/questionLoader'
const mockedLoadManifest = vi.mocked(loadManifest)

const manifest: Manifest = {
  topics: [
    {
      topicId: 'science/physics/light',
      subject: 'Science',
      topic: 'Physics',
      subtopic: 'Light',
      filePath: 'questions/science/physics/light.json',
      questionCount: 11,
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

function makeResult(qid: string, topicId: string, correct: boolean): QuestionResult {
  return {
    questionId: qid,
    topicId,
    selectedAnswer: 0,
    correct,
    skipped: false,
    elapsedSec: 30,
    expectedSec: 30,
  }
}

function makeRec(setNumber: number, correctCount: number, total: number, changes: SetRecord['topicStateChanges'] = []): SetRecord {
  const results: QuestionResult[] = []
  for (let i = 0; i < total; i++) {
    results.push(makeResult(`q${setNumber}-${i}`, 'science/physics/light', i < correctCount))
  }
  return {
    setNumber,
    date: new Date(2026, 4, setNumber).toISOString(),
    size: 30,
    feedbackMode: 'immediate',
    results,
    topicStateChanges: changes,
  }
}

function ScreenProbe() {
  const { currentScreen } = useApp()
  return <div data-testid="screen">{currentScreen}</div>
}

function renderWith(opts: {
  profile?: string
  withProgress?: (p: ProfileProgress) => ProfileProgress
} = {}) {
  const { profile = 'Alice', withProgress } = opts
  if (profile) {
    createProfile(profile)
    if (withProgress) saveProgress(profile, withProgress(getProgress(profile)))
  }
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
      <DashboardScreen />
      <ScreenProbe />
    </AppProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  mockedLoadManifest.mockReset()
  mockedLoadManifest.mockResolvedValue(manifest)
})

afterEach(() => {
  localStorage.clear()
})

describe('DashboardScreen', () => {
  it('shows the "no active profile" state when none is set', () => {
    render(
      <AppProvider>
        <DashboardScreen />
      </AppProvider>,
    )
    expect(screen.getByRole('heading', { name: /No active profile/i })).toBeDefined()
  })

  it('renders streak and sets-completed counters', async () => {
    renderWith({
      withProgress: (p) => ({
        ...p,
        streak: 5,
        setHistory: [makeRec(1, 10, 10), makeRec(2, 8, 10)],
      }),
    })
    await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())
    expect(screen.getByTestId('streak-count').textContent).toBe('5')
    expect(screen.getByTestId('sets-completed').textContent).toBe('2')
  })

  describe('subject heatmap', () => {
    it('groups topics by subject and uses the current mastery state for each card', async () => {
      const topicProgress: TopicProgress[] = [
        {
          topicId: 'science/physics/light',
          masteryState: 'mastered',
          lastSetAccuracy: 1,
          lastSetTimeRatio: 0.9,
          incorrectQuestionIds: [],
          seenQuestionIds: [],
        },
        // Math/polynomials is NOT in topicProgress -> falls back to 'unassessed'
      ]
      renderWith({
        withProgress: (p) => ({
          ...p,
          topicProgress,
          setHistory: [makeRec(1, 10, 10)],
        }),
      })
      await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())

      const lightCard = document.querySelector('[data-topic-id="science/physics/light"]')
      const mathCard = document.querySelector('[data-topic-id="math/algebra/polynomials"]')
      expect(lightCard?.getAttribute('data-state')).toBe('mastered')
      expect(mathCard?.getAttribute('data-state')).toBe('unassessed')

      // Subject grouping containers
      expect(document.querySelector('[data-subject="Science"]')).not.toBeNull()
      expect(document.querySelector('[data-subject="Math"]')).not.toBeNull()
    })
  })

  describe('accuracy sparkline', () => {
    it('renders 0 points when there is no history', async () => {
      renderWith()
      await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())
      const sparkline = screen.getByTestId('accuracy-sparkline')
      expect(sparkline.getAttribute('data-points')).toBe('0')
    })

    it('renders one point per recent set, capped to last 10', async () => {
      const sets: SetRecord[] = []
      for (let i = 1; i <= 12; i++) {
        sets.push(makeRec(i, 5, 10))
      }
      renderWith({
        withProgress: (p) => ({ ...p, setHistory: sets }),
      })
      await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())

      const sparkline = screen.getByTestId('accuracy-sparkline')
      expect(sparkline.getAttribute('data-points')).toBe('10')
      // Each point also rendered as a circle
      const circles = sparkline.querySelectorAll('circle')
      expect(circles.length).toBe(10)
    })
  })

  describe('per-topic timeline', () => {
    it('renders one dot per set per touched topic, with mastery-state attributes', async () => {
      const sets: SetRecord[] = [
        makeRec(1, 5, 10, [
          {
            topicId: 'science/physics/light',
            previousState: 'unassessed',
            newState: 'weak',
          },
        ]),
        makeRec(2, 9, 10, [
          {
            topicId: 'science/physics/light',
            previousState: 'weak',
            newState: 'in_progress',
          },
          {
            topicId: 'math/algebra/polynomials',
            previousState: 'unassessed',
            newState: 'weak',
          },
        ]),
        makeRec(3, 10, 10, [
          {
            topicId: 'science/physics/light',
            previousState: 'in_progress',
            newState: 'mastered',
          },
        ]),
      ]
      renderWith({ withProgress: (p) => ({ ...p, setHistory: sets }) })
      await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())

      const lightTimeline = screen.getByTestId('timeline-science/physics/light')
      const lightStates = [...lightTimeline.querySelectorAll('[data-state]')].map(
        (e) => e.getAttribute('data-state'),
      )
      expect(lightStates).toEqual(['weak', 'in_progress', 'mastered'])

      const mathTimeline = screen.getByTestId('timeline-math/algebra/polynomials')
      const mathStates = [...mathTimeline.querySelectorAll('[data-state]')].map(
        (e) => e.getAttribute('data-state'),
      )
      // Math first appeared in set 2 → set 1 padded with 'unassessed';
      // set 3 had no math change → carries previous ('weak').
      expect(mathStates).toEqual(['unassessed', 'weak', 'weak'])
    })

    it('omits the timeline section entirely when there is no history', async () => {
      renderWith()
      await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())
      expect(screen.queryByRole('heading', { name: /Per-topic state timeline/i })).toBeNull()
    })
  })

  it('"Start new set" navigates to set_config', async () => {
    renderWith({
      withProgress: (p) => ({ ...p, setHistory: [makeRec(1, 5, 10)] }),
    })
    await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: /Start new set/i }))
    expect(screen.getByTestId('screen').textContent).toBe('set_config')
  })

  it('shows a manifest error if loadManifest rejects', async () => {
    mockedLoadManifest.mockRejectedValueOnce(new Error('manifest down'))
    renderWith()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/manifest down/)
  })

  // Sanity: explicit T22 deliverable says "renders correct data after 2+ completed sets"
  it('renders streak, heatmap, sparkline, and timeline together after 2 sets', async () => {
    const sets: SetRecord[] = [
      makeRec(1, 4, 10, [
        { topicId: 'science/physics/light', previousState: 'unassessed', newState: 'weak' },
      ]),
      makeRec(2, 8, 10, [
        { topicId: 'science/physics/light', previousState: 'weak', newState: 'in_progress' },
      ]),
    ]
    renderWith({
      withProgress: (p) => ({
        ...p,
        streak: 2,
        setHistory: sets,
        topicProgress: [
          {
            topicId: 'science/physics/light',
            masteryState: 'in_progress',
            lastSetAccuracy: 0.8,
            lastSetTimeRatio: 1.0,
            incorrectQuestionIds: [],
            seenQuestionIds: [],
          },
        ],
      }),
    })
    await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())

    expect(screen.getByTestId('streak-count').textContent).toBe('2')
    expect(screen.getByTestId('sets-completed').textContent).toBe('2')

    const lightCard = document.querySelector('[data-topic-id="science/physics/light"]')
    expect(lightCard?.getAttribute('data-state')).toBe('in_progress')

    expect(screen.getByTestId('accuracy-sparkline').getAttribute('data-points')).toBe('2')

    const lightTimeline = within(screen.getByTestId('timeline-science/physics/light'))
    expect(lightTimeline.getByLabelText(/Set 1: Weak/)).toBeDefined()
    expect(lightTimeline.getByLabelText(/Set 2: In Progress/)).toBeDefined()
  })
})
