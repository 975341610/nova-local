/**
 * v0.19 D6 · Task Mirror
 *
 * 跨笔记聚合所有 Tiptap TaskList/TaskItem，支持过滤：
 *   - status: all / open / done
 *   - keyword: 关键字
 *   - tag/@mention 识别
 *
 * 采用 DOMParser 解析 note.content 中的 `<li data-type="taskItem" ...>`；
 * 不依赖正则，不受属性顺序 / 嵌套影响。
 */
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckSquare, Square, Filter, Search } from 'lucide-react'
import type { Note } from '../../lib/types'

interface TaskMirrorProps {
  notes: Note[]
  isOpen: boolean
  onClose: () => void
  onOpenNote: (noteId: number) => void
}

interface TaskRow {
  noteId: number
  noteTitle: string
  text: string
  done: boolean
  mentions: string[]
  tags: string[]
}

function extractTasks(note: Note): TaskRow[] {
  if (!note.content || note.is_folder) return []
  const out: TaskRow[] = []
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(`<div>${note.content}</div>`, 'text/html')
  } catch {
    return out
  }
  // Tiptap 实际渲染的是 <li data-type="taskItem" data-checked="true|false">。
  // mergeAttributes 让 data-type 可能出现在任意位置——用选择器而非正则，鲁棒性更强。
  const lis = doc.querySelectorAll('li[data-type="taskItem"]')
  lis.forEach((li) => {
    const dataChecked = li.getAttribute('data-checked')
    const checkedAttr = li.getAttribute('checked')
    const inputChecked = li.querySelector('input[type="checkbox"]')?.hasAttribute('checked')
    const done =
      dataChecked === 'true' || dataChecked === '' ||
      checkedAttr === 'true' || checkedAttr === '' ||
      inputChecked === true

    // 文本内容：Tiptap 模型 renderHTML 是 [li, [label,[input],[span]], [div, 0]]，
    // 因此任务文本位于 li > div 中；若缺失则退回 li 整体文本。
    const clone = li.cloneNode(true) as HTMLElement
    clone.querySelectorAll('input').forEach(n => n.remove())

    const contentHolder = clone.querySelector(':scope > div') || clone
    // 排除嵌套的 taskItem，避免父级任务把子任务的文本吞掉
    const nestedTasks = contentHolder.querySelectorAll('li[data-type="taskItem"]')
    nestedTasks.forEach(n => n.remove())

    const firstP = contentHolder.querySelector(':scope > p') || contentHolder.querySelector('p')
    const rawText = (firstP?.textContent ?? contentHolder.textContent ?? '').trim()
    if (!rawText) return

    const mentions = Array.from(rawText.matchAll(/@([\u4e00-\u9fa5A-Za-z0-9_-]{1,16})/g)).map(x => x[1])
    const tags = Array.from(rawText.matchAll(/#([\u4e00-\u9fa5A-Za-z0-9_-]{1,20})/g)).map(x => x[1])

    out.push({
      noteId: note.id,
      noteTitle: note.title || '未命名',
      text: rawText,
      done,
      mentions,
      tags,
    })
  })
  return out
}

export function TaskMirror({ notes, isOpen, onClose, onOpenNote }: TaskMirrorProps) {
  const [status, setStatus] = useState<'all' | 'open' | 'done'>('open')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const allTasks = useMemo(() => {
    if (!isOpen) return [] as TaskRow[]
    const out: TaskRow[] = []
    for (const n of notes) out.push(...extractTasks(n))
    return out
  }, [notes, isOpen])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allTasks.filter((t) => {
      if (status === 'open' && t.done) return false
      if (status === 'done' && !t.done) return false
      if (!q) return true
      if (q.startsWith('@')) return t.mentions.some(m => m.toLowerCase().includes(q.slice(1)))
      if (q.startsWith('#')) return t.tags.some(x => x.toLowerCase().includes(q.slice(1)))
      if (q.startsWith('note:')) return t.noteTitle.toLowerCase().includes(q.slice(5))
      return t.text.toLowerCase().includes(q) || t.noteTitle.toLowerCase().includes(q)
    })
  }, [allTasks, query, status])

  const byNote = useMemo(() => {
    const m = new Map<number, { title: string; rows: TaskRow[] }>()
    for (const r of filtered) {
      if (!m.has(r.noteId)) m.set(r.noteId, { title: r.noteTitle, rows: [] })
      m.get(r.noteId)!.rows.push(r)
    }
    return Array.from(m.entries())
  }, [filtered])

  const counts = useMemo(() => {
    let open = 0, done = 0
    for (const t of allTasks) {
      if (t.done) {
        done++
      } else {
        open++
      }
    }
    return { open, done, total: allTasks.length }
  }, [allTasks])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="tm-overlay"
          className="nv-panel-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
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
                <CheckSquare size={16} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>任务镜像 · Task Mirror</div>
                  <div style={{ fontSize: 11, color: 'var(--nv-color-fg-subtle)' }}>
                    {counts.open} 待办 · {counts.done} 完成 · {counts.total} 总计
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="nv-panel-close"><X size={14} /></button>
            </header>

            <div className="nv-panel-toolbar">
              <div className="nv-panel-search">
                <Search size={12} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索 · 支持 @人 #标签 note:笔记名"
                />
              </div>
              <div className="nv-panel-segmented">
                <Filter size={11} style={{ opacity: 0.5 }} />
                {(['all', 'open', 'done'] as const).map((s) => (
                  <button
                    key={s}
                    data-active={status === s}
                    onClick={() => setStatus(s)}
                  >
                    {s === 'all' ? '全部' : s === 'open' ? '未完成' : '已完成'}
                  </button>
                ))}
              </div>
            </div>

            <div className="nv-panel-body">
              {byNote.length === 0 ? (
                <div className="nv-panel-empty">
                  {counts.total === 0
                    ? <>暂无任务 —— 试试 <code>/任务</code> 创建第一条待办</>
                    : <>当前筛选条件下没有命中 —— 调整状态或搜索词再试</>}
                </div>
              ) : (
                byNote.map(([noteId, g]) => (
                  <section key={noteId} className="nv-taskmirror-group">
                    <button
                      className="nv-taskmirror-title"
                      onClick={() => { onOpenNote(noteId); onClose() }}
                    >
                      {g.title}
                      <span style={{ opacity: 0.55, fontWeight: 400, marginLeft: 6 }}>· {g.rows.length}</span>
                    </button>
                    <ul>
                      {g.rows.map((r, i) => (
                        <li key={i} data-done={r.done}>
                          {r.done ? <CheckSquare size={13} /> : <Square size={13} />}
                          <span>{r.text}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default TaskMirror
