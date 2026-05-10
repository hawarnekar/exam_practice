import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import 'katex/contrib/mhchem'

type MarkdownRendererProps = {
  text: string
  image?: string | null
  imageAlt?: string
  className?: string
}

function resolveImageUrl(image: string): string {
  if (/^(https?:)?\/\//.test(image) || image.startsWith('data:')) return image
  const base = import.meta.env.BASE_URL ?? '/'
  const trimmedBase = base.endsWith('/') ? base : `${base}/`
  const trimmedPath = image.startsWith('/') ? image.slice(1) : image
  return `${trimmedBase}${trimmedPath}`
}

// rehype-katex defaults to throwOnError: true, which would crash the entire
// React subtree on a single malformed `$...$` expression. With these
// options, KaTeX instead renders the bad expression as a red span (class
// `katex-error`) so the surrounding question content stays usable.
const rehypeKatexOptions = { throwOnError: false, errorColor: '#cc0000' }

// Defense-in-depth boundary for anything else that might throw during
// markdown rendering (plugin bugs, malformed markdown, etc). On error we
// fall back to the raw text so the user can at least read the question.
type BoundaryProps = { children: ReactNode; fallback: ReactNode }
type BoundaryState = { hasError: boolean }
export class MarkdownErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('MarkdownRenderer caught a render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

export function MarkdownRenderer({
  text,
  image,
  imageAlt,
  className,
}: MarkdownRendererProps) {
  return (
    <div className={className}>
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <MarkdownErrorBoundary
          fallback={
            <pre className="whitespace-pre-wrap text-sm text-red-700 dark:text-red-300">
              {text}
            </pre>
          }
        >
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[[rehypeKatex, rehypeKatexOptions]]}
          >
            {text}
          </ReactMarkdown>
        </MarkdownErrorBoundary>
      </div>
      {image && (
        <img
          src={resolveImageUrl(image)}
          alt={imageAlt ?? 'Question image'}
          className="mt-3 block max-h-[250px] w-full max-w-full object-contain"
          loading="lazy"
        />
      )}
    </div>
  )
}
