import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Note } from '../../lib/types'
import { buildDailyNoteHtml, formatDailyTitle } from '../../lib/dailyNotes'
import { findDailyNoteByDate, findDailyNotesByDate, getDailyDate } from '../../lib/journal'

interface DailyNotesPanelProps {
  notes: Note[]
  isOpen: boolean
  onClose: () => void
  onOpenNote: (noteId: number) => void
  onCreateDailyNote: (title: string, content: string) => Promise<Note | null>
}

const weekLabels = ['日', '一', '二', '三', '四', '五', '六']

const timestampToDateKey = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return formatDailyTitle(date)
}

export function DailyNotesPanel({
  notes,
  isOpen,
  onClose,
  onOpenNote,
  onCreateDailyNote,
}: DailyNotesPanelProps) {
  const today = new Date()
  const [cursor, setCursor] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<Date>(today)

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
    for (const note of notes.filter((item) => !item.is_folder)) {
      const key = getDailyDate(note)
      if (!key) continue
      const current = map.get(key)
      map.set(key, current ? findDailyNoteByDate([current, note], key) || current : note)
    }
    return map
  }, [notes])

  const duplicateDailyCounts = useMemo(() => {
    const map = new Map<string, number>()
    const dateKeys = new Set(notes.map((note) => getDailyDate(note)).filter(Boolean) as string[])
    for (const dateKey of dateKeys) {
      const count = findDailyNotesByDate(notes, dateKey).length
      if (count > 1) map.set(dateKey, count)
    }
    return map
  }, [notes])

  const monthDays = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDay = new Date(year, month, 1)
    const startWeekday = firstDay.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: Array<{ date: Date | null; key: string }> = []
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ date: null, key: `empty-${i}` })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      cells.push({ date, key: formatDailyTitle(date) })
    }
    while (cells.length % 7 !== 0) {
      cells.push({ date: null, key: `end-${cells.length}` })
    }
    return cells
  }, [cursor])

  const handleDayOpen = async (date: Date) => {
    const key = formatDailyTitle(date)
    const existing = dailyMap.get(key)
    if (existing) {
      onOpenNote(existing.id)
      onClose()
      return
    }
    const created = await onCreateDailyNote(key, buildDailyNoteHtml(date))
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
    const year = cursor.getFullYear()
    const month = cursor.getMonth() + 1
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    return Array.from(dailyMap.entries())
      .filter(([key]) => key.startsWith(prefix))
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([, note]) => note)
  }, [cursor, dailyMap])

  const todayKey = formatDailyTitle(today)
  const selectedDateKey = formatDailyTitle(selectedDate)
  const selectedDailyNote = dailyMap.get(selectedDateKey)
  const selectedDuplicateCount = duplicateDailyCounts.get(selectedDateKey) || 0
  const selectedCreatedNotes = useMemo(
    () =>
      notes
        .filter((note) => !note.is_folder && !getDailyDate(note))
        .filter((note) => timestampToDateKey(note.created_at) === selectedDateKey)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [notes, selectedDateKey],
  )
  const selectedUpdatedNotes = useMemo(
    () =>
      notes
        .filter((note) => !note.is_folder && !getDailyDate(note))
        .filter((note) => timestampToDateKey(note.updated_at) === selectedDateKey)
        .filter((note) => timestampToDateKey(note.created_at) !== selectedDateKey)
        .sort((a, b) => ((a.updated_at || '') < (b.updated_at || '') ? 1 : -1)),
    [notes, selectedDateKey],
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="daily-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[92] flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, var(--nv-color-bg) 76%, transparent)' }}
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
              width: 760,
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
              <div style={{ fontWeight: 600, fontSize: 14 }}>日历与日记</div>
              <div style={{ flex: 1 }} />
              <button
                className="nv-icon-btn"
                title="上个月"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              >
                <ChevronLeft size={14} />
              </button>
              <div style={{ fontSize: 13, minWidth: 96, textAlign: 'center', color: 'var(--nv-color-fg)' }}>
                {monthLabel}
              </div>
              <button
                className="nv-icon-btn"
                title="下个月"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              >
                <ChevronRight size={14} />
              </button>
              <button
                className="nv-icon-btn"
                title="回到本月"
                onClick={() => {
                  setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
                  setSelectedDate(today)
                }}
              >
                今
              </button>
              <button className="nv-icon-btn" title="关闭" onClick={onClose}>
                <X size={14} />
              </button>
            </header>

            <div style={{ display: 'flex', minHeight: 360 }}>
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
                  {weekLabels.map((label) => (
                    <div key={label} style={{ textAlign: 'center', padding: '4px 0' }}>
                      {label}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                  {monthDays.map((cell) => {
                    if (!cell.date) return <div key={cell.key} />
                    const key = formatDailyTitle(cell.date)
                    const has = dailyMap.has(key)
                    const duplicateCount = duplicateDailyCounts.get(key) || 0
                    const isToday = key === todayKey
                    const isSelected = key === selectedDateKey
                    return (
                      <button
                        key={cell.key}
                        aria-label={`Select ${key}`}
                        onClick={() => cell.date && setSelectedDate(cell.date)}
                        onDoubleClick={() => cell.date && handleDayOpen(cell.date)}
                        className="nv-transition nv-focus-ring"
                        style={{
                          aspectRatio: '1 / 1',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: isSelected
                            ? '2px solid var(--nv-color-gold, #c8a873)'
                            : isToday
                              ? '1.5px solid var(--nv-color-accent)'
                              : '1px solid var(--nv-color-border)',
                          borderRadius: 'var(--nv-radius-md)',
                          background: has ? 'var(--nv-color-accent-muted)' : 'transparent',
                          color: has ? 'var(--nv-color-accent-fg)' : 'var(--nv-color-fg)',
                          fontSize: 13,
                          fontWeight: isToday ? 700 : 400,
                          cursor: 'pointer',
                        }}
                      >
                        <span>{cell.date.getDate()}</span>
                        {has && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                            <span
                              style={{
                                width: 4,
                                height: 4,
                                borderRadius: '50%',
                                background: 'var(--nv-color-accent)',
                              }}
                            />
                            {duplicateCount > 1 && (
                              <span
                                title={`该日期存在 ${duplicateCount} 篇日记`}
                                style={{
                                  minWidth: 12,
                                  height: 12,
                                  borderRadius: 999,
                                  background: 'var(--nv-color-gold, #c8a873)',
                                  color: 'white',
                                  fontSize: 9,
                                  lineHeight: '12px',
                                }}
                              >
                                {duplicateCount}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <aside
                style={{
                  width: 240,
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
                  选中日期
                </div>

                <div
                  style={{
                    border: '1px solid var(--nv-color-border)',
                    borderRadius: 'var(--nv-radius-md)',
                    padding: 10,
                    marginBottom: 12,
                    background: 'color-mix(in srgb, var(--nv-color-bg) 74%, transparent)',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--nv-color-fg-subtle)', marginBottom: 6 }}>
                    {selectedDateKey}
                  </div>
                  {selectedDailyNote ? (
                    <>
                      <button
                        className="nv-transition"
                        onClick={() => {
                          onOpenNote(selectedDailyNote.id)
                          onClose()
                        }}
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--nv-color-fg)',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 600,
                          padding: 0,
                          textAlign: 'left',
                        }}
                      >
                        {selectedDailyNote.title}
                      </button>
                      {selectedDuplicateCount > 1 && (
                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--nv-color-gold, #c8a873)' }}>
                          该日期存在 {selectedDuplicateCount} 篇日记
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, color: 'var(--nv-color-fg-subtle)', lineHeight: 1.5 }}>
                        该日期还没有日记
                      </div>
                      <button
                        className="nv-transition"
                        onClick={() => handleDayOpen(selectedDate)}
                        style={{
                          marginTop: 8,
                          padding: '6px 10px',
                          borderRadius: 'var(--nv-radius-sm)',
                          border: '1px solid var(--nv-color-border)',
                          background: 'var(--nv-color-accent-muted)',
                          color: 'var(--nv-color-accent-fg)',
                          cursor: 'pointer',
                        }}
                      >
                        创建日记
                      </button>
                    </>
                  )}
                </div>

                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--nv-color-fg-subtle)',
                    marginBottom: 8,
                  }}
                >
                  本月日记 · {monthlyNotes.length}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <ActivityList
                    title="已创建笔记"
                    notes={selectedCreatedNotes}
                    onOpenNote={(noteId) => {
                      onOpenNote(noteId)
                      onClose()
                    }}
                  />
                  <ActivityList
                    title="已更新笔记"
                    notes={selectedUpdatedNotes}
                    onOpenNote={(noteId) => {
                      onOpenNote(noteId)
                      onClose()
                    }}
                  />
                </div>
                {monthlyNotes.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--nv-color-fg-subtle)', lineHeight: 1.6 }}>
                    双击日期可创建当天日记。
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {monthlyNotes.map((note) => (
                      <li key={note.id} style={{ marginBottom: 4 }}>
                        <button
                          onClick={() => {
                            onOpenNote(note.id)
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
                          {note.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ActivityList({
  title,
  notes,
  onOpenNote,
}: {
  title: string
  notes: Note[]
  onOpenNote: (noteId: number) => void
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--nv-color-fg-subtle)',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {notes.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--nv-color-fg-subtle)', lineHeight: 1.5 }}>暂无活动。</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {notes.slice(0, 5).map((note) => (
            <li key={note.id} style={{ marginBottom: 4 }}>
              <button
                className="nv-transition"
                onClick={() => onOpenNote(note.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '5px 7px',
                  border: '1px solid var(--nv-color-border)',
                  background: 'color-mix(in srgb, var(--nv-color-bg) 78%, transparent)',
                  borderRadius: 'var(--nv-radius-sm)',
                  fontSize: 12,
                  color: 'var(--nv-color-fg)',
                  cursor: 'pointer',
                }}
              >
                {note.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default DailyNotesPanel
