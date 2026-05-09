import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SummaryScreen } from './SummaryScreen'
import { AppProvider } from '../store/AppContext'
import { useApp } from '../store/appContextValue'
import { createProfile, getProgress, saveProgress } from '../store/sessionStore'
import type {
  Manifest,
  ProfileProgress,
  Question,
  QuestionResult,
  SetRecord,
  TopicProgress,
} from '../types'

vi.mock('../data/questionLoader', () => ({
  loadManifest: vi.fn(),
  loadTopic: vi.fn(),
  getBankWarnings: vi.fn(() => []),
}))
import { loadManifest, loadTopic } from '../data/questionLoader'
const mockedLoadManifest = vi.mocked(loadManifest)
const mockedLoadTopic = vi.mocked(loadTopic)

const manifest: Manifest = {
  topics: [
    {
      topicId: 'science/physics/light',
      subject: 'Science',
      topic: 'Physics',
      subtopic: 'Light',
      filePath: 'questions/science/physics/light.json',
      questionCount: 3,
    },
  ],
}

function makeQ(id: string, correct = 0, score = 1): Question {
  return {
    id,
    text: `Question ${id}`,
    image: null,
    options: [
      { text: `${id} option A`, image: null },
      { text: `${id} option B`, image: null },
      { text: `${id} option C`, image: null },
      { text: `${id} option D`, image: null },
    ],
    correct,
    difficulty: 'easy',
    expected_time_sec: 30,
    score,
    explanation: `Explanation for ${id}`,
  }
}

const allQuestions: Question[] = [makeQ('q1', 0, 1), makeQ('q2', 1, 2), makeQ('q3', 2, 1)]

function makeSetRecord(results: QuestionResult[]): SetRecord {
  return {
    setNumber: 1,
    date: new Date().toISOString(),
    size: 30,
    feedbackMode: 'immediate',
    results,
    topicStateChanges: [
      { topicId: 'science/physics/light', previousState: 'unassessed', newState: 'weak' },
    ],
  }
}

function ScreenProbe() {
  const { currentScreen } = useApp()
  return <div data-testid="screen">{currentScreen}</div>
}

function renderWith({
  profile = 'Alice',
  withProgress,
}: {
  profile?: string | null
  withProgress?: (p: ProfileProgress) => ProfileProgress
} = {}) {
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
      <SummaryScreen />
      <ScreenProbe />
    </AppProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  mockedLoadManifest.mockReset()
  mockedLoadTopic.mockReset()
  mockedLoadManifest.mockResolvedValue(manifest)
  mockedLoadTopic.mockResolvedValue(allQuestions)
})

afterEach(() => {
  localStorage.clear()
})

