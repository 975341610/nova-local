/**
 * v0.21.6 · 左侧工具栏
 * v0.21.10 · 新增 text 工具分支 (点击画布落 text 节点并进入编辑)
 * v0.21.11 · 新增高亮笔 marker + 多种形状 (triangle/hexagon/pentagon/star/
 *            cylinder/parallelogram/trapezoid/bubble/arrow-shape/plus/cloud).
 * v0.21.14 · 新增表格 / 图片 工具 + HTML5 拖拽排序 + localStorage 持久化
 * v0.21.16 · 新增工具搜索面板 (Ctrl+/) + 搜索图标
 *
 * 工具 ID 由 Modal 持有, Board 根据 tool 路由鼠标事件.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WhiteboardStore } from '../../store/whiteboard/whiteboardStore'

export type ToolId =
  | 'select'
  | 'hand'
  | 'pen'
  | 'marker'
  | 'eraser'
  | 'node-rect'
  | 'node-ellipse'
  | 'node-diamond'
  | 'node-sticky'
  | 'node-plantuml'
  | 'node-triangle'
  | 'node-hexagon'
  | 'node-pentagon'
  | 'node-star'
  | 'node-cylinder'
  | 'node-parallelogram'
  | 'node-trapezoid'
  | 'node-bubble'
  | 'node-arrow-shape'
  | 'node-plus'
  | 'node-cloud'
  | 'node-table'
  | 'node-image'
  | 'edge'
  | 'text'

interface Props {
  tool: ToolId
  onToolChange: (t: ToolId) => void
  store: WhiteboardStore
}

interface ToolMeta {
  id: ToolId
  icon: string
  label: string
  key?: string
  group: 'core' | 'shape' | 'more-shape'
}

const TOOLS: ToolMeta[] = [
  { id: 'select', icon: '◱', label: '选择', key: 'V', group: 'core' },
  { id: 'hand', icon: '✋', label: '平移', key: 'H', group: 'core' },
  { id: 'pen', icon: '✎', label: '手绘', key: 'P', group: 'core' },
  { id: 'marker', icon: '🖍', label: '高亮笔', key: 'M', group: 'core' },
  { id: 'eraser', icon: '⌫', label: '橡皮', key: 'E', group: 'core' },
  { id: 'edge', icon: '↗', label: '连线', key: 'C', group: 'core' },
  { id: 'text', icon: 'T', label: '文本', key: 'T', group: 'core' },
  { id: 'node-rect', icon: '▭', label: '矩形', key: 'N', group: 'shape' },
  { id: 'node-ellipse', icon: '◯', label: '椭圆', group: 'shape' },
  { id: 'node-diamond', icon: '◇', label: '菱形', group: 'shape' },
  { id: 'node-sticky', icon: '🗒', label: '便签', group: 'shape' },
  { id: 'node-table', icon: '⊞', label: '表格', group: 'shape' },
  { id: 'node-image', icon: '🖼', label: '图片', group: 'shape' },
  { id: 'node-triangle', icon: '△', label: '三角', group: 'more-shape' },
  { id: 'node-hexagon', icon: '⬡', label: '六边形', group: 'more-shape' },
  { id: 'node-pentagon', icon: '⬠', label: '五边形', group: 'more-shape' },
  { id: 'node-star', icon: '★', label: '星形', group: 'more-shape' },
  { id: 'node-cylinder', icon: '🛢', label: '圆柱', group: 'more-shape' },
  { id: 'node-parallelogram', icon: '▰', label: '平行四边形', group: 'more-shape' },
  { id: 'node-trapezoid', icon: '⏢', label: '梯形', group: 'more-shape' },
  { id: 'node-bubble', icon: '💬', label: '气泡', group: 'more-shape' },
  { id: 'node-arrow-shape', icon: '➤', label: '箭头', group: 'more-shape' },
  { id: 'node-plus', icon: '✚', label: '十字', group: 'more-shape' },
  { id: 'node-cloud', icon: '☁', label: '云朵', group: 'more-shape' },
  { id: 'node-plantuml', icon: '{P}', label: 'PlantUML', group: 'more-shape' },
]

const TOOL_MAP: Record<ToolId, ToolMeta> = (() => {
  const m = {} as Record<ToolId, ToolMeta>
  for (const t of TOOLS) m[t.id] = t
  return m
})()

const STORAGE_KEY = 'wb.toolbar.order.v1'
const SIZE_KEY = 'wb.toolbar.size.v1'

type ToolbarSize = 'sm' | 'md' | 'lg'
const SIZE_ORDER: ToolbarSize[] = ['sm', 'md', 'lg']
const SIZE_DIMS: Record<ToolbarSize, { side: number; asideW: number; font: number }> = {
  sm: { side: 32, asideW: 44, font: 13 },
  md: { side: 40, asideW: 56, font: 15 },
  lg: { side: 48, asideW: 64, font: 18 },
}

function loadSize(): ToolbarSize {
  try {
    const raw = localStorage.getItem(SIZE_KEY)
    if (raw === 'sm' || raw === 'md' || raw === 'lg') return raw
  } catch {
    /* ignore */
  }
  return 'md'
}

