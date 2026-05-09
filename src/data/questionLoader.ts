import type { Difficulty, Manifest, Question, TopicMeta } from '../types'

const SMALL_BANK_THRESHOLD = 20

function withBase(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/'
  const trimmedBase = base.endsWith('/') ? base : `${base}/`
  const trimmedPath = path.startsWith('/') ? path.slice(1) : path
  return `${trimmedBase}${trimmedPath}`
}

let manifestCache: Manifest | null = null
const topicFileCache = new Map<string, Question[]>()

export function _resetCacheForTests(): void {
  manifestCache = null
  topicFileCache.clear()
}

export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache
  const url = withBase('questions/manifest.json')
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load manifest (${res.status} ${res.statusText})`)
  }
  const data = (await res.json()) as Manifest
  if (!data || !Array.isArray(data.topics)) {
    throw new Error('Invalid manifest: expected { topics: TopicMeta[] }')
  }
  manifestCache = data
  return data
}

export async function loadTopic(filePath: string): Promise<Question[]> {
  const cached = topicFileCache.get(filePath)
  if (cached) return cached

  const url = withBase(filePath)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load topic "${filePath}" (${res.status} ${res.statusText})`)
  }
  const data = (await res.json()) as { questions?: Question[] }
  if (!data || !Array.isArray(data.questions)) {
    throw new Error(`Invalid topic file "${filePath}": expected { questions: Question[] }`)
  }
  topicFileCache.set(filePath, data.questions)
  return data.questions
}

function findTopicMeta(manifest: Manifest, topicId: string): TopicMeta | undefined {
  return manifest.topics.find((t) => t.topicId === topicId)
}

export async function getQuestions(
  topicId: string,
  difficulty?: Difficulty,
): Promise<Question[]> {
  const manifest = await loadManifest()
  const meta = findTopicMeta(manifest, topicId)
  if (!meta) {
    throw new Error(`Unknown topicId "${topicId}"`)
  }
  const questions = await loadTopic(meta.filePath)
  return difficulty ? questions.filter((q) => q.difficulty === difficulty) : questions
}

export function getBankWarnings(manifest: Manifest): string[] {
  return manifest.topics
    .filter((t) => t.questionCount < SMALL_BANK_THRESHOLD)
    .map(
      (t) =>
        `${t.topicId}: only ${t.questionCount} questions (recommended ≥ ${SMALL_BANK_THRESHOLD})`,
    )
}
