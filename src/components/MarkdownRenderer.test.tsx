import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownErrorBoundary, MarkdownRenderer } from './MarkdownRenderer'

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

  describe('error tolerance', () => {
    it('does not throw when KaTeX encounters a malformed expression', () => {
      // `\frac{1}` is a real parse error — `\frac` requires two arguments.
      // With the default throwOnError=true this would crash the React subtree.
      expect(() =>
        render(<MarkdownRenderer text="bad math: $\frac{1}$" />),
      ).not.toThrow()
    })

    it('renders KaTeX parse errors inline with the .katex-error class instead of crashing', () => {
      const { container } = render(<MarkdownRenderer text="bad: $\frac{1}$" />)
      const errSpan = container.querySelector('.katex-error')
      expect(errSpan).not.toBeNull()
      // The configured errorColor is applied as an inline style.
      expect((errSpan as HTMLElement).style.color).toBe('rgb(204, 0, 0)')
      // Surrounding text remains visible.
      expect(container.textContent).toMatch(/bad:/)
    })

    it('still renders valid math correctly even when the document has neighbouring bad math', () => {
      const { container } = render(
        <MarkdownRenderer text={'good: $x^2$\n\nbad: $\\frac{1}$'} />,
      )
      // Valid math gets the standard .katex class.
      expect(container.querySelector('.katex')).not.toBeNull()
      // Bad math gets .katex-error.
      expect(container.querySelector('.katex-error')).not.toBeNull()
    })
  })

  describe('MarkdownErrorBoundary', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('renders children when no error is thrown', () => {
      render(
        <MarkdownErrorBoundary fallback={<div>fallback shown</div>}>
          <span>normal child</span>
        </MarkdownErrorBoundary>,
      )
      expect(screen.getByText('normal child')).toBeDefined()
      expect(screen.queryByText('fallback shown')).toBeNull()
    })

    it('catches a child render error and renders the fallback', () => {
      // React still logs the caught error to console.error in dev builds;
      // silence it so the test output stays clean.
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      function Boom(): React.ReactElement {
        throw new Error('boom from child')
      }

      render(
        <MarkdownErrorBoundary fallback={<div>fallback shown</div>}>
          <Boom />
        </MarkdownErrorBoundary>,
      )
      expect(screen.getByText('fallback shown')).toBeDefined()
    })
  })
})