function saveSize(v: ToolbarSize): void {
  try {
    localStorage.setItem(SIZE_KEY, v)
  } catch {
    /* ignore */
  }
}

function loadOrder(): ToolId[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    return arr.filter((x): x is ToolId => typeof x === 'string' && x in TOOL_MAP)
  } catch {
    return null
  }
}

function saveOrder(ids: ToolId[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* ignore quota */
  }
}

/** 合并: 持久化顺序 + 新增(未持久化)工具追加到对应 group 末尾 */
function mergeOrder(persisted: ToolId[] | null): ToolId[] {
  if (!persisted || persisted.length === 0) return TOOLS.map((t) => t.id)
  const have = new Set(persisted)
  const missing = TOOLS.filter((t) => !have.has(t.id))
  if (missing.length === 0) return persisted
  // 缺失项按原 group 归位到该 group 末尾
  const result: ToolId[] = []
  for (const id of persisted) result.push(id)
  for (const m of missing) {
    // 找到该 group 在 result 中的最后位置, 插入其后
    let lastIdx = -1
    for (let i = 0; i < result.length; i++) {
      if (TOOL_MAP[result[i]]?.group === m.group) lastIdx = i
    }
    if (lastIdx < 0) result.push(m.id)
    else result.splice(lastIdx + 1, 0, m.id)
  }
  return result
}

