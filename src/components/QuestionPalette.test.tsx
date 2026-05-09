import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuestionPalette, type PaletteStatus } from './QuestionPalette'

function statusList(values: PaletteStatus[]): PaletteStatus[] {
  return values
}

describe('QuestionPalette', () => {
  it('renders one numbered button per question', () => {
    render(
      <QuestionPalette
        total={5}
        currentIndex={0}
        statuses={statusList(['answered', 'skipped', 'unanswered', 'answered', 'unanswered'])}
        onNavigate={() => {}}
      />,
    )
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(String(i))).toBeDefined()
    }
  })

  it('reflects the per-question status via data-status', () => {
    render(
      <QuestionPalette
        total={3}
        currentIndex={0}
        statuses={statusList(['answered', 'skipped', 'unanswered'])}
        onNavigate={() => {}}
      />,
    )
    expect(
      (screen.getByText('1').closest('button') as HTMLButtonElement).getAttribute('data-status'),
    ).toBe('answered')
    expect(
      (screen.getByText('2').closest('button') as HTMLButtonElement).getAttribute('data-status'),
    ).toBe('skipped')
    expect(
      (screen.getByText('3').closest('button') as HTMLButtonElement).getAttribute('data-status'),
    ).toBe('unanswered')
  })

  it('marks the current question with aria-current="true"', () => {
    render(
      <QuestionPalette
        total={3}
        currentIndex={1}
        statuses={statusList(['answered', 'unanswered', 'unanswered'])}
        onNavigate={() => {}}
      />,
    )
    const current = screen.getByText('2').closest('button') as HTMLButtonElement
    const other = screen.getByText('1').closest('button') as HTMLButtonElement
    expect(current.getAttribute('aria-current')).toBe('true')
    expect(other.getAttribute('aria-current')).toBeNull()
  })

  it('clicking a numbered button calls onNavigate with that 0-based index', async () => {
    const onNavigate = vi.fn()
    render(
      <QuestionPalette
        total={3}
        currentIndex={0}
        statuses={statusList(['answered', 'unanswered', 'unanswered'])}
        onNavigate={onNavigate}
      />,
    )
    await userEvent.click(screen.getByText('3').closest('button') as HTMLButtonElement)
    expect(onNavigate).toHaveBeenCalledWith(2)
  })

  it('skipped buttons render an inline warning icon', () => {
    render(
      <QuestionPalette
        total={3}
        currentIndex={0}
        statuses={statusList(['answered', 'skipped', 'unanswered'])}
        onNavigate={() => {}}
      />,
    )
    const skippedBtn = screen.getByText('2').closest('button') as HTMLButtonElement
    const others = [
      screen.getByText('1').closest('button') as HTMLButtonElement,
      screen.getByText('3').closest('button') as HTMLButtonElement,
    ]
    expect(skippedBtn.querySelector('svg')).not.toBeNull()
    for (const o of others) {
      expect(o.querySelector('svg')).toBeNull()
    }
  })

  it('grid container is scrollable (max-height + overflow-auto)', () => {
    const statuses: PaletteStatus[] = Array.from({ length: 60 }, () => 'unanswered')
    render(
      <QuestionPalette
        total={60}
        currentIndex={0}
        statuses={statuses}
        onNavigate={() => {}}
      />,
    )
    const grid = screen.getByTestId('question-palette')
    expect(grid.className).toMatch(/max-h-/)
    expect(grid.className).toMatch(/overflow-auto/)
  })

  it('button accessible labels include the question number, status, and "current" when applicable', () => {
    render(
      <QuestionPalette
        total={3}
        currentIndex={0}
        statuses={statusList(['answered', 'skipped', 'unanswered'])}
        onNavigate={() => {}}
      />,
    )
    expect(
      (screen.getByText('1').closest('button') as HTMLButtonElement).getAttribute('aria-label'),
    ).toMatch(/Question 1, answered, current/)
    expect(
      (screen.getByText('2').closest('button') as HTMLButtonElement).getAttribute('aria-label'),
    ).toMatch(/Question 2, skipped/)
  })
})
