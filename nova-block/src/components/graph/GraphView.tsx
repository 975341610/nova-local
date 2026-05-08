import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ZoomIn, ZoomOut, Locate, Share2, Orbit as OrbitIcon } from 'lucide-react'
import type { Note } from '../../lib/types'

interface GraphViewProps {
  notes: Note[]
  currentNoteId: number | null
  isOpen: boolean
  onClose: () => void
  onSelectNote: (id: number) => void
  /** v0.21.5 · 切换到概念轨道视图 */
  onSwitchToOrbit?: () => void
}

type GraphNode = {
  id: number
  title: string
  x: number
  y: number
  vx: number
  vy: number
  degree: number
  isCurrent: boolean
}

type GraphEdge = {
  source: number
  target: number
}

/**
 * 极简本地力导向图。
 * - 不引入 d3 / cytoscape 依赖，纯手写物理模拟（<200 行）
 * - 规模：<500 节点时平滑；大于此规模退化为快速收敛
 */
export function GraphView({
  notes,
  currentNoteId,
  isOpen,
  onClose,
  onSelectNote,
  onSwitchToOrbit,
}: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  const transformRef = useRef({ scale: 1, tx: 0, ty: 0 })
  const draggingRef = useRef<{
    id: number
    offsetX: number
    offsetY: number
    startSx: number
    startSy: number
    startTime: number
    moved: boolean
  } | null>(null)
  const panningRef = useRef<{ startX: number; startY: number; tx0: number; ty0: number } | null>(null)
  const [hoverNodeId, setHoverNodeId] = useState<number | null>(null)

  // v0.21.5 · 点击 vs 拖拽 判定阈值
  // - 移动距离 < 4px 且按下时间 < 250ms → 视为点击,触发打开笔记
  // - 否则视为拖拽,松开后停留在当前位置,不打开笔记
  const CLICK_DIST_THRESHOLD = 4
  const CLICK_TIME_THRESHOLD = 250

  // 构建初始图数据
  const { initialNodes, initialEdges } = useMemo(() => {
    const validNotes = notes.filter((n) => !n.is_folder)
    const idSet = new Set(validNotes.map((n) => n.id))
    const W = 800
    const H = 600
    const nodes: GraphNode[] = validNotes.map((note, i) => {
      const angle = (i / Math.max(1, validNotes.length)) * Math.PI * 2
      const radius = Math.min(W, H) * 0.35
      return {
        id: note.id,
        title: note.title || 'Untitled',
        x: W / 2 + Math.cos(angle) * radius,
        y: H / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        degree: 0,
        isCurrent: note.id === currentNoteId,
      }
    })
    const edges: GraphEdge[] = []
    for (const note of validNotes) {
      const links = note.links ?? []
      for (const tId of links) {
        if (tId === note.id) continue
        if (!idSet.has(tId)) continue
        edges.push({ source: note.id, target: tId })
      }
    }
    // degree
    const degMap = new Map<number, number>()
    for (const e of edges) {
      degMap.set(e.source, (degMap.get(e.source) ?? 0) + 1)
      degMap.set(e.target, (degMap.get(e.target) ?? 0) + 1)
    }
    for (const n of nodes) {
      n.degree = degMap.get(n.id) ?? 0
    }
    return { initialNodes: nodes, initialEdges: edges }
  }, [notes, currentNoteId])

  useEffect(() => {
    if (!isOpen) return
    nodesRef.current = initialNodes.map((n) => ({ ...n }))
    edgesRef.current = initialEdges.map((e) => ({ ...e }))
    transformRef.current = { scale: 1, tx: 0, ty: 0 }
  }, [isOpen, initialNodes, initialEdges])

  // 物理模拟
  useEffect(() => {
    if (!isOpen) return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const w = parent.clientWidth
      const h = parent.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    resize()
    window.addEventListener('resize', resize)

    let tick = 0
    const loop = () => {
      tick += 1
      const nodes = nodesRef.current
      const edges = edgesRef.current

      // 冷却系数：开始时跑 300 帧大幅收敛，之后低温持续微调
      const alpha = Math.max(0.05, Math.exp(-tick / 180))

      // 库仑斥力 O(n^2)，500 节点以内安全
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let d2 = dx * dx + dy * dy
          if (d2 < 0.01) {
            dx = Math.random() - 0.5
            dy = Math.random() - 0.5
            d2 = dx * dx + dy * dy
          }
          const d = Math.sqrt(d2)
          const force = (800 * alpha) / d2
          const fx = (dx / d) * force
          const fy = (dy / d) * force
          a.vx -= fx
          a.vy -= fy
          b.vx += fx
          b.vy += fy
        }
      }

      // 边吸引（弹簧）
      for (const e of edges) {
        const a = nodes.find((n) => n.id === e.source)
        const b = nodes.find((n) => n.id === e.target)
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const target = 90
        const strength = 0.04 * alpha
        const force = (d - target) * strength
        const fx = (dx / d) * force
        const fy = (dy / d) * force
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }

      // 中心重力
      const cx = canvas.width / (2 * dpr)
      const cy = canvas.height / (2 * dpr)
      for (const n of nodes) {
        n.vx += (cx - n.x) * 0.002 * alpha
        n.vy += (cy - n.y) * 0.002 * alpha
        n.vx *= 0.85
        n.vy *= 0.85
        if (!draggingRef.current || draggingRef.current.id !== n.id) {
          n.x += n.vx
          n.y += n.vy
        }
      }

      render()
      rafRef.current = requestAnimationFrame(loop)
    }

    const render = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

      const { scale, tx, ty } = transformRef.current
      ctx.translate(tx, ty)
      ctx.scale(scale, scale)

      // edges
      ctx.lineWidth = 1
      ctx.strokeStyle = getCssVar('--nv-color-border-strong', 'rgba(0,0,0,0.2)')
      for (const e of edgesRef.current) {
        const a = nodesRef.current.find((n) => n.id === e.source)
        const b = nodesRef.current.find((n) => n.id === e.target)
        if (!a || !b) continue
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      // nodes
      for (const n of nodesRef.current) {
        const r = Math.max(4, Math.min(16, 4 + Math.sqrt(n.degree) * 3))
        const isHover = hoverNodeId === n.id
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = n.isCurrent
          ? getCssVar('--nv-color-accent', '#c07a3f')
          : isHover
          ? getCssVar('--nv-color-accent-muted', 'rgba(192,122,63,0.2)')
          : getCssVar('--nv-color-surface-3', '#fff')
        ctx.fill()
        ctx.lineWidth = n.isCurrent ? 2 : 1
        ctx.strokeStyle = n.isCurrent
          ? getCssVar('--nv-color-accent-fg', '#4a2a10')
          : getCssVar('--nv-color-border-strong', 'rgba(0,0,0,0.2)')
        ctx.stroke()

        if (isHover || n.isCurrent || n.degree >= 2) {
          ctx.fillStyle = getCssVar('--nv-color-fg', '#222')
          ctx.font = '11px var(--nv-font-sans), sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          const label = n.title.length > 18 ? n.title.slice(0, 17) + '…' : n.title
          ctx.fillText(label, n.x, n.y + r + 4)
        }
      }
      ctx.restore()
    }

    loop()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [isOpen, hoverNodeId])

  const screenToGraph = useCallback((sx: number, sy: number) => {
    const { scale, tx, ty } = transformRef.current
    return { x: (sx - tx) / scale, y: (sy - ty) / scale }
  }, [])

  const findNodeAt = useCallback(
    (sx: number, sy: number) => {
      const { x, y } = screenToGraph(sx, sy)
      for (const n of nodesRef.current) {
        const r = Math.max(4, Math.min(16, 4 + Math.sqrt(n.degree) * 3))
        if ((n.x - x) ** 2 + (n.y - y) ** 2 <= (r + 2) ** 2) {
          return n
        }
      }
      return null
    },
    [screenToGraph],
  )

  const onMouseDown = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const hit = findNodeAt(sx, sy)
    if (hit) {
      const g = screenToGraph(sx, sy)
      draggingRef.current = {
        id: hit.id,
        offsetX: g.x - hit.x,
        offsetY: g.y - hit.y,
        startSx: sx,
        startSy: sy,
        startTime: performance.now(),
        moved: false,
      }
    } else {
      panningRef.current = {
        startX: sx,
        startY: sy,
        tx0: transformRef.current.tx,
        ty0: transformRef.current.ty,
      }
    }
  }

  const onMouseMove = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (draggingRef.current) {
      const drag = draggingRef.current
      // 先计算位移,只有超过阈值才视作实际拖动
      const dx = sx - drag.startSx
      const dy = sy - drag.startSy
      if (!drag.moved && dx * dx + dy * dy > CLICK_DIST_THRESHOLD * CLICK_DIST_THRESHOLD) {
        drag.moved = true
      }
      // 只有已判定为拖动后才真正移动节点,避免"抖一下就飘"
      if (drag.moved) {
        const g = screenToGraph(sx, sy)
        const node = nodesRef.current.find((n) => n.id === drag.id)
        if (node) {
          node.x = g.x - drag.offsetX
          node.y = g.y - drag.offsetY
          node.vx = 0
          node.vy = 0
        }
      }
      return
    }
    if (panningRef.current) {
      transformRef.current.tx = panningRef.current.tx0 + (sx - panningRef.current.startX)
      transformRef.current.ty = panningRef.current.ty0 + (sy - panningRef.current.startY)
      return
    }

    const hit = findNodeAt(sx, sy)
    setHoverNodeId(hit?.id ?? null)
  }

  const onMouseUp = (e: React.MouseEvent) => {
    const drag = draggingRef.current
    const pan = panningRef.current
    draggingRef.current = null
    panningRef.current = null

    if (drag) {
      // v0.21.5 · 综合"位移 + 时间"判定:仅在未达到拖动阈值且停留短暂时才视为点击
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const dx = sx - drag.startSx
      const dy = sy - drag.startSy
      const dist2 = dx * dx + dy * dy
      const elapsed = performance.now() - drag.startTime
      const isClick =
        !drag.moved &&
        dist2 < CLICK_DIST_THRESHOLD * CLICK_DIST_THRESHOLD &&
        elapsed < CLICK_TIME_THRESHOLD
      if (isClick) {
        const hit = findNodeAt(sx, sy)
        if (hit && hit.id === drag.id) {
          onSelectNote(hit.id)
        }
      }
      // 非 click 场景:保持节点当前位置,不打开笔记
    }
    void pan
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.92 : 1.08
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { scale, tx, ty } = transformRef.current
    const newScale = Math.max(0.3, Math.min(3, scale * delta))
    // 以鼠标位置为缩放中心
    transformRef.current.tx = sx - ((sx - tx) / scale) * newScale
    transformRef.current.ty = sy - ((sy - ty) / scale) * newScale
    transformRef.current.scale = newScale
  }

  const zoom = (factor: number) => {
    const t = transformRef.current
    t.scale = Math.max(0.3, Math.min(3, t.scale * factor))
  }

  const recenter = () => {
    transformRef.current = { scale: 1, tx: 0, ty: 0 }
  }

  // v0.21.5 · 键盘快捷键: Tab / G / O 在图谱 ↔ 轨道 之间切换;Esc 关闭
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      // 忽略输入框中的按键
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' || e.key === 'o' || e.key === 'O') {
        if (onSwitchToOrbit) {
          e.preventDefault()
          onSwitchToOrbit()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose, onSwitchToOrbit])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="graph-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[95]"
          style={{
            background: 'color-mix(in srgb, var(--nv-color-bg) 92%, transparent)',
          }}
        >
          <motion.div
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="absolute inset-6 nv-glass overflow-hidden"
            style={{ display: 'flex', flexDirection: 'column' }}
          >
            {/* Header */}
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 18px',
                borderBottom: '1px solid var(--nv-color-border)',
              }}
            >
              <Share2 size={16} style={{ color: 'var(--nv-color-accent)' }} />
              <div style={{ fontWeight: 600, fontSize: 14 }}>Graph View</div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--nv-color-fg-subtle)',
                  marginLeft: 8,
                }}
              >
                {nodesRef.current.length || initialNodes.length} 节点 ·{' '}
                {edgesRef.current.length || initialEdges.length} 条链接
              </div>
              <div style={{ flex: 1 }} />
              {onSwitchToOrbit && (
                <button
                  className="nv-panel-pill"
                  onClick={onSwitchToOrbit}
                  title="切换到概念轨道 (Tab / O)"
                  style={{
                    padding: '4px 10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                  }}
                >
                  <OrbitIcon size={13} /> 切换到轨道
                </button>
              )}
              <button className="nv-icon-btn" onClick={() => zoom(1.2)} title="放大">
                <ZoomIn size={14} />
              </button>
              <button className="nv-icon-btn" onClick={() => zoom(0.83)} title="缩小">
                <ZoomOut size={14} />
              </button>
              <button className="nv-icon-btn" onClick={recenter} title="居中">
                <Locate size={14} />
              </button>
              <button className="nv-icon-btn" onClick={onClose} title="关闭 Esc">
                <X size={14} />
              </button>
            </header>

            {/* Canvas */}
            <div style={{ flex: 1, position: 'relative' }}>
              <canvas
                ref={canvasRef}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={() => {
                  draggingRef.current = null
                  panningRef.current = null
                  setHoverNodeId(null)
                }}
                onWheel={onWheel}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  cursor: hoverNodeId ? 'pointer' : 'grab',
                }}
              />
              {initialNodes.length === 0 && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--nv-color-fg-subtle)',
                    fontSize: 14,
                  }}
                >
                  还没有笔记可以展示。
                </div>
              )}
            </div>

            {/* Footer hint */}
            <footer
              style={{
                padding: '8px 18px',
                fontSize: 11,
                color: 'var(--nv-color-fg-subtle)',
                borderTop: '1px solid var(--nv-color-border)',
                display: 'flex',
                gap: 14,
              }}
            >
              <span>拖拽节点重新排布</span>
              <span>滚轮缩放</span>
              <span>空白区域拖动可平移</span>
              <span>单击节点跳转</span>
              {onSwitchToOrbit && <span>Tab / O 切换到概念轨道</span>}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function getCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const val = getComputedStyle(document.documentElement).getPropertyValue(name)
  return val && val.trim() ? val.trim() : fallback
}

export default GraphView
