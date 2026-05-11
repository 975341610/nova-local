/**
 * v0.19 A1 · Ask My Notes (local retrieval)
 *
 * 不依赖云端 LLM：
 *  1) 将用户查询与 vault 做 TF-IDF cosine 相似度匹配
 *  2) 返回 Top-K 片段（snippet），给用户"结构化答案"的感觉
 *  3) 未来可接入本地模型做 summarization；当前版本直接展示 citations
 */
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, MessageSquare, ExternalLink } from 'lucide-react'
import type { Note } from '../../lib/types'
import { buildSearchableText } from '../../lib/searchUtils'

interface Props {
  notes: Note[]
  isOpen: boolean
  onClose: () => void
  onOpenNote: (id: number) => void
}

const STOP = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','is','are','was','were',
  'be','been','being','that','this','it','as','at','by','from','has','have','had','not',
  '的','了','和','与','是','在','有','之','也','着','或','而','又','就','这','那','我','你','吗','呢','什么','怎么','怎样',
])

function tokenize(text: string): string[] {
  const t = text.replace(/<[^>]+>/g, ' ').toLowerCase()
  const out: string[] = []
  const re = /[a-z0-9][a-z0-9_-]{1,20}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) if (!STOP.has(m[0])) out.push(m[0])
  // 中文 2-gram
  const zh = text.replace(/<[^>]+>/g, ' ').replace(/[^\u4e00-\u9fa5]+/g, ' ')
  for (const seg of zh.split(/\s+/)) {
    for (let i = 0; i + 2 <= seg.length; i++) {
      const bg = seg.slice(i, i + 2)
      if (bg.length === 2 && !STOP.has(bg)) out.push(bg)
    }
  }
  return out
}

export function AskMyNotesPanel({ notes, isOpen, onClose, onOpenNote }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: number; title: string; score: number; snippet: string }[]>([])
  const [answer, setAnswer] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const corpus = useMemo(() => {
    const indexed = notes
      .filter(n => !n.is_folder)
      .map((n) => {
        const raw = `${n.title ?? ''} ${buildSearchableText(n)}`
        const tokens = tokenize(raw)
        const tf = new Map<string, number>()
        for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
        return { id: n.id, title: n.title ?? '', raw: n.content ?? '', tf }
      })
    const df = new Map<string, number>()
    for (const doc of indexed) for (const k of doc.tf.keys()) df.set(k, (df.get(k) ?? 0) + 1)
    return { indexed, df, N: Math.max(1, indexed.length) }
  }, [notes])

  const runQuery = (q: string) => {
    const toks = tokenize(q)
    if (toks.length === 0) { setResults([]); setAnswer(''); return }
    const qtf = new Map<string, number>()
    for (const t of toks) qtf.set(t, (qtf.get(t) ?? 0) + 1)

    const scored: typeof results = []
    for (const doc of corpus.indexed) {
      let score = 0, qn = 0, dn = 0
      for (const [term, qc] of qtf) {
        const idf = Math.log((corpus.N + 1) / ((corpus.df.get(term) ?? 0) + 1)) + 1
        const qw = qc * idf
        const dw = (doc.tf.get(term) ?? 0) * idf
        score += qw * dw
        qn += qw * qw
      }
      for (const [term, dc] of doc.tf) {
        const idf = Math.log((corpus.N + 1) / ((corpus.df.get(term) ?? 0) + 1)) + 1
        const dw = dc * idf
        dn += dw * dw
      }
      if (qn === 0 || dn === 0) continue
      const cos = score / (Math.sqrt(qn) * Math.sqrt(dn))
      if (cos > 0.05) {
        // 在正文中找最靠近查询词的一段 160 字
        const plain = doc.raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
        let snippet = plain.slice(0, 160)
        const probe = toks.find(tk => plain.toLowerCase().includes(tk))
        if (probe) {
          const idx = plain.toLowerCase().indexOf(probe)
          snippet = plain.slice(Math.max(0, idx - 40), idx + 120)
        }
        scored.push({ id: doc.id, title: doc.title || '未命名', score: cos, snippet })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, 6)
    setResults(top)

    // 组装一句概括性"答案"：直接引用 top-1 的片段
    if (top.length > 0) {
      const hints = top.slice(0, 3).map(r => r.title).join('、')
      setAnswer(`在 ${top.length} 篇笔记中找到相关内容：主要来自《${hints}》。`)
    } else {
      setAnswer('暂无命中。换一个关键词试试？')
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="nv-panel-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="nv-panel-shell"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="nv-panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MessageSquare size={16} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Ask My Notes</div>
                  <div style={{ fontSize: 11, color: 'var(--nv-color-fg-subtle)' }}>本地 TF-IDF · 搜索即为引用</div>
                </div>
              </div>
              <button onClick={onClose} className="nv-panel-close"><X size={14} /></button>
            </header>
            <div className="nv-panel-toolbar">
              <div className="nv-panel-search" style={{ flex: 1 }}>
                <Search size={12} />
                <input
                  autoFocus
                  placeholder="问一个问题，比如 项目 A 的风险有哪些？"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runQuery(query) }}
                />
              </div>
              <button
                className="nv-panel-pill"
                onClick={() => runQuery(query)}
                disabled={!query.trim()}
              >检索</button>
            </div>
            <div className="nv-panel-body">
              {answer && <div className="nv-ask-answer">{answer}</div>}
              {results.length === 0 ? (
                <div className="nv-panel-empty">试试输入：<code>最近读了什么书</code> / <code>2026 年规划</code></div>
              ) : (
                <ul className="nv-ask-list">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button className="nv-ask-card" onClick={() => { onOpenNote(r.id); onClose() }}>
                        <div className="nv-ask-title">
                          <span>{r.title}</span>
                          <span className="nv-ask-score">{(r.score * 100).toFixed(1)}%</span>
                          <ExternalLink size={11} style={{ opacity: 0.5 }} />
                        </div>
                        <p>{r.snippet}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default AskMyNotesPanel
