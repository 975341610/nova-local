/**
 * v0.21.0 · A3 Timeline View
 *
 * 将全部笔记按时间分组(年 > 月 > 日)垂直展开,类似 GitHub contributions 的
 * 时间轴 + 日期锚点。右侧是月份锚点,左侧是分组后的笔记卡片。
 *
 * 特性:
 *   - 按 created_at / updated_at 切换排序依据
 *   - 搜索(标题 + tags)
 *   - 标签筛选(chip toggle)
 *   - 点击卡片 -> 跳转到笔记
 *   - 月份侧边锚点可快速跳到对应分组
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, Search, ArrowUpDown, Tag as TagIcon } from 'lucide-react'
import type { Note } from '../../lib/types'

interface TimelineViewProps {
  notes: Note[]
  isOpen: boolean
  onClose: () => void
  onSelectNote: (id: number) => void
}

type DateBasis = 'updated_at' | 'created_at'

interface MonthBucket {
  key: string // YYYY-MM
  label: string // 2026年4月
  notes: Note[]
}

function parseTs(s: string | undefined | null): number {
  if (!s) return 0
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? t : 0
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${y}年${m}月`
}

function monthKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function TimelineView({ notes, isOpen, onClose, onSelectNote }: TimelineViewProps) {
  const [basis, setBasis] = useState<DateBasis>('updated_at')
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const n of notes) {
      for (const t of n.tags || []) s.add(t)
    }
    return Array.from(s).sort()
  }, [notes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return notes
      .filter((n) => !n.is_folder && !n.deleted_at)
      .filter((n) => {
        if (activeTags.size === 0) return true
        return (n.tags || []).some((t) => activeTags.has(t))
      })
      .filter((n) => {
        if (!q) return true
        const hay = [n.title, ...(n.tags || [])].join(' ').toLowerCase()
        return hay.includes(q)
      })
  }, [notes, query, activeTags])

  const buckets = useMemo<MonthBucket[]>(() => {
    const map = new Map<string, Note[]>()
    for (const n of filtered) {
      const ts = basis === 'updated_at' ? parseTs(n.updated_at) || parseTs(n.created_at) : parseTs(n.created_at)
      if (!ts) continue
      const k = monthKey(ts)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(n)
    }
    const arr: MonthBucket[] = Array.from(map.entries()).map(([key, ns]) => ({
      key,
      label: monthLabel(key),
      notes: ns.sort((a, b) => {
        const ta = basis === 'updated_at' ? parseTs(a.updated_at) || parseTs(a.created_at) : parseTs(a.created_at)
        const tb = basis === 'updated_at' ? parseTs(b.updated_at) || parseTs(b.created_at) : parseTs(b.created_at)
        return tb - ta
      }),
    }))
    arr.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
    return arr
  }, [filtered, basis])

  const totalCount = filtered.length

  const toggleTag = (t: string) => {
    setActiveTags((prev) => {
      const n = new Set(prev)
      if (n.has(t)) n.delete(t)
      else n.add(t)
      return n
    })
  }

  const jumpToMonth = (key: string) => {
    const el = scrollRef.current?.querySelector<HTMLDivElement>(`[data-month="${key}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="timeline-view"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
          className="fixed inset-0 z-[95]"
          style={{
            background: 'var(--nv-color-bg)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              borderBottom: '1px solid var(--nv-color-border)',
              background: 'var(--nv-color-bg-subtle)',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Clock size={15} color="var(--nv-color-accent)" />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--nv-color-fg)' }}>
                时间轴 · Timeline
              </div>
              <div style={{ fontSize: 12, color: 'var(--nv-color-fg-subtle)' }}>
                共 {totalCount} 条 · {buckets.length} 个月
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                className="nv-sunken"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  borderRadius: 8,
                  minWidth: 200,
                }}
              >
                <Search size={12} color="var(--nv-color-fg-subtle)" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索标题或 tag"
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: 12,
                    color: 'var(--nv-color-fg)',
                  }}
                />
              </div>
              <button
                className="nv-panel-pill"
                onClick={() => setBasis((b) => (b === 'updated_at' ? 'created_at' : 'updated_at'))}
                title="切换排序依据"
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ArrowUpDown size={11} />
                {basis === 'updated_at' ? '按更新时间' : '按创建时间'}
              </button>
              <button
                onClick={onClose}
                className="nv-panel-pill"
                style={{ padding: '4px 8px' }}
                title="关闭 Esc"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {allTags.length > 0 && (
            <div
              style={{
                padding: '8px 18px',
                borderBottom: '1px solid var(--nv-color-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                background: 'var(--nv-color-bg)',
              }}
            >
              <TagIcon size={12} color="var(--nv-color-fg-subtle)" />
              <span style={{ fontSize: 11, color: 'var(--nv-color-fg-subtle)', marginRight: 4 }}>
                标签筛选:
              </span>
              {allTags.map((t) => {
                const active = activeTags.has(t)
                return (
                  <button
                    key={t}
                    onClick={() => toggleTag(t)}
                    className="nv-panel-pill"
                    style={{
                      padding: '2px 8px',
                      fontSize: 11,
                      background: active ? 'var(--nv-color-accent-muted)' : undefined,
                      borderColor: active ? 'var(--nv-color-accent)' : undefined,
                      color: active ? 'var(--nv-color-accent-fg)' : undefined,
                    }}
                  >
                    #{t}
                  </button>
                )
              })}
              {activeTags.size > 0 && (
                <button
                  onClick={() => setActiveTags(new Set())}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: 11,
                    color: 'var(--nv-color-fg-subtle)',
                    cursor: 'pointer',
                    marginLeft: 4,
                  }}
                >
                  清除
                </button>
              )}
            </div>
          )}

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* 月份锚点 */}
            <div
              style={{
                width: 140,
                borderRight: '1px solid var(--nv-color-border)',
                background: 'var(--nv-color-bg-subtle)',
                overflowY: 'auto',
                padding: '12px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {buckets.length === 0 && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--nv-color-fg-subtle)',
                    padding: 8,
                    textAlign: 'center',
                  }}
                >
                  无匹配
                </div>
              )}
              {buckets.map((b) => (
                <button
                  key={b.key}
                  onClick={() => jumpToMonth(b.key)}
                  style={{
                    textAlign: 'left',
                    padding: '6px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--nv-color-fg-muted)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  className="nv-hover-bg"
                >
                  <span>{b.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--nv-color-fg-subtle)' }}>
                    {b.notes.length}
                  </span>
                </button>
              ))}
            </div>

            {/* 主时间轴 */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 32px 80px' }}>
              {buckets.length === 0 && (
                <div
                  style={{
                    padding: 80,
                    textAlign: 'center',
                    color: 'var(--nv-color-fg-subtle)',
                    fontSize: 13,
                  }}
                >
                  没有符合条件的笔记。
                </div>
              )}
              {buckets.map((b) => (
                <section
                  key={b.key}
                  data-month={b.key}
                  style={{ marginBottom: 36, position: 'relative' }}
                >
                  <div
                    style={{
                      position: 'sticky',
                      top: 0,
                      background: 'var(--nv-color-bg)',
                      padding: '6px 0',
                      zIndex: 2,
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--nv-color-accent)',
                      borderBottom: '1px solid var(--nv-color-border)',
                      marginBottom: 10,
                    }}
                  >
                    {b.label}
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--nv-color-fg-subtle)',
                        fontWeight: 400,
                        marginLeft: 8,
                      }}
                    >
                      {b.notes.length} 条
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      borderLeft: '2px solid var(--nv-color-border-strong)',
                      paddingLeft: 18,
                      marginLeft: 8,
                    }}
                  >
                    {b.notes.map((n) => {
                      const ts = basis === 'updated_at' ? parseTs(n.updated_at) || parseTs(n.created_at) : parseTs(n.created_at)
                      const d = new Date(ts)
                      return (
                        <button
                          key={n.id}
                          onClick={() => {
                            onSelectNote(n.id)
                            onClose()
                          }}
                          style={{
                            position: 'relative',
                            textAlign: 'left',
                            background: 'var(--nv-color-bg-subtle)',
                            border: '1px solid var(--nv-color-border)',
                            borderRadius: 'var(--nv-radius-md)',
                            padding: '10px 14px',
                            cursor: 'pointer',
                            transition: 'all 160ms ease',
                          }}
                          className="nv-timeline-card"
                        >
                          <span
                            aria-hidden
                            style={{
                              position: 'absolute',
                              left: -24,
                              top: 14,
                              width: 9,
                              height: 9,
                              borderRadius: '50%',
                              background: 'var(--nv-color-accent)',
                              border: '2px solid var(--nv-color-bg)',
                              boxShadow: '0 0 0 1px var(--nv-color-accent)',
                            }}
                          />
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'baseline',
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13.5,
                                fontWeight: 600,
                                color: 'var(--nv-color-fg)',
                              }}
                            >
                              {n.title || 'Untitled'}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: 'var(--nv-color-fg-subtle)',
                                fontFamily: 'var(--nv-font-mono)',
                                flexShrink: 0,
                              }}
                            >
                              {`${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(
                                d.getHours(),
                              ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`}
                            </div>
                          </div>
                          {n.summary && (
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 12,
                                color: 'var(--nv-color-fg-muted)',
                                lineHeight: 1.5,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {n.summary}
                            </div>
                          )}
                          {(n.tags?.length ?? 0) > 0 && (
                            <div
                              style={{
                                marginTop: 6,
                                display: 'flex',
                                gap: 4,
                                flexWrap: 'wrap',
                              }}
                            >
                              {n.tags!.slice(0, 5).map((t) => (
                                <span
                                  key={t}
                                  style={{
                                    fontSize: 10,
                                    padding: '1px 6px',
                                    background: 'var(--nv-color-accent-muted)',
                                    color: 'var(--nv-color-accent-fg)',
                                    borderRadius: 'var(--nv-radius-full)',
                                  }}
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default TimelineView
