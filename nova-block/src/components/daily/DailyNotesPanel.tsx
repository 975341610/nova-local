import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import type { Note } from '../../lib/types'
import {
  formatDailyTitle,
  buildDailyNoteContent,
} from '../../lib/dailyNotes'

interface DailyNotesPanelProps {
  notes: Note[]
  isOpen: boolean
  onClose: () => void
  onOpenNote: (noteId: number) => void
  onCreateDailyNote: (title: string, content: string) => Promise<Note | null>
}

/**
 * Daily Notes 面板
 * - 左侧日历热力图（显示哪些日期有笔记）
 * - 点击日期 → 跳转/新建对应 Daily Note
 * - 右侧显示当月已有 Daily Notes 列表
 *
 * Daily Note 识别规则：标题匹配 YYYY-MM-DD 或 YYYY/MM/DD。
 */
export function DailyNotesPanel({
  notes,
  isOpen,
  onClose,
  onOpenNote,
  onCreateDailyNote,
}: DailyNotesPanelProps) {
  const today = new Date()
  const [cursor, setCursor] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1))

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const dailyMap = useMemo(() => {
    const map = new Map<string, Note>()
    for (const note of notes) {
      if (note.is_folder) continue
      const match = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(note.title ?? '')
      if (match) {
        const key = `${match[1]}-${match[2]}-${match[3]}`
        map.set(key, note)
      }
    }
    return map
  }, [notes])

  const monthDays = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDay = new Date(year, month, 1)
    const startWeekday = firstDay.getDay() // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: Array<{ date: Date | null; key: string }> = []
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ date: null, key: `empty-${i}` })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      cells.push({ date, key: formatDailyTitle(date) })
    }
    // pad to multiples of 7
    while (cells.length % 7 !== 0) {
      cells.push({ date: null, key: `end-${cells.length}` })
    }
    return cells
  }, [cursor])

  const handleDayClick = async (date: Date) => {
    const key = formatDailyTitle(date)
    const existing = dailyMap.get(key)
    if (existing) {
      onOpenNote(existing.id)
      onClose()
      return
    }
    const created = await onCreateDailyNote(key, buildDailyNoteContent(date))
    if (created) {
      onOpenNote(created.id)
      onClose()
    }
  }

  const monthLabel = cursor.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
  })

  const monthlyNotes = useMemo(() => {
    const y = cursor.getFullYear()
    const m = cursor.getMonth() + 1
    const prefix = `${y}-${String(m).padStart(2, '0')}`
    return Array.from(dailyMap.entries())
      .filter(([k]) => k.startsWith(prefix))
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([, note]) => note)
  }, [cursor, dailyMap])

  const todayKey = formatDailyTitle(today)

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="daily-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[92] flex items-center justify-center"
          style={{
            background: 'color-mix(in srgb, var(--nv-color-bg) 76%, transparent)',
          }}
          onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="nv-glass"
            style={{
              width: 720,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'calc(100vh - 80px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 18px',
                borderBottom: '1px solid var(--nv-color-border)',
              }}
            >
              <CalendarIcon size={16} style={{ color: 'var(--nv-color-accent)' }} />
              <div style={{ fontWeight: 600, fontSize: 14 }}>Daily Notes</div>
              <div style={{ flex: 1 }} />
              <button
                className="nv-icon-btn"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              >
                <ChevronLeft size={14} />
              </button>
              <div
                style={{
                  fontSize: 13,
                  minWidth: 96,
                  textAlign: 'center',
                  color: 'var(--nv-color-fg)',
                }}
              >
                {monthLabel}
              </div>
              <button
                className="nv-icon-btn"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              >
                <ChevronRight size={14} />
              </button>
              <button
                className="nv-icon-btn"
                onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
                title="回到本月"
              >
                今
              </button>
              <button className="nv-icon-btn" onClick={onClose}>
                <X size={14} />
              </button>
            </header>

            <div style={{ display: 'flex', minHeight: 340 }}>
              {/* Calendar */}
              <div style={{ padding: 18, flex: 1 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: 6,
                    fontSize: 11,
                    color: 'var(--nv-color-fg-subtle)',
                    marginBottom: 6,
                  }}
                >
                  {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
                    <div key={d} style={{ textAlign: 'center', padding: '4px 0' }}>
                      {d}
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: 6,
                  }}
                >
                  {monthDays.map((cell) => {
                    if (!cell.date) {
                      return <div key={cell.key} />
                    }
                    const key = formatDailyTitle(cell.date)
                    const has = dailyMap.has(key)
                    const isToday = key === todayKey
                    return (
                      <button
                        key={cell.key}
                        onClick={() => cell.date && handleDayClick(cell.date)}
                        className="nv-transition nv-focus-ring"
                        style={{
                          aspectRatio: '1 / 1',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: isToday
                            ? `1.5px solid var(--nv-color-accent)`
                            : `1px solid var(--nv-color-border)`,
                          borderRadius: 'var(--nv-radius-md)',
                          background: has
                            ? 'var(--nv-color-accent-muted)'
                            : 'transparent',
                          color: has
                            ? 'var(--nv-color-accent-fg)'
                            : 'var(--nv-color-fg)',
                          fontSize: 13,
                          fontWeight: isToday ? 700 : 400,
                          cursor: 'pointer',
                        }}
                      >
                        <span>{cell.date.getDate()}</span>
                        {has && (
                          <span
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: '50%',
                              background: 'var(--nv-color-accent)',
                              marginTop: 2,
                            }}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Side list */}
              <div
                style={{
                  width: 220,
                  borderLeft: '1px solid var(--nv-color-border)',
                  padding: 14,
                  overflowY: 'auto',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--nv-color-fg-subtle)',
                    marginBottom: 8,
                  }}
                >
                  本月已有 · {monthlyNotes.length}
                </div>
                {monthlyNotes.length === 0 ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--nv-color-fg-subtle)',
                      lineHeight: 1.6,
                    }}
                  >
                    点击任意日期创建当天的 Daily Note。
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {monthlyNotes.map((n) => (
                      <li key={n.id} style={{ marginBottom: 4 }}>
                        <button
                          onClick={() => {
                            onOpenNote(n.id)
                            onClose()
                          }}
                          className="nv-transition"
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '6px 8px',
                            border: 'none',
                            background: 'transparent',
                            borderRadius: 'var(--nv-radius-sm)',
                            fontSize: 13,
                            color: 'var(--nv-color-fg)',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--nv-color-accent-muted)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                          }}
                        >
                          {n.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default DailyNotesPanel
