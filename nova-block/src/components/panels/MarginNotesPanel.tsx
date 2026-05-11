/**
 * v0.20.0 · B6 Margin Notes
 *
 * 侧边栏批注:一个独立的右侧浮层,针对当前笔记维护一组"边栏批注"。
 * 每条批注是一段短小的读者注释(例如"这里存疑""参考 xxx"),
 * 与正文段落并列,便于二次阅读时快速扫读。
 *
 * 存储:localStorage["nova.margin.<noteId>"] = MarginNote[]
 * 不侵入 Tiptap / 后端 schema,纯前端叠加。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Plus, Trash2, X, Pencil, Check } from 'lucide-react'

export interface MarginNote {
  id: string
  excerpt: string
  body: string
  createdAt: number
  updatedAt: number
}

interface MarginNotesPanelProps {
  noteId: number | null
  noteTitle: string
  isOpen: boolean
  onClose: () => void
}

function storageKey(noteId: number): string {
  return `nova.margin.${noteId}`
}

function readMarginNotes(noteId: number): MarginNote[] {
  try {
    const raw = localStorage.getItem(storageKey(noteId))
    if (!raw) return []
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter((x) => x && typeof x.id === 'string')
  } catch {
    return []
  }
}

function writeMarginNotes(noteId: number, notes: MarginNote[]) {
  try {
    localStorage.setItem(storageKey(noteId), JSON.stringify(notes))
  } catch {
    /* noop */
  }
}