export function Toolbar({ tool, onToolChange }: Props) {
  const [order, setOrder] = useState<ToolId[]>(() => mergeOrder(loadOrder()))
  const [dragId, setDragId] = useState<ToolId | null>(null)
  const [overId, setOverId] = useState<ToolId | null>(null)
  const [size, setSize] = useState<ToolbarSize>(() => loadSize())
  // v0.21.16 · 工具搜索面板
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    saveOrder(order)
  }, [order])
  useEffect(() => {
    saveSize(size)
  }, [size])

  // v0.21.16 · Ctrl+/ (或 Cmd+/) 打开搜索面板
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        const t = document.activeElement as HTMLElement | null
        if (t && (t.tagName === 'TEXTAREA' || t.isContentEditable)) return
        e.preventDefault()
        setSearchOpen((v) => !v)
      } else if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  useEffect(() => {
    if (searchOpen) {
      setQuery('')
      setActiveIdx(0)
      queueMicrotask(() => searchInputRef.current?.focus())
    }
  }, [searchOpen])

  const dims = SIZE_DIMS[size]

  const grouped = useMemo(() => {
    const core: ToolMeta[] = []
    const basic: ToolMeta[] = []
    const more: ToolMeta[] = []
    for (const id of order) {
      const t = TOOL_MAP[id]
      if (!t) continue
      if (t.group === 'core') core.push(t)
      else if (t.group === 'shape') basic.push(t)
      else more.push(t)
    }
    return { core, basic, more }
  }, [order])

  const onDragStart = useCallback((id: ToolId) => (e: React.DragEvent) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 需要 setData 才能触发 drag
    try {
      e.dataTransfer.setData('text/plain', id)
    } catch {
      /* ignore */
    }
  }, [])

  const onDragOver = useCallback(
    (id: ToolId) => (e: React.DragEvent) => {
      if (!dragId || dragId === id) return
      // 仅同 group 内可排序
      if (TOOL_MAP[dragId]?.group !== TOOL_MAP[id]?.group) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setOverId(id)
    },
    [dragId],
  )

  const onDrop = useCallback(
    (id: ToolId) => (e: React.DragEvent) => {
      e.preventDefault()
      if (!dragId || dragId === id) {
        setDragId(null)
        setOverId(null)
        return
      }
      if (TOOL_MAP[dragId]?.group !== TOOL_MAP[id]?.group) {
        setDragId(null)
        setOverId(null)
        return
      }
      setOrder((prev) => {
        const next = prev.filter((x) => x !== dragId)
        const idx = next.indexOf(id)
        if (idx < 0) return prev
        next.splice(idx, 0, dragId)
        return next
      })
      setDragId(null)
      setOverId(null)
    },
    [dragId],
  )

  const onDragEnd = useCallback(() => {
    setDragId(null)
    setOverId(null)
  }, [])

  const resetOrder = useCallback(() => {
    setOrder(TOOLS.map((t) => t.id))
  }, [])

  const renderButton = (t: ToolMeta) => {
    const active = tool === t.id
    const dragging = dragId === t.id
    const over = overId === t.id
    return (
      <button
        key={t.id}
        onClick={() => onToolChange(t.id)}
        title={t.key ? `${t.label} (${t.key})` : t.label}
        draggable
        onDragStart={onDragStart(t.id)}
        onDragOver={onDragOver(t.id)}
        onDrop={onDrop(t.id)}
        onDragEnd={onDragEnd}
        style={{ width: dims.side, height: dims.side, fontSize: dims.font }}
        className={
          'rounded-lg flex items-center justify-center border transition ' +
          (active
            ? 'bg-indigo-600 text-white border-indigo-600 shadow'
            : 'bg-white hover:bg-slate-100 text-slate-600 border-transparent') +
          (dragging ? ' opacity-40' : '') +
          (over ? ' ring-2 ring-indigo-400' : '')
        }
      >
        {t.icon}
      </button>
    )
  }

  const cycleSize = () => {
    const i = SIZE_ORDER.indexOf(size)
    setSize(SIZE_ORDER[(i + 1) % SIZE_ORDER.length])
  }

  // v0.21.16 · 过滤后的候选工具
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOOLS
    return TOOLS.filter((t) => {
      const hay = `${t.label} ${t.id} ${t.key ?? ''}`.toLowerCase()
      // 简单模糊匹配: 所有字符按序出现即可
      let i = 0
      for (const ch of hay) {
        if (ch === q[i]) i++
        if (i >= q.length) return true
      }
      return hay.includes(q)
    })
  }, [query])

  const pickFromSearch = useCallback(
    (id: ToolId) => {
      onToolChange(id)
      setSearchOpen(false)
    },
    [onToolChange],
  )

  return (
    <aside
      className="shrink-0 border-r bg-white flex flex-col items-center py-3 gap-1 overflow-y-auto relative"
      style={{ width: dims.asideW }}
    >
      {grouped.core.map(renderButton)}
      <div className="w-6 h-px bg-slate-200 my-1" />
      {grouped.basic.map(renderButton)}
      <div className="w-6 h-px bg-slate-200 my-1" />
      {grouped.more.map(renderButton)}
      <div className="w-6 h-px bg-slate-200 my-1" />
      <button
        onClick={() => setSearchOpen(true)}
        title="搜索工具 (Ctrl+/)"
        style={{ width: dims.side, height: Math.max(24, dims.side - 12) }}
        className="rounded text-[12px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-transparent"
      >
        🔍
      </button>
      <button
        onClick={cycleSize}
        title={`图标尺寸: ${size.toUpperCase()} (点击切换 小→中→大)`}
        style={{ width: dims.side, height: Math.max(24, dims.side - 12) }}
        className="rounded text-[11px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-transparent"
      >
        {size === 'sm' ? 'S' : size === 'md' ? 'M' : 'L'}
      </button>
      <button
        onClick={resetOrder}
        title="重置工具栏顺序"
        style={{ width: dims.side, height: Math.max(24, dims.side - 12) }}
        className="rounded text-[11px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-transparent"
      >
        重置
      </button>
      {searchOpen && (
        <div
          className="absolute top-2 z-30 bg-white border border-slate-200 rounded-lg shadow-lg w-60 p-2"
          style={{ left: dims.asideW + 6 }}
        >
          <div className="flex items-center gap-1 border-b pb-1 mb-1">
            <span className="text-slate-400 text-xs pl-1">🔍</span>
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIdx(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveIdx((i) => Math.min(filtered.length - 1, i + 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveIdx((i) => Math.max(0, i - 1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const pick = filtered[activeIdx]
                  if (pick) pickFromSearch(pick.id)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setSearchOpen(false)
                }
              }}
              placeholder="搜索工具..."
              className="flex-1 text-[12px] outline-none px-1 py-0.5"
            />
            <span className="text-[10px] text-slate-400 pr-1">Esc</span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-2 py-4 text-center text-[11px] text-slate-400">无匹配</div>
            )}
            {filtered.map((t, i) => {
              const active = i === activeIdx
              return (
                <button
                  key={t.id}
                  onClick={() => pickFromSearch(t.id)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={
                    'w-full flex items-center gap-2 px-2 py-1 rounded text-[12px] text-left ' +
                    (active ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100')
                  }
                >
                  <span className="inline-flex w-5 justify-center">{t.icon}</span>
                  <span className="flex-1 truncate">{t.label}</span>
                  {t.key && (
                    <span
                      className={
                        'text-[10px] px-1.5 py-0.5 rounded border ' +
                        (active
                          ? 'border-white/50 text-white/90'
                          : 'border-slate-200 text-slate-400')
                      }
                    >
                      {t.key}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </aside>
  )
}