describe('SummaryScreen', () => {
  describe('empty / boundary states', () => {
    it('shows the "no active profile" state when no profile is set', () => {
      // Don't pass profile; activeProfile stays null
      render(
        <AppProvider>
          <SummaryScreen />
        </AppProvider>,
      )
      expect(screen.getByRole('heading', { name: /No active profile/i })).toBeDefined()
    })

    it('shows "no completed sets" when the profile has empty history', () => {
      renderWith()
      expect(screen.getByRole('heading', { name: /No completed sets/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /Start a set/i })).toBeDefined()
    })
  })

  describe('overview card', () => {
    it('computes score, accuracy, time ratio, and counts correctly', async () => {
      const results: QuestionResult[] = [
        { questionId: 'q1', topicId: 'science/physics/light', selectedAnswer: 0, correct: true, skipped: false, elapsedSec: 30, expectedSec: 30 }, // ratio 1.0
        { questionId: 'q2', topicId: 'science/physics/light', selectedAnswer: 0, correct: false, skipped: false, elapsedSec: 60, expectedSec: 30 }, // ratio 2.0
        { questionId: 'q3', topicId: 'science/physics/light', selectedAnswer: 'skipped', correct: false, skipped: true, elapsedSec: 30, expectedSec: 30 }, // ratio 1.0 (skipped)
      ]
      const rec = makeSetRecord(results)

      renderWith({
        withProgress: (p) => ({ ...p, setHistory: [rec] }),
      })

      await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())
      const overview = within(screen.getByRole('article', { name: /Set overview/i }))

      // Score: q1=1 (correct, score 1), q2=0 (incorrect, score 2 not earned), q3=0 (skipped, score 1 not earned)
      // Earned = 1, Possible = 4
      expect(overview.getByText(/^1 \/ 4$/)).toBeDefined()
      // Accuracy: 1/3 → 33%
      expect(overview.getByText(/33%/)).toBeDefined()
      // Avg time ratio: (1.0 + 2.0 + 1.0) / 3 = 1.33
      expect(overview.getByText(/1\.33/)).toBeDefined()
      // Counts
      expect(overview.getByText('1 / 1 / 1')).toBeDefined()
    })
  })

  describe('topic state changes card', () => {
    it('renders one row per topic state change with previous and new chips', async () => {
      const results: QuestionResult[] = [
        { questionId: 'q1', topicId: 'science/physics/light', selectedAnswer: 0, correct: true, skipped: false, elapsedSec: 30, expectedSec: 30 },
      ]
      const rec: SetRecord = {
        ...makeSetRecord(results),
        topicStateChanges: [
          { topicId: 'science/physics/light', previousState: 'unassessed', newState: 'mastered' },
          { topicId: 'math/algebra/polynomials', previousState: 'weak', newState: 'in_progress' },
        ],
      }
      renderWith({ withProgress: (p) => ({ ...p, setHistory: [rec] }) })

      await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())
      const card = within(screen.getByRole('article', { name: /Topic state changes/i }))
      const lightRow = card.getByText('science/physics/light').closest('li') as HTMLElement
      const mathRow = card.getByText('math/algebra/polynomials').closest('li') as HTMLElement
      expect(lightRow.getAttribute('data-from-state')).toBe('unassessed')
      expect(lightRow.getAttribute('data-to-state')).toBe('mastered')
      expect(mathRow.getAttribute('data-from-state')).toBe('weak')
      expect(mathRow.getAttribute('data-to-state')).toBe('in_progress')
    })
  })

  describe('per-topic drilldown', () => {
    it('renders a topic accordion that expands to show per-question results', async () => {
      const results: QuestionResult[] = [
        { questionId: 'q1', topicId: 'science/physics/light', selectedAnswer: 0, correct: true, skipped: false, elapsedSec: 30, expectedSec: 30 },
        { questionId: 'q2', topicId: 'science/physics/light', selectedAnswer: 0, correct: false, skipped: false, elapsedSec: 60, expectedSec: 30 },
        { questionId: 'q3', topicId: 'science/physics/light', selectedAnswer: 'skipped', correct: false, skipped: true, elapsedSec: 30, expectedSec: 30 },
      ]
      renderWith({ withProgress: (p) => ({ ...p, setHistory: [makeSetRecord(results)] }) })
      await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())

      // Wait until questions have loaded so the drilldown can render question text
      await waitFor(() => expect(mockedLoadTopic).toHaveBeenCalled())

      const header = screen.getByRole('button', { name: /science\/physics\/light/i })
      expect(header.getAttribute('aria-expanded')).toBe('false')

      await userEvent.click(header)
      expect(header.getAttribute('aria-expanded')).toBe('true')

      // The per-topic count summary
      expect(header.textContent).toMatch(/1 correct/)
      expect(header.textContent).toMatch(/1 incorrect/)
      expect(header.textContent).toMatch(/1 skipped/)

      // Drilldown rows have data-result attributes
      const rows = document.querySelectorAll('[data-qid]')
      expect(rows).toHaveLength(3)
      const byQid = (id: string) => document.querySelector(`[data-qid="${id}"]`)
      expect(byQid('q1')!.getAttribute('data-result')).toBe('correct')
      expect(byQid('q2')!.getAttribute('data-result')).toBe('incorrect')
      expect(byQid('q3')!.getAttribute('data-result')).toBe('skipped')
    })

    it('explanation toggles per question', async () => {
      const results: QuestionResult[] = [
        { questionId: 'q1', topicId: 'science/physics/light', selectedAnswer: 0, correct: true, skipped: false, elapsedSec: 30, expectedSec: 30 },
      ]
      renderWith({ withProgress: (p) => ({ ...p, setHistory: [makeSetRecord(results)] }) })
      await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())
      await waitFor(() => expect(mockedLoadTopic).toHaveBeenCalled())

      // Expand the topic
      await userEvent.click(screen.getByRole('button', { name: /science\/physics\/light/i }))
      // Initially explanation is hidden
      expect(screen.queryByText(/Explanation for q1/)).toBeNull()
      // Click "Show explanation"
      await userEvent.click(screen.getByRole('button', { name: /Show explanation/i }))
      expect(screen.getByText(/Explanation for q1/)).toBeDefined()
      // Toggle off
      await userEvent.click(screen.getByRole('button', { name: /Hide explanation/i }))
      expect(screen.queryByText(/Explanation for q1/)).toBeNull()
    })
  })

  describe('recommendation', () => {
    function topicProgress(states: TopicProgress['masteryState'][]): TopicProgress[] {
      return states.map((s, i) => ({
        topicId: `t${i}`,
        masteryState: s,
        lastSetAccuracy: 0,
        lastSetTimeRatio: 1,
        incorrectQuestionIds: [],
        seenQuestionIds: [],
      }))
    }

    function withRecResults(): QuestionResult[] {
      return [
        { questionId: 'q1', topicId: 'science/physics/light', selectedAnswer: 0, correct: true, skipped: false, elapsedSec: 30, expectedSec: 30 },
      ]
    }

    it.each([
      [['mastered', 'mastered'] as const, 30],
      [['weak'] as const, 60],
      [['weak', 'weak', 'weak'] as const, 60],
      [['weak', 'weak', 'weak', 'weak'] as const, 100],
    ])('with topic states %j recommends a %i-question set', async (states, expected) => {
      renderWith({
        withProgress: (p) => ({
          ...p,
          setHistory: [makeSetRecord(withRecResults())],
          topicProgress: topicProgress([...states]),
        }),
      })
      await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())
      const card = within(screen.getByRole('article', { name: /Recommendation/i }))
      expect(card.getByText(new RegExp(`${expected} questions`))).toBeDefined()
    })
  })

  describe('navigation buttons', () => {
    it('"Start next set" navigates to set_config', async () => {
      renderWith({
        withProgress: (p) => ({
          ...p,
          setHistory: [makeSetRecord([
            { questionId: 'q1', topicId: 'science/physics/light', selectedAnswer: 0, correct: true, skipped: false, elapsedSec: 30, expectedSec: 30 },
          ])],
        }),
      })
      await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())
      await userEvent.click(screen.getByRole('button', { name: /Start next set/i }))
      expect(screen.getByTestId('screen').textContent).toBe('set_config')
    })

    it('"View dashboard" navigates to dashboard', async () => {
      renderWith({
        withProgress: (p) => ({
          ...p,
          setHistory: [makeSetRecord([
            { questionId: 'q1', topicId: 'science/physics/light', selectedAnswer: 0, correct: true, skipped: false, elapsedSec: 30, expectedSec: 30 },
          ])],
        }),
      })
      await waitFor(() => expect(mockedLoadManifest).toHaveBeenCalled())
      await userEvent.click(screen.getByRole('button', { name: /View dashboard/i }))
      expect(screen.getByTestId('screen').textContent).toBe('dashboard')
    })
  })
})
