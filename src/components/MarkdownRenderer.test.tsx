import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownRenderer } from './MarkdownRenderer'

describe('MarkdownRenderer', () => {
  it('renders plain Markdown text', () => {
    render(<MarkdownRenderer text="Hello **bold** world" />)
    const strong = screen.getByText('bold')
    expect(strong.tagName).toBe('STRONG')
  })

  it('renders inline KaTeX from $...$ delimiters', () => {
    const { container } = render(<MarkdownRenderer text="Solve $x^2 + y^2 = z^2$." />)
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('renders block KaTeX from $$...$$ delimiters', () => {
    // remark-math 6 requires newlines inside $$...$$ for display math.
    const { container } = render(<MarkdownRenderer text={'Math:\n\n$$\n\\frac{a}{b}\n$$'} />)
    expect(container.querySelector('.katex-display')).not.toBeNull()
  })

  it('renders mhchem chemical equations via \\ce{...}', () => {
    const { container } = render(
      <MarkdownRenderer text={'$\\ce{H2SO4 + 2NaOH -> Na2SO4 + 2H2O}$'} />,
    )
    // mhchem renders as inline KaTeX; just confirm KaTeX output is present
    // (no exception thrown means \ce{} was understood by the macro).
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('does not render an <img> when no image prop is given', () => {
    const { container } = render(<MarkdownRenderer text="text only" />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders an <img> with object-contain and a max height when image is given', () => {
    const { container } = render(
      <MarkdownRenderer text="caption" image="data:image/png;base64,iVBORw0KGgo=" />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(img?.className).toMatch(/object-contain/)
    expect(img?.className).toMatch(/max-h-\[250px\]/)
  })

  it('passes absolute http URLs through unchanged', () => {
    const { container } = render(
      <MarkdownRenderer text="x" image="https://example.com/a.png" />,
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/a.png',
    )
  })

  it('prefixes relative image paths with BASE_URL', () => {
    const { container } = render(
      <MarkdownRenderer text="x" image="assets/images/foo.png" />,
    )
    const src = container.querySelector('img')?.getAttribute('src') ?? ''
    expect(src.endsWith('assets/images/foo.png')).toBe(true)
    // BASE_URL is "/" in test env — confirm the relative path was prefixed,
    // not left bare.
    expect(src.startsWith('/')).toBe(true)
  })

  it('applies the className prop to the wrapper element', () => {
    const { container } = render(
      <MarkdownRenderer text="x" className="custom-wrapper" />,
    )
    expect(container.firstElementChild?.className).toContain('custom-wrapper')
  })
})
