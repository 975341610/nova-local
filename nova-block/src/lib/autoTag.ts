/**
 * v0.19 A3 · Auto-tag & Auto-title
 *
 * 不依赖云端 AI。使用本地启发式：
 *   - tag：TF-IDF 选取出现频次最高且 IDF 较高的 3~5 个关键词
 *   - title：取正文首段前 20 字（去 HTML） + 清洗
 */
import type { Note } from './types'
import { buildSearchableText } from './searchUtils'

const STOP = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','is','are','was','were',
  'be','been','being','that','this','it','as','at','by','from','has','have','had','not',
  '的','了','和','与','是','在','有','之','也','着','或','而','又','就','这','那','我','你',
])

function tokens(text: string): string[] {
  const lower = text.replace(/<[^>]+>/g, ' ').toLowerCase()
  const out: string[] = []
  const re = /[a-z][a-z0-9_-]{2,20}/g
  let m
  while ((m = re.exec(lower))) {
    if (!STOP.has(m[0])) out.push(m[0])
  }
  // 中文 2-gram
  const cleanZh = text.replace(/<[^>]+>/g, ' ').replace(/[^\u4e00-\u9fa5]+/g, ' ')
  for (const seg of cleanZh.split(/\s+/)) {
    for (let i = 0; i + 2 <= seg.length; i++) {
      const bg = seg.slice(i, i + 2)
      if (bg.length === 2) out.push(bg)
    }
  }
  return out
}

export function suggestTags(notes: Note[], target: Note, k = 5): string[] {
  const targetTokens = tokens(`${target.title ?? ''} ${buildSearchableText(target)}`)
  if (targetTokens.length === 0) return []
  const tf = new Map<string, number>()
  for (const t of targetTokens) tf.set(t, (tf.get(t) ?? 0) + 1)

  const df = new Map<string, number>()
  for (const n of notes) {
    if (n.is_folder || n.id === target.id) continue
    const seen = new Set(tokens(`${n.title ?? ''} ${buildSearchableText(n)}`))
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const N = Math.max(1, notes.filter(n => !n.is_folder).length)

  const scored: Array<{ term: string; score: number }> = []
  for (const [term, freq] of tf) {
    if (freq < 2 && term.length < 4) continue
    const idf = Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1
    scored.push({ term, score: freq * idf })
  }
  scored.sort((a, b) => b.score - a.score)
  const existing = new Set((target.tags ?? []).map((t) => t.toLowerCase()))
  const result: string[] = []
  for (const s of scored) {
    if (result.length >= k) break
    if (existing.has(s.term.toLowerCase())) continue
    result.push(s.term)
  }
  return result
}

export function suggestTitle(target: Note): string {
  const text = (target.content ?? '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
  if (!text) return target.title || '未命名'
  const firstLine = text.split('\n')[0].trim()
  if (!firstLine) return target.title || '未命名'
  // 压缩到 20 字
  return firstLine.length > 22 ? firstLine.slice(0, 20) + '…' : firstLine
}
