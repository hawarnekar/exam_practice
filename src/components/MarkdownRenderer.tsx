import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import 'katex/contrib/mhchem'

type MarkdownRendererProps = {
  text: string
  image?: string | null
  className?: string
}

function resolveImageUrl(image: string): string {
  if (/^(https?:)?\/\//.test(image) || image.startsWith('data:')) return image
  const base = import.meta.env.BASE_URL ?? '/'
  const trimmedBase = base.endsWith('/') ? base : `${base}/`
  const trimmedPath = image.startsWith('/') ? image.slice(1) : image
  return `${trimmedBase}${trimmedPath}`
}

export function MarkdownRenderer({ text, image, className }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {text}
        </ReactMarkdown>
      </div>
      {image && (
        <img
          src={resolveImageUrl(image)}
          alt=""
          className="mt-3 block max-h-[250px] w-full max-w-full object-contain"
          loading="lazy"
        />
      )}
    </div>
  )
}