export function MarginNotesPanel({ noteId, noteTitle, isOpen, onClose }: MarginNotesPanelProps) {
  const [marginNotes, setMarginNotes] = useState<MarginNote[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftBody, setDraftBody] = useState('')
  const [draftExcerpt, setDraftExcerpt] = useState('')

  useEffect(() => {
    if (!isOpen || noteId == null) {
      setMarginNotes([])
      return
    }
    setMarginNotes(readMarginNotes(noteId))
  }, [isOpen, noteId])

  const persist = useCallback(
    (next: MarginNote[]) => {
      setMarginNotes(next)
      if (noteId != null) writeMarginNotes(noteId, next)
    },
    [noteId],
  )

  const addFromSelection = useCallback(() => {
    const selection = window.getSelection()?.toString().trim() ?? ''
    const now = Date.now()
    const newNote: MarginNote = {
      id: `mn_${now}_${Math.random().toString(36).slice(2, 7)}`,
      excerpt: selection.slice(0, 120),
      body: '',
      createdAt: now,
      updatedAt: now,
    }
    const next = [newNote, ...marginNotes]
    persist(next)
    setEditingId(newNote.id)
    setDraftExcerpt(newNote.excerpt)
    setDraftBody('')
  }, [marginNotes, persist])

  const startEdit = (n: MarginNote) => {
    setEditingId(n.id)
    setDraftExcerpt(n.excerpt)
    setDraftBody(n.body)
  }

  const saveEdit = () => {
    if (!editingId) return
    const now = Date.now()
    const next = marginNotes.map((n) =>
      n.id === editingId ? { ...n, excerpt: draftExcerpt, body: draftBody, updatedAt: now } : n,
    )
    persist(next)
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const remove = (id: string) => {
    persist(marginNotes.filter((n) => n.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const sorted = useMemo(
    () => [...marginNotes].sort((a, b) => b.updatedAt - a.updatedAt),
    [marginNotes],
  )

  return (
    <AnimatePresence>
      {isOpen && noteId != null && (
        <motion.div
          key="margin-notes-panel"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
          className="nv-glass-sm"
          style={{
            position: 'fixed',
            top: 72,
            right: 22,
            bottom: 22,
            width: 320,
            zIndex: 90,
            borderRadius: 14,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            boxShadow: 'var(--nv-shadow-3)',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={15} color="var(--nv-color-accent)" />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--nv-color-fg)', flex: 1 }}>
              边栏批注
            </div>
            <button
              className="nv-panel-pill"
              onClick={onClose}
              title="关闭"
              style={{ padding: '3px 6px' }}
            >
              <X size={12} />
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--nv-color-fg-subtle)', marginTop: -4 }}>
            {noteTitle || 'Untitled'} · 批注数据保存在本地
          </div>

          <button
            className="nv-panel-pill"
            onClick={addFromSelection}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 10px',
              fontSize: 12,
            }}
            title="先在正文中选中一段文字,然后点击此按钮,批注会自动关联选中片段"
          >
            <Plus size={12} />
            从当前选区新增批注
          </button>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              paddingRight: 2,
            }}
          >
            {sorted.length === 0 && (
              <div
                style={{
                  padding: '24px 10px',
                  color: 'var(--nv-color-fg-subtle)',
                  fontSize: 12,
                  textAlign: 'center',
                  lineHeight: 1.6,
                }}
              >
                还没有批注。
                <br />
                在正文中选中一段文字,
                <br />
                再点击上方按钮即可新增。
              </div>
            )}
            {sorted.map((n) => {
              const isEditing = editingId === n.id
              return (
                <div
                  key={n.id}
                  className="nv-margin-note-card"
                  style={{
                    background: 'var(--nv-color-bg)',
                    border: '1px solid var(--nv-color-border)',
                    borderLeft: '3px solid var(--nv-color-accent)',
                    borderRadius: 'var(--nv-radius-sm)',
                    padding: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {isEditing ? (
                    <>
                      <textarea
                        value={draftExcerpt}
                        onChange={(e) => setDraftExcerpt(e.target.value)}
                        placeholder="原文片段(可编辑)"
                        className="nv-sunken"
                        style={{
                          fontSize: 11.5,
                          color: 'var(--nv-color-fg-muted)',
                          padding: 6,
                          resize: 'vertical',
                          minHeight: 36,
                        }}
                      />
                      <textarea
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        placeholder="写下你的批注…"
                        className="nv-sunken"
                        autoFocus
                        style={{
                          fontSize: 12.5,
                          color: 'var(--nv-color-fg)',
                          padding: 6,
                          resize: 'vertical',
                          minHeight: 60,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          className="nv-panel-pill"
                          onClick={cancelEdit}
                          style={{ padding: '3px 8px', fontSize: 11 }}
                        >
                          取消
                        </button>
                        <button
                          className="nv-panel-pill"
                          onClick={saveEdit}
                          style={{
                            padding: '3px 8px',
                            fontSize: 11,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Check size={11} />
                          保存
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {n.excerpt && (
                        <blockquote
                          style={{
                            margin: 0,
                            padding: '4px 8px',
                            borderLeft: '2px solid var(--nv-color-border-strong)',
                            fontSize: 11.5,
                            color: 'var(--nv-color-fg-subtle)',
                            fontStyle: 'italic',
                            background: 'var(--nv-color-bg-subtle)',
                            borderRadius: 4,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {n.excerpt}
                        </blockquote>
                      )}
                      <div
                        style={{
                          fontSize: 12.5,
                          color: 'var(--nv-color-fg)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          lineHeight: 1.55,
                        }}
                      >
                        {n.body || (
                          <span style={{ color: 'var(--nv-color-fg-subtle)', fontStyle: 'italic' }}>
                            (空批注,点击编辑)
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 10,
                          color: 'var(--nv-color-fg-subtle)',
                        }}
                      >
                        <span>{formatRelative(n.updatedAt)}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => startEdit(n)}
                            title="编辑"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--nv-color-fg-muted)',
                              cursor: 'pointer',
                              padding: 2,
                            }}
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => remove(n.id)}
                            title="删除"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--nv-color-fg-muted)',
                              cursor: 'pointer',
                              padding: 2,
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}-${d.getDate()}`
}

export default MarginNotesPanel
