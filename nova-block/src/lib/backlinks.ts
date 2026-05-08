/**
 * v0.19 A2 · Smart Backlinks (lexical)
 *
 * 基于词频 cosine 相似度计算笔记间的语义关联。
 * 不依赖外部 embedding 服务，利用已有的 MiniSearch / 本地 tokenization。
 *
 * 算法：
 *  1. 对每篇笔记构建 token 袋（去 HTML、去停用词、小写化、截断到前 800 tokens）
 *  2. 计算 TF · IDF 向量
 *  3. cosine 相似度
 *
 * 对 500 篇左右的 vault 在 UI 线程内即可完成（<50ms）。
 */
import type { Note } from './types'
import { buildSearchableText } from './searchUtils'

export interface BacklinkSuggestion {
  noteId: number
  title: string
  score: number // 0..1
  snippet: string
}

// 极简停用词
const STOP = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','is','are','was','were',
  'be','been','being','that','this','it','as','at','by','from','has','have','had','not',
  '的','了','和','与','是','在','有','之','也','着','或','而','又','就','这','那','我','你','他',
  '她','它','们','一个','一种','可以','可能','这些','那些','通过','进行',
])

function tokenize(text: string): string[] {
  const lower = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .toLowerCase()
  // 英文词 + 中文单字
  const out: string[] = []
  const englishRe = /[a-z0-9][a-z0-9_-]{1,20}/g
  let m: RegExpExecArray | null
  while ((m = englishRe.exec(lower))) {
    if (!STOP.has(m[0]) && m[0].length >= 2) out.push(m[0])
  }
  for (const ch of lower) {
    const code = ch.charCodeAt(0)
    if (code >= 0x4e00 && code <= 0x9fff) {
      if (!STOP.has(ch)) out.push(ch)
    }
  }
  return out.slice(0, 1200)
}

function toTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  return tf
}

interface IndexedNote {
  id: number
  title: string
  raw: string
  tf: Map<string, number>
}

interface CorpusIndex {
  notes: IndexedNote[]
  df: Map<string, number> // document frequency
  N: number
}

export function buildCorpus(notes: Note[]): CorpusIndex {
  const indexed: IndexedNote[] = []
  const df = new Map<string, number>()

  for (const note of notes) {
    if (note.is_folder) continue
    const raw = buildSearchableText(note)
    const tokens = tokenize(`${note.title ?? ''} ${raw}`)
    if (tokens.length === 0) continue
    const tf = toTF(tokens)
    indexed.push({ id: note.id, title: note.title ?? '', raw, tf })
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1)
  }
  return { notes: indexed, df, N: indexed.length }
}

function cosine(a: IndexedNote, b: IndexedNote, corpus: CorpusIndex): number {
  let dot = 0, ma = 0, mb = 0
  const N = corpus.N
  // iterate smaller bag
  const [small, big] = a.tf.size < b.tf.size ? [a, b] : [b, a]
  for (const [term, aCount] of small.tf) {
    const dfT = corpus.df.get(term) ?? 1
    const idf = Math.log((N + 1) / (dfT + 1)) + 1
    const aw = aCount * idf
    const bw = (big.tf.get(term) ?? 0) * idf
    dot += aw * bw
    ma += aw * aw
  }
  // magnitude of B
  for (const [term, bCount] of big.tf) {
    const dfT = corpus.df.get(term) ?? 1
    const idf = Math.log((N + 1) / (dfT + 1)) + 1
    const bw = bCount * idf
    mb += bw * bw
  }
  // complete magnitude of A
  for (const [term, aCount] of a.tf) {
    if (small === a) break // already summed
    const dfT = corpus.df.get(term) ?? 1
    const idf = Math.log((N + 1) / (dfT + 1)) + 1
    const aw = aCount * idf
    ma += aw * aw
  }
  if (ma === 0 || mb === 0) return 0
  return dot / (Math.sqrt(ma) * Math.sqrt(mb))
}

export function findBacklinks(
  noteId: number,
  corpus: CorpusIndex,
  topK = 5,
): BacklinkSuggestion[] {
  const source = corpus.notes.find((n) => n.id === noteId)
  if (!source) return []

  const scored: BacklinkSuggestion[] = []
  for (const other of corpus.notes) {
    if (other.id === noteId) continue
    const score = cosine(source, other, corpus)
    if (score > 0.08) {
      scored.push({
        noteId: other.id,
        title: other.title || '未命名',
        score,
        snippet: other.raw.slice(0, 160),
      })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}
