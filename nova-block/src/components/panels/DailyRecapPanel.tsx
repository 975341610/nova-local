/**
 * v0.19 A4 · Daily Recap
 *
 * 最近 7 / 30 天 Daily Notes 的可视化摘要：
 *  - 时间线（日期 + 字数 + 抽取的 bullets）
 *  - 字数曲线 / 连续天数
 *
 * Daily Note 识别规则：标题 YYYY-MM-DD / YYYY/MM/DD。
 */
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Activity, Calendar, Flame } from 'lucide-react'
import type { Note } from '../../lib/types'

interface Props {
  notes: Note[]
  isOpen: boolean
  onClose: () => void
  onOpenNote: (id: number) => void
}

interface DayEntry {
  key: string
  date: Date
  note?: Note
  words: number
  highlights: string[]
}

function parseDailyKey(title: string | null | undefined): string | null {
  if (!title) return null
  const m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(title)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function extractHighlights(content: string | undefined): string[] {
  if (!content) return []
  const plain = content
    .replace(/<li[^>]*>/g, '\n- ')
    .replace(/<h[1-3][^>]*>/g, '\n# ')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+\n/g, '\n')
  const lines = plain.split('\n').map(x => x.trim()).filter(Boolean)
  const picks: string[] = []
  for (const l of lines) {
    if (l.startsWith('- ') || l.startsWith('# ')) {
      const clean = l.replace(/^[-#]\s*/, '').trim()
      if (clean && clean.length >= 2 && clean.length <= 80) picks.push(clean)
    }
    if (picks.length >= 4) break
  }
  return picks
}

export function DailyRecapPanel({ notes, isOpen, onClose, onOpenNote }: Props) {
  const [range, setRange] = useState<7 | 30>(7)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const entries = useMemo<DayEntry[]>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dailyMap = new Map<string, Note>()
    for (const n of notes) {
      if (n.is_folder) continue
      const key = parseDailyKey(n.title)
      if (key) dailyMap.set(key, n)
    }
    const out: DayEntry[] = []
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const n = dailyMap.get(key)
      const words = n?.content ? n.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length : 0
      out.push({
        key, date: d, note: n, words,
        highlights: n ? extractHighlights(n.content) : [],
      })
    }
    return out
  }, [notes, range])

  const totalWords = useMemo(() => entries.reduce((acc, e) => acc + e.words, 0), [entries])
  const filledDays = entries.filter(e => e.note).length
  const streak = useMemo(() => {
    let s = 0
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].note) s++
      else break
    }
    return s
  }, [entries])

  const maxWords = Math.max(1, ...entries.map(e => e.words))

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
                <Activity size={16} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>日记回顾</div>
                  <div style={{ fontSize: 11, color: 'var(--nv-color-fg-subtle)' }}>
                    最近 {range} 天 · {filledDays} 天有记录 · {totalWords} 字
                    <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <Flame size={10} /> {streak} 天连续
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="nv-panel-close"><X size={14} /></button>
            </header>
            <div className="nv-panel-toolbar">
              <div className="nv-panel-segmented">
                <Calendar size={11} style={{ opacity: 0.5 }} />
                {([7, 30] as const).map((n) => (
                  <button key={n} data-active={range === n} onClick={() => setRange(n)}>
                    近 {n} 天
                  </button>
                ))}
              </div>
            </div>
            <div className="nv-panel-body">
              <div className="nv-recap-sparkline">
                {entries.map((e, i) => (
                  <div
                    key={i}
                    className="nv-recap-bar"
                    data-empty={e.words === 0}
                    style={{ height: `${Math.max(4, (e.words / maxWords) * 56)}px` }}
                    title={`${e.key} · ${e.words} 字`}
                  />
                ))}
              </div>
              <ul className="nv-recap-list">
                {entries.filter(e => e.note).reverse().map((e) => (
                  <li key={e.key}>
                    <button
                      className="nv-recap-card"
                      onClick={() => { if (e.note) { onOpenNote(e.note.id); onClose() } }}
                    >
                      <div className="nv-recap-date">{e.key}</div>
                      <div className="nv-recap-meta">{e.words} 字</div>
                      {e.highlights.length > 0 && (
                        <ul className="nv-recap-highlights">
                          {e.highlights.map((h, i) => (<li key={i}>{h}</li>))}
                        </ul>
                      )}
                    </button>
                  </li>
                ))}
                {filledDays === 0 && <div className="nv-panel-empty">选定范围内还没有日记</div>}
              </ul>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default DailyRecapPanel
