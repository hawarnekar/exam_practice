import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedbackPanel } from './FeedbackPanel'
import type { Question } from '../types'

const sampleQuestion: Question = {
  id: 'q1',
  text: 'What is $2 + 2$?',
  image: null,
  options: [
    { text: 'three', image: null },
    { text: 'four', image: null },
    { text: 'five', image: null },
    { text: 'twenty-two', image: null },
  ],
  correct: 1,
  difficulty: 'easy',
  expected_time_sec: 30,
  score: 1,
  explanation: 'Adding $2 + 2$ gives $4$.',
}

function getOption(index: number): HTMLElement {
  const li = document.querySelector(`[data-option-index="${index}"]`)
  if (!li) throw new Error(`option ${index} not rendered`)
  return li as HTMLElement
}

describe('FeedbackPanel', () => {
  describe('correct answer', () => {
    it('shows the Correct! banner with status="correct"', () => {
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex={1}
          isLast={false}
          onNext={() => {}}
        />,
      )
      const region = screen.getByRole('region', { name: /Answer feedback/i })
      expect(region.getAttribute('data-status')).toBe('correct')
      expect(region.textContent).toMatch(/Correct!/)
    })

    it('highlights only the correct option as "correct"', () => {
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex={1}
          isLast={false}
          onNext={() => {}}
        />,
      )
      expect(getOption(0).getAttribute('data-state')).toBe('neutral')
      expect(getOption(1).getAttribute('data-state')).toBe('correct')
      expect(getOption(2).getAttribute('data-state')).toBe('neutral')
      expect(getOption(3).getAttribute('data-state')).toBe('neutral')
    })

    it('does not render a "Your answer" tag when the answer is correct', () => {
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex={1}
          isLast={false}
          onNext={() => {}}
        />,
      )
      expect(screen.queryByText(/Your answer/i)).toBeNull()
      expect(screen.getByText(/Correct answer/i)).toBeDefined()
    })
  })

  describe('incorrect answer', () => {
    it('shows the Incorrect banner with status="incorrect"', () => {
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex={2}
          isLast={false}
          onNext={() => {}}
        />,
      )
      const region = screen.getByRole('region', { name: /Answer feedback/i })
      expect(region.getAttribute('data-status')).toBe('incorrect')
      expect(region.textContent).toMatch(/^.*Incorrect.*/)
    })

    it('highlights the correct option green and the chosen wrong option red', () => {
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex={2}
          isLast={false}
          onNext={() => {}}
        />,
      )
      expect(getOption(0).getAttribute('data-state')).toBe('neutral')
      expect(getOption(1).getAttribute('data-state')).toBe('correct')
      expect(getOption(2).getAttribute('data-state')).toBe('selected-wrong')
      expect(getOption(3).getAttribute('data-state')).toBe('neutral')
    })

    it('renders both "Correct answer" and "Your answer" tags on the right options', () => {
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex={2}
          isLast={false}
          onNext={() => {}}
        />,
      )
      expect(screen.getByText(/Correct answer/i)).toBeDefined()
      expect(screen.getByText(/Your answer/i)).toBeDefined()
    })
  })

  describe('skipped', () => {
    it('shows the skipped banner with status="skipped"', () => {
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex="skipped"
          isLast={false}
          onNext={() => {}}
        />,
      )
      const region = screen.getByRole('region', { name: /Answer feedback/i })
      expect(region.getAttribute('data-status')).toBe('skipped')
      expect(region.textContent).toMatch(/You skipped this question/)
    })

    it('still highlights the correct option (so the user can learn)', () => {
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex="skipped"
          isLast={false}
          onNext={() => {}}
        />,
      )
      expect(getOption(1).getAttribute('data-state')).toBe('correct')
    })

    it('does not mark any option as "selected-wrong" when skipped', () => {
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex="skipped"
          isLast={false}
          onNext={() => {}}
        />,
      )
      const states = [0, 1, 2, 3].map((i) => getOption(i).getAttribute('data-state'))
      expect(states.includes('selected-wrong')).toBe(false)
    })

    it('does not render a "Your answer" tag when skipped', () => {
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex="skipped"
          isLast={false}
          onNext={() => {}}
        />,
      )
      expect(screen.queryByText(/Your answer/i)).toBeNull()
    })
  })

  describe('explanation and next-button', () => {
    it('renders the explanation through MarkdownRenderer (KaTeX inside)', () => {
      const { container } = render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex={1}
          isLast={false}
          onNext={() => {}}
        />,
      )
      expect(container.textContent).toMatch(/Adding/)
      // Question + explanation use $...$, so KaTeX should be rendered.
      expect(container.querySelector('.katex')).not.toBeNull()
    })

    it('shows "Next question" when isLast is false', () => {
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex={1}
          isLast={false}
          onNext={() => {}}
        />,
      )
      expect(screen.getByRole('button', { name: /Next question/i })).toBeDefined()
      expect(screen.queryByRole('button', { name: /^Finish set$/i })).toBeNull()
    })

    it('shows "Finish set" when isLast is true', () => {
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex={1}
          isLast={true}
          onNext={() => {}}
        />,
      )
      expect(screen.getByRole('button', { name: /Finish set/i })).toBeDefined()
      expect(screen.queryByRole('button', { name: /Next question/i })).toBeNull()
    })

    it('clicking the Next/Finish button calls onNext exactly once', async () => {
      const onNext = vi.fn()
      render(
        <FeedbackPanel
          question={sampleQuestion}
          selectedIndex={1}
          isLast={false}
          onNext={onNext}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: /Next question/i }))
      expect(onNext).toHaveBeenCalledTimes(1)
    })
  })
})
