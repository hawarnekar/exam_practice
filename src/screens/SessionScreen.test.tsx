import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionScreen } from './SessionScreen'
import { AppProvider } from '../store/AppContext'
import { useApp } from '../store/appContextValue'
import { createProfile, getProgress, saveProgress } from '../store/sessionStore'
import { loadInflightSet, saveInflightSet } from '../store/inflightStore'
import type { ActiveSet, Manifest, Question } from '../types'

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

function makeQ(id: string, correct: number = 0, expected = 30): Question {
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
    expected_time_sec: expected,
    score: 1,
    explanation: `Explanation for ${id}`,
  }
}

const allQuestions: Question[] = [makeQ('q1', 0), makeQ('q2', 1), makeQ('q3', 2)]

function buildActiveSet(
  feedbackMode: 'immediate' | 'end_of_set',
  ids = ['q1', 'q2', 'q3'],
): ActiveSet {
  return {
    questionIds: ids,
    setConfig: { size: 30, feedbackMode, filter: { subject: 'Science', topic: null } },
    currentIndex: 0,
    answers: new Map(),
    timings: new Map(),
    optionOrder: new Map(),
  }
}

function ScreenProbe() {
  const { currentScreen, activeSet } = useApp()
  return (
    <div>
      <div data-testid="screen">{currentScreen}</div>
      <div data-testid="active-set">{activeSet === null ? 'null' : 'present'}</div>
    </div>
  )
}

