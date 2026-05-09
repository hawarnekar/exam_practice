import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuestionCard } from './QuestionCard'
import type { Question } from '../types'

const sampleQuestion: Question = {
  id: 'sci-test-001',
  text: 'What is the value of $x$ if $2x = 6$?',
  image: null,
  options: [
    { text: '$1$', image: null },
    { text: '$2$', image: null },
    { text: '$3$', image: null },
    { text: '$4$', image: null },
  ],
  correct: 2,
  difficulty: 'easy',
  expected_time_sec: 30,
  score: 1,
  explanation: '$2x = 6 \\Rightarrow x = 3$.',
}

function renderCard(overrides: Partial<React.ComponentProps<typeof QuestionCard>> = {}) {
  const onAnswer = vi.fn()
  const onSkip = vi.fn()
  const utils = render(
    <QuestionCard
      question={sampleQuestion}
      questionNumber={3}
      totalQuestions={12}
      selectedAnswer={null}
      onAnswer={onAnswer}
      onSkip={onSkip}
      feedbackMode="immediate"
      {...overrides}
    />,
  )
  return { ...utils, onAnswer, onSkip }
}

describe('QuestionCard', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the progress indicator using questionNumber and totalQuestions', () => {
    renderCard()
    expect(screen.getByText('Q 3 / 12')).toBeDefined()
  })

  it('renders all four option labels A, B, C, D', () => {
    renderCard()
    expect(screen.getByText('A')).toBeDefined()
    expect(screen.getByText('B')).toBeDefined()
    expect(screen.getByText('C')).toBeDefined()
    expect(screen.getByText('D')).toBeDefined()
  })

  it('renders KaTeX inside the question text', () => {
    const { container } = renderCard()
    // $2x = 6$ should produce a .katex span inside the card
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('renders KaTeX inside option text', () => {
    const { container } = renderCard()
    // Each of the four options has $...$ math, so we should see >= 4 katex
    // wrappers (1 in the question + 4 in options).
    const katex = container.querySelectorAll('.katex')
    expect(katex.length).toBeGreaterThanOrEqual(4)
  })

  it('renders the timer at 0:00 initially with normal color state', () => {
    renderCard()
    const timer = screen.getByRole('timer')
    expect(timer.textContent).toBe('0:00')
    expect(timer.getAttribute('data-color-state')).toBe('normal')
  })

  it('clicking an option calls onAnswer with that option index', async () => {
    const { onAnswer } = renderCard()
    const optionC = screen.getByText('C').closest('button')!
    await userEvent.click(optionC)
    expect(onAnswer).toHaveBeenCalledWith(2)
  })

  it('clicking Skip calls onSkip', async () => {
    const { onSkip } = renderCard()
    await userEvent.click((screen.getByText('Skip').closest('button') as HTMLButtonElement))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('marks the selected option with aria-pressed=true', () => {
    renderCard({ selectedAnswer: 1 })
    const optionB = screen.getByText('B').closest('button')!
    expect(optionB.getAttribute('aria-pressed')).toBe('true')
  })

  it('marks the skip button as pressed when selectedAnswer is "skipped"', () => {
    renderCard({ selectedAnswer: 'skipped' })
    const skip = (screen.getByText('Skip').closest('button') as HTMLButtonElement)
    expect(skip.getAttribute('aria-pressed')).toBe('true')
  })

  it.each([
    ['1', 0],
    ['2', 1],
    ['3', 2],
    ['4', 3],
  ])('keyboard %s selects option index %i', async (key, expectedIdx) => {
    const { onAnswer } = renderCard()
    await userEvent.keyboard(key)
    expect(onAnswer).toHaveBeenCalledWith(expectedIdx)
  })

  it('keyboard S triggers skip (case-insensitive)', async () => {
    const { onSkip } = renderCard()
    await userEvent.keyboard('s')
    expect(onSkip).toHaveBeenCalledTimes(1)

    await userEvent.keyboard('S')
    expect(onSkip).toHaveBeenCalledTimes(2)
  })

  it('keyboard digits beyond options.length are ignored', async () => {
    const twoOptionQuestion: Question = {
      ...sampleQuestion,
      options: [sampleQuestion.options[0], sampleQuestion.options[1]],
      correct: 0,
    }
    const onAnswer = vi.fn()
    render(
      <QuestionCard
        question={twoOptionQuestion}
        questionNumber={1}
        totalQuestions={1}
        selectedAnswer={null}
        onAnswer={onAnswer}
        onSkip={() => {}}
        feedbackMode="immediate"
      />,
    )
    await userEvent.keyboard('3')
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('keyboard shortcuts are suppressed while focus is in an input', async () => {
    const onSkip = vi.fn()
    render(
      <>
        <input data-testid="probe-input" />
        <QuestionCard
          question={sampleQuestion}
          questionNumber={1}
          totalQuestions={1}
          selectedAnswer={null}
          onAnswer={() => {}}
          onSkip={onSkip}
          feedbackMode="immediate"
        />
      </>,
    )
    const input = screen.getByTestId('probe-input')
    input.focus()
    await userEvent.keyboard('s')
    expect(onSkip).not.toHaveBeenCalled()
  })

  it('removes the keyboard listener when unmounted', async () => {
    const onSkip = vi.fn()
    const { unmount } = render(
      <QuestionCard
        question={sampleQuestion}
        questionNumber={1}
        totalQuestions={1}
        selectedAnswer={null}
        onAnswer={() => {}}
        onSkip={onSkip}
        feedbackMode="immediate"
      />,
    )
    unmount()
    await userEvent.keyboard('s')
    expect(onSkip).not.toHaveBeenCalled()
  })

  it('renders the question image when one is provided', () => {
    const { container } = renderCard({
      question: { ...sampleQuestion, image: 'data:image/svg+xml;utf8,<svg/>' },
    })
    expect(container.querySelector('img')).not.toBeNull()
  })

  it('shows the immediate-mode hint text in feedbackMode="immediate"', () => {
    renderCard({ feedbackMode: 'immediate' })
    expect(screen.getByText(/Immediate feedback/)).toBeDefined()
  })

  it('shows the end-of-set hint text in feedbackMode="end_of_set"', () => {
    renderCard({ feedbackMode: 'end_of_set' })
    expect(screen.getByText(/Review all answers at end of set/)).toBeDefined()
  })

  it('option buttons carry the 48px (min-h-12) tap-target class', () => {
    renderCard()
    const optionButtons = ['A', 'B', 'C', 'D'].map(
      (label) => screen.getByText(label).closest('button') as HTMLButtonElement,
    )
    for (const btn of optionButtons) {
      expect(btn.className).toContain('min-h-12')
    }
  })

  it('skip button carries the 48px (min-h-12) tap-target class', () => {
    renderCard()
    const skip = screen.getByText('Skip').closest('button') as HTMLButtonElement
    expect(skip.className).toContain('min-h-12')
  })

  it('selected option visually highlights with the blue border/background classes', () => {
    renderCard({ selectedAnswer: 2 })
    const optionC = screen.getByText('C').closest('button') as HTMLButtonElement
    expect(optionC.className).toMatch(/border-blue-600/)
    expect(optionC.className).toMatch(/bg-blue-50/)
  })

  it('timer color goes amber once expectedTimeSec elapses', () => {
    vi.useFakeTimers()
    render(
      <QuestionCard
        question={sampleQuestion}
        questionNumber={1}
        totalQuestions={1}
        selectedAnswer={null}
        onAnswer={() => {}}
        onSkip={() => {}}
        feedbackMode="immediate"
      />,
    )
    act(() => {
      vi.advanceTimersByTime(sampleQuestion.expected_time_sec * 1000)
    })
    const timer = screen.getByRole('timer')
    expect(timer.getAttribute('data-color-state')).toBe('amber')
  })
})