function renderWithSet(activeSet: ActiveSet | null, profile = 'Alice') {
  if (profile && !localStorage.getItem('examPractice_profiles')) createProfile(profile)
  function Setup() {
    const { setProfile, setActiveSet, navigate } = useApp()
    useEffect(() => {
      if (profile) setProfile(profile)
      setActiveSet(activeSet)
      navigate('active_set')
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return null
  }
  return render(
    <AppProvider>
      <Setup />
      <SessionScreen />
      <ScreenProbe />
    </AppProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mockedLoadManifest.mockReset()
  mockedLoadTopic.mockReset()
  mockedLoadManifest.mockResolvedValue(manifest)
  mockedLoadTopic.mockResolvedValue(allQuestions)
})

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('SessionScreen', () => {
  describe('boundary conditions', () => {
    it('shows a redirect-style empty state when there is no active set', () => {
      renderWithSet(null)
      expect(screen.getByRole('heading', { name: /No active set/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /Go to Set Configuration/i })).toBeDefined()
    })

    it('clicking the redirect button navigates to set_config', async () => {
      renderWithSet(null)
      await userEvent.click(screen.getByRole('button', { name: /Go to Set Configuration/i }))
      expect(screen.getByTestId('screen').textContent).toBe('set_config')
    })

    it('shows a loading state until questions resolve', async () => {
      // Build the controllable promise up-front so it's the very promise
      // returned to the screen — no captured-late-resolver race.
      let resolveTopic: (qs: Question[]) => void = () => {}
      const pending = new Promise<Question[]>((res) => {
        resolveTopic = res
      })
      mockedLoadTopic.mockImplementationOnce(() => pending)

      renderWithSet(buildActiveSet('immediate'))

      // Wait until the screen has actually invoked loadTopic — otherwise we
      // might resolve before the awaiter exists.
      await waitFor(() => expect(mockedLoadTopic).toHaveBeenCalled())
      expect(screen.getByText(/Loading questions/i)).toBeDefined()

      resolveTopic(allQuestions)
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
    })

    it('renders a load error when manifest fetch fails', async () => {
      mockedLoadManifest.mockRejectedValueOnce(new Error('boom'))
      renderWithSet(buildActiveSet('immediate'))
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toMatch(/boom/)
    })
  })

  describe('immediate mode', () => {
    it('renders the first question and Q 1 / 3 progress', async () => {
      renderWithSet(buildActiveSet('immediate'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      expect(screen.getByText('Q 1 / 3')).toBeDefined()
    })

    it('clicking an option reveals the inline feedback with explanation and Next', async () => {
      renderWithSet(buildActiveSet('immediate'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())

      const optionA = screen.getByText('A').closest('button') as HTMLButtonElement
      await userEvent.click(optionA)

      const region = await screen.findByRole('region', { name: /Answer feedback/i })
      expect(region.textContent).toMatch(/Correct/)
      expect(region.textContent).toMatch(/Explanation for q1/)
      expect(screen.getByRole('button', { name: /Next question/i })).toBeDefined()
    })

    it('shows Incorrect when the wrong option is chosen', async () => {
      renderWithSet(buildActiveSet('immediate'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      // q1 correct=0, so clicking B selects index 1 (incorrect)
      await userEvent.click(screen.getByText('B').closest('button') as HTMLButtonElement)
      const region = await screen.findByRole('region', { name: /Answer feedback/i })
      expect(region.textContent).toMatch(/Incorrect/)
    })

    it('Skip records the question as skipped and shows the skip banner', async () => {
      renderWithSet(buildActiveSet('immediate'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('Skip').closest('button') as HTMLButtonElement)
      const region = await screen.findByRole('region', { name: /Answer feedback/i })
      expect(region.getAttribute('data-status')).toBe('skipped')
      expect(region.textContent).toMatch(/skipped/i)
    })

    it('after answering, clicking the option again is a no-op (forward-only)', async () => {
      renderWithSet(buildActiveSet('immediate'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)
      // Now feedback is showing. The option labels A/B/C/D appear in both
      // the QuestionCard and the FeedbackPanel — scope to the card's <article>
      // so the click target is unambiguous.
      const card = within(screen.getByRole('article'))
      await userEvent.click(card.getByText('B').closest('button') as HTMLButtonElement)
      // Still on q1
      expect(screen.getByText('Q 1 / 3')).toBeDefined()
    })

    it('clicking Next moves to the second question', async () => {
      renderWithSet(buildActiveSet('immediate'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)
      await userEvent.click(screen.getByRole('button', { name: /Next question/i }))
      await waitFor(() => expect(screen.getByText(/Question q2/)).toBeDefined())
      expect(screen.getByText('Q 2 / 3')).toBeDefined()
    })

    it('finishing the last question persists progress and navigates to set_summary', async () => {
      renderWithSet(buildActiveSet('immediate'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())

      // q1 → A correct
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)
      await userEvent.click(screen.getByRole('button', { name: /Next question/i }))
      // q2 → B correct
      await waitFor(() => expect(screen.getByText(/Question q2/)).toBeDefined())
      await userEvent.click(screen.getByText('B').closest('button') as HTMLButtonElement)
      await userEvent.click(screen.getByRole('button', { name: /Next question/i }))
      // q3 → C correct, last → Finish set
      await waitFor(() => expect(screen.getByText(/Question q3/)).toBeDefined())
      await userEvent.click(screen.getByText('C').closest('button') as HTMLButtonElement)
      await userEvent.click(screen.getByRole('button', { name: /Finish set/i }))

      await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('set_summary'))

      const stored = getProgress('Alice')
      expect(stored.setHistory).toHaveLength(1)
      const rec = stored.setHistory[0]
      expect(rec.results).toHaveLength(3)
      expect(rec.results.every((r) => r.correct)).toBe(true)
      expect(rec.feedbackMode).toBe('immediate')
      expect(rec.size).toBe(30)
      expect(stored.streak).toBe(1) // first set ever
      expect(stored.topicProgress.find((t) => t.topicId === 'science/physics/light')).toBeDefined()
    })

    it('skipped questions are persisted with elapsedSec = expected_time_sec', async () => {
      renderWithSet(buildActiveSet('immediate', ['q1']))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('Skip').closest('button') as HTMLButtonElement)
      await userEvent.click(screen.getByRole('button', { name: /Finish set/i }))

      await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('set_summary'))
      const rec = getProgress('Alice').setHistory[0]
      expect(rec.results).toHaveLength(1)
      expect(rec.results[0].skipped).toBe(true)
      expect(rec.results[0].correct).toBe(false)
      expect(rec.results[0].elapsedSec).toBe(30)
    })

    it('applies optionOrder so options render shuffled and grading follows the new correct index', async () => {
      // q1 has correct=0 ("q1 option A") in JSON. Permutation [2,0,1,3] means
      // displayed position 1 (label B) now shows the originally-correct option.
      const set = buildActiveSet('immediate', ['q1'])
      set.optionOrder = new Map([['q1', [2, 0, 1, 3]]])
      renderWithSet(set)
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())

      // The visual order of option contents reflects the permutation.
      const card = within(screen.getByRole('article'))
      const optionTexts = card
        .getAllByRole('button')
        .map((b) => b.textContent ?? '')
        .filter((t) => /q1 option [A-D]/.test(t))
      // First option button now contains the original "C" content.
      expect(optionTexts[0]).toMatch(/q1 option C/)
      expect(optionTexts[1]).toMatch(/q1 option A/)

      // Clicking visual label "B" (which after shuffle holds the originally-correct
      // "q1 option A") is graded correct.
      await userEvent.click(card.getByText('B').closest('button') as HTMLButtonElement)
      const region = await screen.findByRole('region', { name: /Answer feedback/i })
      expect(region.textContent).toMatch(/Correct/)

      // Persisted SetRecord captures the same optionOrder for SummaryScreen reuse.
      await userEvent.click(screen.getByRole('button', { name: /Finish set/i }))
      await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('set_summary'))
      const rec = getProgress('Alice').setHistory[0]
      expect(rec.optionOrder).toEqual({ q1: [2, 0, 1, 3] })
    })

    it('clears the activeSet from context after submit', async () => {
      renderWithSet(buildActiveSet('immediate', ['q1']))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)
      await userEvent.click(screen.getByRole('button', { name: /Finish set/i }))
      await waitFor(() => expect(screen.getByTestId('active-set').textContent).toBe('null'))
    })
  })

  describe('end-of-set mode', () => {
    it('shows Previous, Next, and Submit controls (no inline feedback)', async () => {
      renderWithSet(buildActiveSet('end_of_set'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      expect(screen.getByRole('button', { name: /Previous/i })).toBeDefined()
      expect(screen.getByRole('button', { name: /^Next$/ })).toBeDefined()
      expect(screen.getByLabelText(/Submit set/i)).toBeDefined()
      expect(screen.queryByRole('region', { name: /Answer feedback/i })).toBeNull()
    })

    it('answering does NOT show inline feedback', async () => {
      renderWithSet(buildActiveSet('end_of_set'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)
      expect(screen.queryByRole('region', { name: /Answer feedback/i })).toBeNull()
    })

    it('Previous is disabled on the first question and Next moves forward', async () => {
      renderWithSet(buildActiveSet('end_of_set'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      const prev = screen.getByRole('button', { name: /Previous/i }) as HTMLButtonElement
      expect(prev.disabled).toBe(true)

      await userEvent.click(screen.getByRole('button', { name: /^Next$/ }))
      await waitFor(() => expect(screen.getByText(/Question q2/)).toBeDefined())
      // Now Previous works
      expect((screen.getByRole('button', { name: /Previous/i }) as HTMLButtonElement).disabled).toBe(false)
    })

    it('Submit is disabled until every question has been answered or skipped', async () => {
      renderWithSet(buildActiveSet('end_of_set'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      const submit = screen.getByLabelText(/Submit set/i) as HTMLButtonElement
      expect(submit.disabled).toBe(true)

      // answer q1
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)
      expect(submit.disabled).toBe(true)

      // q2
      await userEvent.click(screen.getByRole('button', { name: /^Next$/ }))
      await waitFor(() => expect(screen.getByText(/Question q2/)).toBeDefined())
      await userEvent.click(screen.getByText('B').closest('button') as HTMLButtonElement)
      expect(submit.disabled).toBe(true)

      // q3 — skip
      await userEvent.click(screen.getByRole('button', { name: /^Next$/ }))
      await waitFor(() => expect(screen.getByText(/Question q3/)).toBeDefined())
      await userEvent.click(screen.getByText('Skip').closest('button') as HTMLButtonElement)
      expect(submit.disabled).toBe(false)
    })

    it('Submit persists results and navigates to set_summary', async () => {
      renderWithSet(buildActiveSet('end_of_set'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)
      await userEvent.click(screen.getByRole('button', { name: /^Next$/ }))
      await waitFor(() => expect(screen.getByText(/Question q2/)).toBeDefined())
      await userEvent.click(screen.getByText('B').closest('button') as HTMLButtonElement)
      await userEvent.click(screen.getByRole('button', { name: /^Next$/ }))
      await waitFor(() => expect(screen.getByText(/Question q3/)).toBeDefined())
      await userEvent.click(screen.getByText('C').closest('button') as HTMLButtonElement)

      await userEvent.click(screen.getByLabelText(/Submit set/i))
      await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('set_summary'))

      const rec = getProgress('Alice').setHistory[0]
      expect(rec.feedbackMode).toBe('end_of_set')
      expect(rec.results.every((r) => r.correct)).toBe(true)
    })
  })

  describe('end-of-set palette and submit-confirm flow (T20)', () => {
    it('renders the question palette in end-of-set mode with one button per question', async () => {
      renderWithSet(buildActiveSet('end_of_set'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      const palette = within(
        screen.getByRole('navigation', { name: /Question palette/i }),
      )
      // Each numbered button is reachable by its number text
      expect(palette.getByText('1')).toBeDefined()
      expect(palette.getByText('2')).toBeDefined()
      expect(palette.getByText('3')).toBeDefined()
    })

    it('palette buttons reflect answered/skipped/unanswered states as the user progresses', async () => {
      renderWithSet(buildActiveSet('end_of_set'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())

      const card = within(screen.getByRole('article'))
      await userEvent.click(card.getByText('A').closest('button') as HTMLButtonElement)

      const palette = within(
        screen.getByRole('navigation', { name: /Question palette/i }),
      )
      expect(
        (palette.getByText('1').closest('button') as HTMLButtonElement).getAttribute('data-status'),
      ).toBe('answered')

      // Move to q2 and skip it
      await userEvent.click(screen.getByRole('button', { name: /^Next$/ }))
      await waitFor(() => expect(screen.getByText(/Question q2/)).toBeDefined())
      await userEvent.click(
        within(screen.getByRole('article')).getByText('Skip').closest('button') as HTMLButtonElement,
      )
      expect(
        (palette.getByText('2').closest('button') as HTMLButtonElement).getAttribute('data-status'),
      ).toBe('skipped')

      // q3 stays unanswered
      expect(
        (palette.getByText('3').closest('button') as HTMLButtonElement).getAttribute('data-status'),
      ).toBe('unanswered')
    })

    it('clicking a palette button jumps directly to that question', async () => {
      renderWithSet(buildActiveSet('end_of_set'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())

      const palette = within(
        screen.getByRole('navigation', { name: /Question palette/i }),
      )
      await userEvent.click(palette.getByText('3').closest('button') as HTMLButtonElement)
      await waitFor(() => expect(screen.getByText(/Question q3/)).toBeDefined())
      expect(screen.getByText('Q 3 / 3')).toBeDefined()
    })

    it('shows an "X questions still unanswered" hint while Submit is disabled', async () => {
      renderWithSet(buildActiveSet('end_of_set'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      // 3 unanswered initially
      expect(screen.getByRole('status').textContent).toMatch(/3 questions still unanswered/i)

      // Answer q1 → 2 left
      await userEvent.click(
        within(screen.getByRole('article')).getByText('A').closest('button') as HTMLButtonElement,
      )
      expect(screen.getByRole('status').textContent).toMatch(/2 questions still unanswered/i)
    })

    it('tooltip and aria-label on the Submit button include the unanswered count', async () => {
      renderWithSet(buildActiveSet('end_of_set'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      const submit = screen.getByLabelText(/Submit set/i) as HTMLButtonElement
      expect(submit.getAttribute('aria-label')).toMatch(/3 questions still unanswered/)
      expect(submit.getAttribute('title')).toMatch(/3 questions still unanswered/)
    })

    it('submitting with skipped questions opens a confirmation dialog', async () => {
      renderWithSet(buildActiveSet('end_of_set'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())

      // Answer q1, q2; skip q3
      await userEvent.click(
        within(screen.getByRole('article')).getByText('A').closest('button') as HTMLButtonElement,
      )
      await userEvent.click(screen.getByRole('button', { name: /^Next$/ }))
      await waitFor(() => expect(screen.getByText(/Question q2/)).toBeDefined())
      await userEvent.click(
        within(screen.getByRole('article')).getByText('B').closest('button') as HTMLButtonElement,
      )
      await userEvent.click(screen.getByRole('button', { name: /^Next$/ }))
      await waitFor(() => expect(screen.getByText(/Question q3/)).toBeDefined())
      await userEvent.click(
        within(screen.getByRole('article')).getByText('Skip').closest('button') as HTMLButtonElement,
      )

      await userEvent.click(screen.getByLabelText(/Submit set/i))

      const dialog = await screen.findByRole('alertdialog')
      expect(dialog.textContent).toMatch(/1 skipped question/)
      // Submit was blocked: still on session screen
      expect(screen.getByTestId('screen').textContent).toBe('active_set')
    })

    it('Cancel closes the confirmation dialog without submitting', async () => {
      renderWithSet(buildActiveSet('end_of_set', ['q1']))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(
        within(screen.getByRole('article')).getByText('Skip').closest('button') as HTMLButtonElement,
      )
      await userEvent.click(screen.getByLabelText(/Submit set/i))
      await screen.findByRole('alertdialog')
      await userEvent.click(screen.getByRole('button', { name: /^Cancel$/ }))
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(screen.getByTestId('screen').textContent).toBe('active_set')
    })

    it('Submit anyway proceeds with submission and navigates to set_summary', async () => {
      renderWithSet(buildActiveSet('end_of_set', ['q1']))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(
        within(screen.getByRole('article')).getByText('Skip').closest('button') as HTMLButtonElement,
      )
      await userEvent.click(screen.getByLabelText(/Submit set/i))
      await screen.findByRole('alertdialog')
      await userEvent.click(screen.getByRole('button', { name: /Submit anyway/i }))
      await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('set_summary'))

      const rec = getProgress('Alice').setHistory[0]
      expect(rec.results).toHaveLength(1)
      expect(rec.results[0].skipped).toBe(true)
    })

    it('submitting with no skipped questions does NOT open the confirmation dialog', async () => {
      renderWithSet(buildActiveSet('end_of_set', ['q1']))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(
        within(screen.getByRole('article')).getByText('A').closest('button') as HTMLButtonElement,
      )
      await userEvent.click(screen.getByLabelText(/Submit set/i))
      // No dialog appears; submit proceeds straight to summary
      await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('set_summary'))
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })
  })

  describe('in-flight snapshot persistence', () => {
    it('snapshots the in-flight set to sessionStorage as the user answers', async () => {
      renderWithSet(buildActiveSet('end_of_set'))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())

      // Initial mount writes a snapshot at currentIndex 0 with empty answers.
      await waitFor(() => expect(loadInflightSet('Alice')).not.toBeNull())
      const initial = loadInflightSet('Alice')!
      expect(initial.currentIndex).toBe(0)
      expect(initial.answers.size).toBe(0)

      // Answer q1.
      await userEvent.click(
        within(screen.getByRole('article')).getByText('A').closest('button') as HTMLButtonElement,
      )
      await waitFor(() => expect(loadInflightSet('Alice')!.answers.get('q1')).toBe(0))

      // Move to q2 and skip it.
      await userEvent.click(screen.getByRole('button', { name: /^Next$/ }))
      await waitFor(() => expect(screen.getByText(/Question q2/)).toBeDefined())
      await userEvent.click(
        within(screen.getByRole('article')).getByText('Skip').closest('button') as HTMLButtonElement,
      )

      await waitFor(() => {
        const snap = loadInflightSet('Alice')!
        expect(snap.currentIndex).toBe(1)
        expect(snap.answers.get('q2')).toBe('skipped')
        expect(snap.timings.get('q2')).toBe(30) // skipped → expected_time_sec
      })
    })

    it('clears the snapshot after a successful submit', async () => {
      renderWithSet(buildActiveSet('immediate', ['q1']))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)
      await waitFor(() => expect(loadInflightSet('Alice')).not.toBeNull())
      await userEvent.click(screen.getByRole('button', { name: /Finish set/i }))
      await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('set_summary'))
      expect(loadInflightSet('Alice')).toBeNull()
    })

    it('keeps the snapshot when submit fails so a refresh would still recover the answers', async () => {
      renderWithSet(buildActiveSet('immediate', ['q1']))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)
      await waitFor(() => expect(loadInflightSet('Alice')).not.toBeNull())

      const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError')
      })
      try {
        await userEvent.click(screen.getByRole('button', { name: /Finish set/i }))
        await screen.findByRole('alertdialog', { name: /Couldn't save/i })
        // Snapshot survives failed submit so the user can refresh and retry.
        expect(loadInflightSet('Alice')).not.toBeNull()
      } finally {
        spy.mockRestore()
      }
    })

    it('a pre-seeded snapshot (e.g. from a refresh) is honored as the starting state', async () => {
      // Pretend the user was mid-set before refresh: q1 already answered, on q2.
      createProfile('Alice')
      saveInflightSet('Alice', {
        questionIds: ['q1', 'q2', 'q3'],
        setConfig: { size: 30, feedbackMode: 'end_of_set', filter: { subject: 'Science', topic: null } },
        currentIndex: 1,
        answers: new Map([['q1', 0]]),
        timings: new Map([['q1', 12]]),
        optionOrder: new Map(),
      })

      // Mimic the production mount order: SessionScreen only appears once
      // ProfileScreen.handleSelect has set activeSet from the snapshot.
      // (The shared renderWithSet helper mounts SessionScreen immediately,
      // before the effect fires, which would lock useState(currentIndex) at 0.)
      function Setup() {
        const { setProfile, setActiveSet, activeSet } = useApp()
        useEffect(() => {
          setProfile('Alice')
          setActiveSet(loadInflightSet('Alice')!)
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
        return activeSet ? <SessionScreen /> : null
      }
      render(
        <AppProvider>
          <Setup />
        </AppProvider>,
      )

      await waitFor(() => expect(screen.getByText(/Question q2/)).toBeDefined())
      const palette = within(screen.getByRole('navigation', { name: /Question palette/i }))
      expect(
        (palette.getByText('1').closest('button') as HTMLButtonElement).getAttribute('data-status'),
      ).toBe('answered')
    })
  })

  describe('save failure handling', () => {
    it('shows the save-error dialog when saveProgress hits a quota error and preserves the active set', async () => {
      renderWithSet(buildActiveSet('immediate', ['q1']))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)

      // Rig localStorage to fail on the next write — simulates quota exceeded.
      const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError')
      })

      try {
        await userEvent.click(screen.getByRole('button', { name: /Finish set/i }))

        const dialog = await screen.findByRole('alertdialog', { name: /Couldn't save/i })
        expect(dialog.textContent).toMatch(/storage is full/i)
        // Did not navigate, did not clear activeSet — answers are recoverable.
        expect(screen.getByTestId('screen').textContent).toBe('active_set')
        expect(screen.getByTestId('active-set').textContent).toBe('present')
      } finally {
        spy.mockRestore()
      }
    })

    it('"Try again" retries the save once storage has been freed', async () => {
      renderWithSet(buildActiveSet('immediate', ['q1']))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)

      const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError')
      })

      await userEvent.click(screen.getByRole('button', { name: /Finish set/i }))
      await screen.findByRole('alertdialog', { name: /Couldn't save/i })

      // Free up "space": restore real setItem behavior, then retry.
      spy.mockRestore()
      await userEvent.click(screen.getByRole('button', { name: /Try again/i }))

      await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('set_summary'))
      const rec = getProgress('Alice').setHistory[0]
      expect(rec.results).toHaveLength(1)
    })

    it('"Dismiss" closes the dialog while keeping the active set so the user can retry later', async () => {
      renderWithSet(buildActiveSet('immediate', ['q1']))
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)

      const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError')
      })

      try {
        await userEvent.click(screen.getByRole('button', { name: /Finish set/i }))
        await screen.findByRole('alertdialog', { name: /Couldn't save/i })
        await userEvent.click(screen.getByRole('button', { name: /^Dismiss$/ }))
        expect(screen.queryByRole('alertdialog', { name: /Couldn't save/i })).toBeNull()
        expect(screen.getByTestId('active-set').textContent).toBe('present')
        expect(screen.getByTestId('screen').textContent).toBe('active_set')
      } finally {
        spy.mockRestore()
      }
    })
  })

  describe('streak handling', () => {
    it('increments streak when the previous set was yesterday', async () => {
      createProfile('Bob')
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const y = yesterday.getFullYear()
      const m = String(yesterday.getMonth() + 1).padStart(2, '0')
      const d = String(yesterday.getDate()).padStart(2, '0')
      const yesterdayStr = `${y}-${m}-${d}`

      const progress = getProgress('Bob')
      saveProgress('Bob', { ...progress, streak: 3, lastSetDate: yesterdayStr })

      renderWithSet(buildActiveSet('immediate', ['q1']), 'Bob')
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)
      await userEvent.click(screen.getByRole('button', { name: /Finish set/i }))
      await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('set_summary'))

      expect(getProgress('Bob').streak).toBe(4)
    })

    it('keeps streak when the previous set was already today', async () => {
      createProfile('Carol')
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
        2,
        '0',
      )}-${String(today.getDate()).padStart(2, '0')}`
      const progress = getProgress('Carol')
      saveProgress('Carol', { ...progress, streak: 7, lastSetDate: todayStr })

      renderWithSet(buildActiveSet('immediate', ['q1']), 'Carol')
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)
      await userEvent.click(screen.getByRole('button', { name: /Finish set/i }))
      await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('set_summary'))

      expect(getProgress('Carol').streak).toBe(7)
    })

    it('resets streak to 1 when the gap is more than one day', async () => {
      createProfile('Dave')
      const progress = getProgress('Dave')
      saveProgress('Dave', { ...progress, streak: 5, lastSetDate: '2020-01-01' })

      renderWithSet(buildActiveSet('immediate', ['q1']), 'Dave')
      await waitFor(() => expect(screen.getByText(/Question q1/)).toBeDefined())
      await userEvent.click(screen.getByText('A').closest('button') as HTMLButtonElement)
      await userEvent.click(screen.getByRole('button', { name: /Finish set/i }))
      await waitFor(() => expect(screen.getByTestId('screen').textContent).toBe('set_summary'))

      expect(getProgress('Dave').streak).toBe(1)
    })
  })
})
