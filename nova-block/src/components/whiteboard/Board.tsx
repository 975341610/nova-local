/**
 * v0.21.6 · Board
 * 单一 SVG 画布, 承载 grid / strokes / edges / nodes / selection.
 * 使用 <g transform="translate(vx,vy) scale(z)"> 承载视口变换.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ToolId } from './Toolbar'
import type { WhiteboardStore, WhiteboardState } from '../../store/whiteboard/whiteboardStore'
import {
  DEFAULT_EDGE_STROKE,
  DEFAULT_EDGE_STROKE_WIDTH,
  DEFAULT_NODE_FILL,
  DEFAULT_NODE_FONT_SIZE,
  DEFAULT_NODE_STROKE,
  DEFAULT_NODE_STROKE_WIDTH,
  newId,
  type FlowEdge,
  type FlowNode,
  type Stroke,
} from '../../lib/whiteboard/types'
import { pointsToPath, resolveAnchor, routeCurve, routeOrthogonalWithWaypoints } from '../../lib/whiteboard/orthogonalRouter'
import { shapePath, cylinderMainPath, bubbleTailPath } from '../../lib/whiteboard/shapeGeometry'
import { PlantUmlPreview } from './PlantUmlPreview'
import { MiniMap } from './MiniMap'

interface Props {
  store: WhiteboardStore
  state: WhiteboardState
  tool: ToolId
  onToolChange: (t: ToolId) => void
}

interface PendingStroke {
  color: string
  size: number
  points: Array<[number, number]>
  tool?: 'pen' | 'marker'
  opacity?: number
}

interface Marquee {
  x0: number
  y0: number
  x1: number
  y1: number
}

const GRID = 20

// v0.21.17 · 表格列宽工具: 归一化 ratios / 累积偏移
function tableColRatios(n: FlowNode): number[] {
  const rows = n.cells && n.cells.length > 0 ? n.cells : [['']]
  const cols = Math.max(1, ...rows.map((r) => r.length))
  const cw = n.colWidths
  if (!cw || cw.length !== cols || cw.some((v) => !isFinite(v) || v <= 0)) {
    return Array.from({ length: cols }, () => 1 / cols)
  }
  const sum = cw.reduce((a, b) => a + b, 0)
  return sum > 0 ? cw.map((v) => v / sum) : Array.from({ length: cols }, () => 1 / cols)
}

function tableColLefts(n: FlowNode): { lefts: number[]; widths: number[] } {
  const ratios = tableColRatios(n)
  const widths = ratios.map((r) => r * n.w)
  const lefts: number[] = []
  let acc = 0
  for (const w of widths) {
    lefts.push(acc)
    acc += w
  }
  return { lefts, widths }
}

function colIndexAt(n: FlowNode, relX: number): number {
  const { lefts, widths } = tableColLefts(n)
  for (let i = 0; i < lefts.length; i++) {
    if (relX < lefts[i] + widths[i]) return i
  }
  return lefts.length - 1
}

// v0.21.18 · 点到线段距离 (edge hit-test)
function pointToSegmentDistance(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const len2 = vx * vx + vy * vy
  if (len2 < 1e-6) return Math.hypot(px - a.x, py - a.y)
  let t = ((px - a.x) * vx + (py - a.y) * vy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * vx), py - (a.y + t * vy))
}

// v0.21.18 · 剪贴板载体: 包一层 magic 方便识别
const WB_CLIPBOARD_MAGIC = 'wb-clip-v1'
interface WbClipboardPayload {
  magic: typeof WB_CLIPBOARD_MAGIC
  nodes: FlowNode[]
}

async function wbClipboardWrite(payload: { nodes: FlowNode[] }): Promise<void> {
  const full: WbClipboardPayload = { magic: WB_CLIPBOARD_MAGIC, nodes: payload.nodes }
  const json = JSON.stringify(full)
  try {
    localStorage.setItem('wb.clipboard.v1', json)
  } catch {
    /* ignore quota */
  }
  // OS 剪贴板 (支持跨 Modal / 跨 tab 粘贴)
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json)
    }
  } catch {
    /* 权限拒绝 -> 仅保留 localStorage */
  }
}

async function wbClipboardRead(): Promise<{ nodes: FlowNode[] } | null> {
  // 先尝试 OS 剪贴板
  try {
    if (navigator.clipboard?.readText) {
      const raw = await navigator.clipboard.readText()
      if (raw) {
        const obj = JSON.parse(raw) as Partial<WbClipboardPayload>
        if (obj?.magic === WB_CLIPBOARD_MAGIC && Array.isArray(obj.nodes)) {
          return { nodes: obj.nodes as FlowNode[] }
        }
      }
    }
  } catch {
    /* 非 JSON 或权限拒绝 -> 落 localStorage */
  }
  try {
    const raw = localStorage.getItem('wb.clipboard.v1')
    if (!raw) return null
    const obj = JSON.parse(raw) as Partial<WbClipboardPayload> & { nodes?: FlowNode[] }
    if (Array.isArray(obj.nodes)) return { nodes: obj.nodes as FlowNode[] }
  } catch {
    /* ignore */
  }
  return null
}

function arrowMarkerUrl(
  style: 'none' | 'arrow' | 'triangle' | 'dot' | 'diamond' | undefined,
  end: 'start' | 'end',
): string | undefined {
  if (!style || style === 'none') return undefined
  const suffix = end === 'start' ? '-start' : ''
  switch (style) {
    case 'arrow':
      return end === 'start' ? 'url(#wb-arrow-start)' : 'url(#wb-arrow)'
    case 'triangle':
      return `url(#wb-triangle${suffix})`
    case 'dot':
      return `url(#wb-dot${suffix})`
    case 'diamond':
      return `url(#wb-diamond${suffix})`
  }
  return undefined
}

export function Board({ store, state, tool, onToolChange }: Props) {
  const { data, selectedIds } = state
  const viewport = data.viewport ?? { x: 0, y: 0, zoom: 1 }
  const svgRef = useRef<SVGSVGElement>(null)
  const [wrapSize, setWrapSize] = useState({ w: 800, h: 600 })
  const [pending, setPending] = useState<PendingStroke | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const [edgeStart, setEdgeStart] = useState<string | null>(null)
  const [hoverAt, setHoverAt] = useState<{ x: number; y: number } | null>(null)
  const [editingText, setEditingText] = useState<{ id: string; value: string } | null>(null)
  // v0.21.15 · 表格单元格双击就地编辑
  const [editingCell, setEditingCell] = useState<{
    id: string
    row: number
    col: number
    value: string
  } | null>(null)
  // v0.21.10 · 连线 label 双击编辑
  const [editingEdgeLabel, setEditingEdgeLabel] = useState<{
    id: string
    value: string
    x: number
    y: number
  } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  // A5 · 吸附引导线 (在拖拽过程中高亮)
  const [guides, setGuides] = useState<Array<{ kind: 'v' | 'h'; at: number }>>([])

  // v0.21.16 · 右键菜单
  const [ctxMenu, setCtxMenu] = useState<{
    screenX: number
    screenY: number
    worldX: number
    worldY: number
    target: { kind: 'node'; id: string } | { kind: 'edge'; id: string } | { kind: 'blank' }
  } | null>(null)

  // v0.21.16 · 图片裁剪模式 (简易 crop rect overlay)
  const [cropping, setCropping] = useState<{ id: string } | null>(null)

  // v0.21.17 · 快捷键帮助浮层 (按 ? 打开)
  const [helpOpen, setHelpOpen] = useState(false)

  // v0.21.16 · 监听来自 Inspector 的 "开始裁剪" 自定义事件
  useEffect(() => {
    function onCrop(e: Event) {
      const ev = e as CustomEvent<{ id: string }>
      if (ev.detail?.id) setCropping({ id: ev.detail.id })
    }
    window.addEventListener('wb:start-crop', onCrop as EventListener)
    return () => window.removeEventListener('wb:start-crop', onCrop as EventListener)
  }, [])

  // v0.21.17 · ? 打开/关闭快捷键帮助
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        const t = document.activeElement as HTMLElement | null
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
        e.preventDefault()
        setHelpOpen((v) => !v)
      } else if (e.key === 'Escape' && helpOpen) {
        setHelpOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [helpOpen])

  useLayoutEffect(() => {
    const el = svgRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setWrapSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Space → 暂时进入 hand
  useEffect(() => {
    function onDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      const t = document.activeElement as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      setSpaceDown(true)
    }
    function onUp(e: KeyboardEvent) {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  // A6 · ⌘0 = fit to content, ⌘1 = reset 100%
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      const t = document.activeElement as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === '0') {
        e.preventDefault()
        const ns = store.getState().data.nodes
        if (ns.length === 0) {
          store.setViewport({ x: 0, y: 0, zoom: 1 })
          return
        }
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity
        for (const n of ns) {
          minX = Math.min(minX, n.x)
          minY = Math.min(minY, n.y)
          maxX = Math.max(maxX, n.x + n.w)
          maxY = Math.max(maxY, n.y + n.h)
        }
        const pad = 40
        const cw = svgRef.current?.clientWidth ?? 800
        const ch = svgRef.current?.clientHeight ?? 600
        const bw = maxX - minX + pad * 2
        const bh = maxY - minY + pad * 2
        const zoom = Math.max(0.25, Math.min(3, Math.min(cw / bw, ch / bh)))
        const vx = (cw - (maxX + minX) * zoom) / 2
        const vy = (ch - (maxY + minY) * zoom) / 2
        store.setViewport({ x: vx, y: vy, zoom })
      } else if (e.key === '1') {
        e.preventDefault()
        store.setViewport({ x: 0, y: 0, zoom: 1 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store])

  // 切换工具时清理 edge 起点
  useEffect(() => {
    if (tool !== 'edge') setEdgeStart(null)
  }, [tool])

  // v0.21.18 · Ctrl+C / Ctrl+X / Ctrl+V / Delete / Ctrl+A 快捷键
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = document.activeElement as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 'c' || e.key === 'C')) {
        const { data: d, selectedIds: sel } = store.getState()
        if (sel.length === 0) return
        const nodes = d.nodes.filter((n) => sel.includes(n.id))
        if (nodes.length === 0) return
        e.preventDefault()
        wbClipboardWrite({ nodes })
      } else if (mod && (e.key === 'x' || e.key === 'X')) {
        const { data: d, selectedIds: sel } = store.getState()
        if (sel.length === 0) return
        const nodes = d.nodes.filter((n) => sel.includes(n.id))
        if (nodes.length === 0) return
        e.preventDefault()
        wbClipboardWrite({ nodes })
        store.removeSelected()
      } else if (mod && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        wbClipboardRead().then((payload) => {
          if (!payload || !payload.nodes || payload.nodes.length === 0) return
          const base = payload.nodes[0]
          const ids: string[] = []
          for (const src of payload.nodes) {
            const copy: FlowNode = {
              ...src,
              id: newId(),
              x: src.x - base.x + 40,
              y: src.y - base.y + 40,
            }
            store.addNode(copy)
            ids.push(copy.id)
          }
          store.select(ids)
        })
      } else if (mod && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        const d = store.getState().data
        store.select(d.nodes.map((n) => n.id))
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = store.getState().selectedIds
        if (sel.length === 0) return
        e.preventDefault()
        store.removeSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store])

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const rect = svgRef.current!.getBoundingClientRect()
      return {
        x: (sx - rect.left - viewport.x) / viewport.zoom,
        y: (sy - rect.top - viewport.y) / viewport.zoom,
      }
    },
    [viewport.x, viewport.y, viewport.zoom],
  )

  // 用 ref 存最新 viewport, 供原生 wheel listener 读取
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport

  // wheel 必须使用原生 non-passive 监听, 否则 preventDefault 无效
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      const vp = viewportRef.current
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = -e.deltaY * 0.0015
        const nextZoom = Math.max(0.25, Math.min(3, vp.zoom * (1 + delta)))
        const rect = svg.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        const worldX = (cx - vp.x) / vp.zoom
        const worldY = (cy - vp.y) / vp.zoom
        const nx = cx - worldX * nextZoom
        const ny = cy - worldY * nextZoom
        store.setViewport({ x: nx, y: ny, zoom: nextZoom })
        return
      }
      // 无修饰 → 平移 (支持触控板双指)
      e.preventDefault()
      store.setViewport({
        x: vp.x - e.deltaX,
        y: vp.y - e.deltaY,
        zoom: vp.zoom,
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [store])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || spaceDown || tool === 'hand') {
        // pan
        const start = { x: e.clientX, y: e.clientY }
        const v0 = { ...viewport }
        const move = (ev: MouseEvent) => {
          store.setViewport({
            x: v0.x + (ev.clientX - start.x),
            y: v0.y + (ev.clientY - start.y),
            zoom: v0.zoom,
          })
        }
        const up = () => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
        return
      }

      const { x, y } = screenToWorld(e.clientX, e.clientY)

      if (tool === 'pen') {
        setPending({
          color: '#1f2937',
          size: 2.5,
          points: [[x, y]],
          tool: 'pen',
          opacity: 1,
        })
        return
      }

      if (tool === 'marker') {
        // v0.21.11 · 高亮笔: 较粗 + 低透明 + multiply 混合
        setPending({
          color: '#facc15',
          size: 14,
          points: [[x, y]],
          tool: 'marker',
          opacity: 0.35,
        })
        return
      }

      if (tool === 'eraser') {
        // click笔画 → 移除
        const idx = data.strokes.findIndex((s) => strokeHit(s, x, y))
        if (idx >= 0) {
          const next = data.strokes.slice()
          next.splice(idx, 1)
          store.replace({ ...data, strokes: next })
        }
        return
      }

      if (tool === 'text') {
        // v0.21.10 · 文本工具: 落下无填充无描边的 text 节点 + 自动进入编辑
        const w = 160
        const h = 36
        const node: FlowNode = {
          id: newId(),
          x: snap(x) - w / 2,
          y: snap(y) - h / 2,
          w,
          h,
          text: '文本',
          shape: 'text',
          fill: 'transparent',
          stroke: 'transparent',
          strokeWidth: 0,
          fontSize: 16,
        }
        store.addNode(node)
        store.select([node.id])
        setEditingText({ id: node.id, value: node.text })
        onToolChange('select')
        return
      }

      if (tool.startsWith('node-')) {
        const shape = tool.replace('node-', '') as FlowNode['shape']
        // v0.21.14 · 图片: 触发文件选择, 读到 dataURL 后再落节点
        if (shape === 'image') {
          const inp = document.createElement('input')
          inp.type = 'file'
          inp.accept = 'image/*'
          inp.onchange = async () => {
            const f = inp.files?.[0]
            if (!f) {
              onToolChange('select')
              return
            }
            const reader = new FileReader()
            reader.onload = () => {
              const src = typeof reader.result === 'string' ? reader.result : ''
              if (!src) {
                onToolChange('select')
                return
              }
              const probe = new Image()
              probe.onload = () => {
                const maxW = 320
                const ratio = probe.naturalHeight / Math.max(1, probe.naturalWidth)
                const w = Math.min(maxW, probe.naturalWidth || maxW)
                const h = Math.max(40, Math.round(w * ratio))
                const node: FlowNode = {
                  id: newId(),
                  x: snap(x) - w / 2,
                  y: snap(y) - h / 2,
                  w,
                  h,
                  text: '',
                  shape: 'image',
                  fill: 'transparent',
                  stroke: 'transparent',
                  strokeWidth: 0,
                  src,
                }
                store.addNode(node)
                store.select([node.id])
                onToolChange('select')
              }
              probe.onerror = () => onToolChange('select')
              probe.src = src
            }
            reader.readAsDataURL(f)
          }
          inp.click()
          return
        }
        let w: number
        let h: number
        switch (shape) {
          case 'sticky':
            w = 140
            h = 140
            break
          case 'plantuml':
            w = 260
            h = 180
            break
          case 'table':
            w = 240
            h = 120
            break
          case 'star':
          case 'triangle':
          case 'hexagon':
          case 'pentagon':
          case 'plus':
            w = 120
            h = 120
            break
          case 'cylinder':
            w = 140
            h = 100
            break
          case 'cloud':
            w = 160
            h = 100
            break
          case 'arrow-shape':
            w = 160
            h = 80
            break
          case 'bubble':
            w = 160
            h = 90
            break
          case 'parallelogram':
          case 'trapezoid':
            w = 160
            h = 64
            break
          default:
            w = 140
            h = 64
        }
        const node: FlowNode = {
          id: newId(),
          x: snap(x) - w / 2,
          y: snap(y) - h / 2,
          w,
          h,
          text:
            shape === 'sticky'
              ? '便签'
              : shape === 'plantuml'
                ? '@startuml\nAlice -> Bob : hi\nBob --> Alice : ok\n@enduml'
                : shape === 'table'
                  ? ''
                  : '节点',
          shape,
          ...(shape === 'table'
            ? {
                cells: [
                  ['表头 A', '表头 B', '表头 C'],
                  ['', '', ''],
                  ['', '', ''],
                ],
              }
            : {}),
        }
        store.addNode(node)
        store.select([node.id])
        onToolChange('select')
        return
      }

      if (tool === 'edge') {
        // 点空白取消连线起点
        if (edgeStart) setEdgeStart(null)
        return
      }

      if (tool === 'select') {
        // 点空白 → 开始 marquee
        const target = e.target as Element
        if (target === svgRef.current || target.classList?.contains('board-bg')) {
          setMarquee({ x0: x, y0: y, x1: x, y1: y })
          if (!e.shiftKey) store.clearSelection()
        }
      }
    },
    [data, edgeStart, onToolChange, screenToWorld, spaceDown, store, tool, viewport],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = screenToWorld(e.clientX, e.clientY)
      setHoverAt({ x, y })

      if (pending) {
        const last = pending.points[pending.points.length - 1]
        if (!last || Math.hypot(last[0] - x, last[1] - y) > 1.5) {
          setPending({ ...pending, points: [...pending.points, [x, y]] })
        }
        return
      }
      if (marquee) {
        setMarquee({ ...marquee, x1: x, y1: y })
      }
    },
    [pending, marquee, screenToWorld],
  )

  const handleMouseUp = useCallback(() => {
    if (pending && pending.points.length >= 2) {
      store.addStroke(pending as Stroke)
    }
    setPending(null)

    if (marquee) {
      const x = Math.min(marquee.x0, marquee.x1)
      const y = Math.min(marquee.y0, marquee.y1)
      const w = Math.abs(marquee.x1 - marquee.x0)
      const h = Math.abs(marquee.y1 - marquee.y0)
      if (w > 3 && h > 3) {
        const insideNodes = data.nodes
          .filter((n) => n.x >= x && n.y >= y && n.x + n.w <= x + w && n.y + n.h <= y + h)
          .map((n) => n.id)
        const insideSet = new Set(insideNodes)
        // v0.21.13 · 两端节点都在框内的连线一并选中
        const insideEdges = data.edges
          .filter((ed) => insideSet.has(ed.from) && insideSet.has(ed.to))
          .map((ed) => ed.id)
        // v0.21.13 · 框选范围内命中任一 group 时, 扩展到整组
        const groupsHit = new Set<string>()
        for (const nid of insideNodes) {
          const n = data.nodes.find((x) => x.id === nid)
          if (n?.group) groupsHit.add(n.group)
        }
        const finalNodes = new Set(insideNodes)
        if (groupsHit.size > 0) {
          for (const n of data.nodes) {
            if (n.group && groupsHit.has(n.group)) finalNodes.add(n.id)
          }
        }
        store.select([...finalNodes, ...insideEdges])
      }
      setMarquee(null)
    }
  }, [pending, marquee, data.nodes, data.edges, store])

  // node drag
  const draggingId = useRef<string | null>(null)
  const onNodeMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      if (tool === 'edge') {
        if (!edgeStart) {
          setEdgeStart(id)
        } else if (edgeStart !== id) {
          store.addEdge({
            id: newId(),
            from: edgeStart,
            to: id,
            routing: 'orthogonal',
            arrowEnd: 'arrow',
          } as FlowEdge)
          setEdgeStart(null)
          onToolChange('select')
        } else {
          setEdgeStart(null)
        }
        return
      }
      // v0.21.13 · 锁定节点仅可选中, 不触发拖拽
      const anchorLocked = data.nodes.find((n) => n.id === id)?.locked === true
      // select  (v0.21.13 · 分组联动: 单点属于分组时, 选中整组)
      const expandToGroup = (ids: string[]): string[] => {
        const groupsHit = new Set<string>()
        for (const nid of ids) {
          const n = data.nodes.find((x) => x.id === nid)
          if (n?.group) groupsHit.add(n.group)
        }
        if (groupsHit.size === 0) return ids
        const set = new Set(ids)
        for (const n of data.nodes) {
          if (n.group && groupsHit.has(n.group)) set.add(n.id)
        }
        return Array.from(set)
      }
      if (e.shiftKey) store.toggleSelect(id)
      else if (!selectedIds.includes(id)) store.select(expandToGroup([id]))

      if (anchorLocked) return

      draggingId.current = id
      const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY)
      store.beginDrag()
      const start = { wx, wy }
      const move = (ev: MouseEvent) => {
        const { x, y } = screenToWorld(ev.clientX, ev.clientY)
        let dx = x - start.wx
        let dy = y - start.wy
        const anchorNode = data.nodes.find((n) => n.id === id)
        if (!ev.shiftKey && anchorNode) {
          // A5 · 吸附: 对移动后的 anchor 节点,与其他非选中节点的 左/中/右 × 上/中/下 对齐
          const selected = new Set(selectedIds.length ? selectedIds : [id])
          const others = data.nodes.filter((n) => !selected.has(n.id))
          const targetX = anchorNode.x + dx
          const targetY = anchorNode.y + dy
          const SNAP = 6 / viewportRef.current.zoom
          let snapDx = 0
          let snapDy = 0
          const vGuides: number[] = []
          const hGuides: number[] = []
          const xCandidates = [
            { src: targetX, kind: 'left' },
            { src: targetX + anchorNode.w / 2, kind: 'center' },
            { src: targetX + anchorNode.w, kind: 'right' },
          ]
          const yCandidates = [
            { src: targetY, kind: 'top' },
            { src: targetY + anchorNode.h / 2, kind: 'center' },
            { src: targetY + anchorNode.h, kind: 'bottom' },
          ]
          let bestX = SNAP
          let bestY = SNAP
          for (const o of others) {
            const oxs = [o.x, o.x + o.w / 2, o.x + o.w]
            const oys = [o.y, o.y + o.h / 2, o.y + o.h]
            for (const c of xCandidates) {
              for (const ox of oxs) {
                const d = Math.abs(c.src - ox)
                if (d < bestX) {
                  bestX = d
                  snapDx = ox - c.src
                  vGuides.length = 0
                  vGuides.push(ox)
                } else if (d === bestX) {
                  vGuides.push(ox)
                }
              }
            }
            for (const c of yCandidates) {
              for (const oy of oys) {
                const d = Math.abs(c.src - oy)
                if (d < bestY) {
                  bestY = d
                  snapDy = oy - c.src
                  hGuides.length = 0
                  hGuides.push(oy)
                } else if (d === bestY) {
                  hGuides.push(oy)
                }
              }
            }
          }
          dx += snapDx
          dy += snapDy
          // 若未命中吸附, 再走 grid snap
          if (bestX >= SNAP) {
            const finalX = snap(anchorNode.x + dx)
            dx = finalX - anchorNode.x
          }
          if (bestY >= SNAP) {
            const finalY = snap(anchorNode.y + dy)
            dy = finalY - anchorNode.y
          }
          setGuides([
            ...vGuides.map((at) => ({ kind: 'v' as const, at })),
            ...hGuides.map((at) => ({ kind: 'h' as const, at })),
          ])
        } else {
          setGuides([])
        }
        store.dragBy(dx, dy)
      }
      const up = () => {
        store.endDrag()
        draggingId.current = null
        setGuides([])
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [data.nodes, edgeStart, onToolChange, screenToWorld, selectedIds, store, tool],
  )

  const onNodeDoubleClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      const n = data.nodes.find((x) => x.id === id)
      if (!n) return
      if (n.locked) return
      // v0.21.14 · 图片 不走普通 text 编辑器
      if (n.shape === 'image') return
      // v0.21.15 · 表格 → 命中哪个单元格就地编辑
      if (n.shape === 'table') {
        const rows = n.cells && n.cells.length > 0 ? n.cells : [['']]
        const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY)
        const relX = Math.max(0, Math.min(n.w - 1, wx - n.x))
        const relY = Math.max(0, Math.min(n.h - 1, wy - n.y))
        const col = colIndexAt(n, relX)
        const row = Math.min(rows.length - 1, Math.floor((relY / n.h) * rows.length))
        setEditingCell({
          id,
          row,
          col,
          value: rows[row]?.[col] ?? '',
        })
        return
      }
      setEditingText({ id, value: n.text })
    },
    [data.nodes, screenToWorld],
  )

  const onEdgeClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      store.select([id])
    },
    [store],
  )

  // A5' · edge waypoint drag (v0.21.8)
  // 单击中段的圆点拖动 → 在该段中点插入/更新 waypoint, 得到正交折线 detour
  const startWaypointDrag = useCallback(
    (edgeId: string, segIndex: number, e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const edge = data.edges.find((x) => x.id === edgeId)
      if (!edge) return
      const from = data.nodes.find((n) => n.id === edge.from)
      const to = data.nodes.find((n) => n.id === edge.to)
      if (!from || !to) return
      const basePts = routeOrthogonalWithWaypoints(
        from,
        to,
        edge.fromAnchor,
        edge.toAnchor,
        edge.waypoints ?? [],
      )
      if (segIndex < 0 || segIndex >= basePts.length - 1) return
      const segA = basePts[segIndex]
      const segB = basePts[segIndex + 1]
      const horizontal = Math.abs(segA.y - segB.y) < 0.01
      // 初始 waypoint = 该段中点
      const startWP = { x: (segA.x + segB.x) / 2, y: (segA.y + segB.y) / 2 }
      // 计算插入位置: 将 startWP 插入到 waypoints 的哪个 index
      const existing = edge.waypoints ?? []
      // 简单策略: 将该段中点附近作为新 waypoint, 并把它插入到与 segIndex 对应的位置.
      // 基础段数 = existing.length + 1; 所以 insertAt = segIndex (0..existing.length)
      const insertAt = Math.max(0, Math.min(existing.length, segIndex))
      const start = { sx: e.clientX, sy: e.clientY }
      store.beginDrag()
      const move = (ev: MouseEvent) => {
        const zoom = viewportRef.current.zoom
        const dx = (ev.clientX - start.sx) / zoom
        const dy = (ev.clientY - start.sy) / zoom
        // 横向段 → 拖动改变 y; 纵向段 → 拖动改变 x
        const next = horizontal
          ? { x: startWP.x, y: startWP.y + dy }
          : { x: startWP.x + dx, y: startWP.y }
        const nextWaypoints = [...existing]
        // 若 existing[insertAt] 已是"同方向"的 waypoint(拖过一次), 就替换; 否则插入
        const hit = existing[insertAt]
        if (
          hit &&
          ((horizontal && Math.abs(hit.x - startWP.x) < 2) ||
            (!horizontal && Math.abs(hit.y - startWP.y) < 2))
        ) {
          nextWaypoints[insertAt] = next
        } else {
          nextWaypoints.splice(insertAt, 0, next)
        }
        store.updateEdge(edgeId, { waypoints: nextWaypoints })
      }
      const up = () => {
        store.endDrag()
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [data.edges, data.nodes, store],
  )

  // 双击 edge → 清空 waypoints (回到自动布线)
  const clearEdgeWaypoints = useCallback(
    (edgeId: string) => {
      store.updateEdge(edgeId, { waypoints: [] })
    },
    [store],
  )

  // A2 · resize handles
  type ResizeDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  const startResize = useCallback(
    (dir: ResizeDir, id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const node = data.nodes.find((n) => n.id === id)
      if (!node) return
      const start = { wx: e.clientX, wy: e.clientY }
      const orig = { x: node.x, y: node.y, w: node.w, h: node.h }
      store.beginDrag()
      const move = (ev: MouseEvent) => {
        const zoom = viewportRef.current.zoom
        const dx = (ev.clientX - start.wx) / zoom
        const dy = (ev.clientY - start.wy) / zoom
        let nx = orig.x
        let ny = orig.y
        let nw = orig.w
        let nh = orig.h
        if (dir.includes('e')) nw = orig.w + dx
        if (dir.includes('s')) nh = orig.h + dy
        if (dir.includes('w')) {
          nw = orig.w - dx
          nx = orig.x + dx
        }
        if (dir.includes('n')) {
          nh = orig.h - dy
          ny = orig.y + dy
        }
        // uniform scale with Shift; v0.21.15 · 图片节点默认保持宽高比 (Alt 可取消)
        const keepRatio =
          ev.shiftKey || (node.shape === 'image' && !ev.altKey)
        if (keepRatio) {
          const ratio = orig.w / orig.h
          if (Math.abs(nw / (nh || 1) - ratio) > 0.01) {
            if (Math.abs(dx) > Math.abs(dy)) nh = nw / ratio
            else nw = nh * ratio
            if (dir.includes('w')) nx = orig.x + (orig.w - nw)
            if (dir.includes('n')) ny = orig.y + (orig.h - nh)
          }
        }
        // snap unless Alt
        if (!ev.altKey) {
          nx = snap(nx)
          ny = snap(ny)
          nw = Math.max(GRID, snap(nw))
          nh = Math.max(GRID, snap(nh))
        } else {
          nw = Math.max(10, nw)
          nh = Math.max(10, nh)
        }
        store.updateNode(id, { x: nx, y: ny, w: nw, h: nh })
      }
      const up = () => {
        store.endDrag()
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [data.nodes, store],
  )

  const cursor = useMemo(() => {
    if (spaceDown || tool === 'hand') return 'grab'
    if (tool === 'pen' || tool === 'marker') return 'crosshair'
    if (tool === 'text') return 'text'
    if (tool === 'eraser') return 'not-allowed'
    if (tool.startsWith('node-')) return 'copy'
    if (tool === 'edge') return 'crosshair'
    return 'default'
  }, [tool, spaceDown])

  // Grid pattern size based on zoom (>=0.6 visible)
  const showGrid = viewport.zoom > 0.5

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ cursor }}>
      <svg
        ref={svgRef}
        width={wrapSize.w}
        height={wrapSize.h}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => {
          e.preventDefault()
          const { x, y } = screenToWorld(e.clientX, e.clientY)
          // 命中节点 → node; 否则命中 edge (中心点近似) → edge; 否则 blank
          let target:
            | { kind: 'node'; id: string }
            | { kind: 'edge'; id: string }
            | { kind: 'blank' } = { kind: 'blank' }
          for (let i = data.nodes.length - 1; i >= 0; i--) {
            const n = data.nodes[i]
            if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) {
              target = { kind: 'node', id: n.id }
              // 若未选中, 右键自动选中
              if (!selectedIds.includes(n.id)) store.select([n.id])
              break
            }
          }
          if (target.kind === 'blank') {
            // v0.21.18 · 更精确的连线命中: 对折线所有段计算点到线段距离
            let bestEdgeId: string | null = null
            let bestDist = 12 / viewport.zoom
            for (const ed of data.edges) {
              const from = data.nodes.find((nn) => nn.id === ed.from)
              const to = data.nodes.find((nn) => nn.id === ed.to)
              if (!from || !to) continue
              const routing = ed.routing ?? 'orthogonal'
              let pts: Array<{ x: number; y: number }>
              if (routing === 'orthogonal') {
                pts = routeOrthogonalWithWaypoints(
                  from,
                  to,
                  ed.fromAnchor,
                  ed.toAnchor,
                  ed.waypoints ?? [],
                )
              } else {
                pts = [
                  resolveAnchor(from, ed.fromAnchor ?? 'auto', to),
                  resolveAnchor(to, ed.toAnchor ?? 'auto', from),
                ]
              }
              for (let i = 0; i < pts.length - 1; i++) {
                const d = pointToSegmentDistance(x, y, pts[i], pts[i + 1])
                if (d < bestDist) {
                  bestDist = d
                  bestEdgeId = ed.id
                }
              }
            }
            if (bestEdgeId) {
              target = { kind: 'edge', id: bestEdgeId }
              if (!selectedIds.includes(bestEdgeId)) store.select([bestEdgeId])
            }
          }
          setCtxMenu({ screenX: e.clientX, screenY: e.clientY, worldX: x, worldY: y, target })
        }}
        className="block select-none"
      >
        <defs>
          <pattern id="wb-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#e2e8f0" strokeWidth={1} />
          </pattern>
          <marker
            id="wb-arrow"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
          <marker
            id="wb-arrow-start"
            markerWidth="10"
            markerHeight="10"
            refX="1"
            refY="5"
            orient="auto"
          >
            <path d="M 10 0 L 0 5 L 10 10 z" fill="currentColor" />
          </marker>
          <marker
            id="wb-triangle"
            markerWidth="12"
            markerHeight="12"
            refX="10"
            refY="6"
            orient="auto"
          >
            <path d="M 0 0 L 12 6 L 0 12 z" fill="currentColor" stroke="currentColor" />
          </marker>
          <marker
            id="wb-triangle-start"
            markerWidth="12"
            markerHeight="12"
            refX="2"
            refY="6"
            orient="auto"
          >
            <path d="M 12 0 L 0 6 L 12 12 z" fill="currentColor" stroke="currentColor" />
          </marker>
          <marker
            id="wb-dot"
            markerWidth="10"
            markerHeight="10"
            refX="5"
            refY="5"
            orient="auto"
          >
            <circle cx="5" cy="5" r="3.5" fill="currentColor" />
          </marker>
          <marker
            id="wb-dot-start"
            markerWidth="10"
            markerHeight="10"
            refX="5"
            refY="5"
            orient="auto"
          >
            <circle cx="5" cy="5" r="3.5" fill="currentColor" />
          </marker>
          <marker
            id="wb-diamond"
            markerWidth="14"
            markerHeight="10"
            refX="12"
            refY="5"
            orient="auto"
          >
            <path d="M 0 5 L 7 0 L 14 5 L 7 10 Z" fill="currentColor" />
          </marker>
          <marker
            id="wb-diamond-start"
            markerWidth="14"
            markerHeight="10"
            refX="2"
            refY="5"
            orient="auto"
          >
            <path d="M 0 5 L 7 0 L 14 5 L 7 10 Z" fill="currentColor" />
          </marker>
        </defs>

        {/* world space */}
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
          {showGrid && (
            <rect
              className="board-bg"
              x={-5000}
              y={-5000}
              width={10000}
              height={10000}
              fill="url(#wb-grid)"
            />
          )}
          {!showGrid && (
            <rect
              className="board-bg"
              x={-5000}
              y={-5000}
              width={10000}
              height={10000}
              fill="transparent"
            />
          )}

          {/* strokes */}
          {data.strokes.map((s, i) => {
            const isMarker = s.tool === 'marker'
            const opacity = s.opacity ?? (isMarker ? 0.35 : 1)
            return (
              <path
                key={`s-${i}`}
                d={strokeToPath(s)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.size}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={opacity}
                style={isMarker ? { mixBlendMode: 'multiply' } : undefined}
              />
            )
          })}
          {pending && (
            <path
              d={strokeToPath(pending as Stroke)}
              fill="none"
              stroke={pending.color}
              strokeWidth={pending.size}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={pending.opacity ?? (pending.tool === 'marker' ? 0.35 : 0.8)}
              style={pending.tool === 'marker' ? { mixBlendMode: 'multiply' } : undefined}
            />
          )}

          {/* edges */}
          {data.edges.map((e) => {
            const from = data.nodes.find((n) => n.id === e.from)
            const to = data.nodes.find((n) => n.id === e.to)
            if (!from || !to) return null
            const routing = e.routing ?? 'orthogonal'
            let pts: { x: number; y: number }[]
            let d: string
            if (routing === 'curve') {
              const cr = routeCurve(from, to, e.fromAnchor, e.toAnchor)
              pts = cr.pts
              d = cr.d
            } else if (routing === 'orthogonal') {
              pts = routeOrthogonalWithWaypoints(from, to, e.fromAnchor, e.toAnchor, e.waypoints ?? [])
              d = pointsToPath(pts)
            } else {
              pts = [
                resolveAnchor(from, e.fromAnchor ?? 'auto', to),
                resolveAnchor(to, e.toAnchor ?? 'auto', from),
              ]
              d = pointsToPath(pts)
            }
            const selected = selectedIds.includes(e.id)
            const color = e.stroke ?? DEFAULT_EDGE_STROKE
            const endStyle = e.arrowEnd ?? 'arrow'
            const startStyle = e.arrowStart ?? 'none'
            const labelX = (pts[0].x + pts[pts.length - 1].x) / 2
            const labelY = (pts[0].y + pts[pts.length - 1].y) / 2
            return (
              <g key={e.id} onClick={(ev) => onEdgeClick(ev, e.id)} style={{ cursor: 'pointer' }}>
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(12, (e.strokeWidth ?? 1.5) + 10)}
                  onDoubleClick={(ev) => {
                    ev.stopPropagation()
                    // v0.21.10 · 双击连线空白段: 若已有 waypoints 清空; 否则进入 label 编辑
                    if (routing === 'orthogonal' && (e.waypoints ?? []).length > 0) {
                      clearEdgeWaypoints(e.id)
                      return
                    }
                    setEditingEdgeLabel({
                      id: e.id,
                      value: e.label ?? '',
                      x: labelX,
                      y: labelY,
                    })
                  }}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={(e.strokeWidth ?? DEFAULT_EDGE_STROKE_WIDTH) + (selected ? 1 : 0)}
                  markerEnd={arrowMarkerUrl(endStyle, 'end')}
                  markerStart={arrowMarkerUrl(startStyle, 'start')}
                  style={{ color }}
                />
                {e.label && (
                  <g
                    onDoubleClick={(ev) => {
                      ev.stopPropagation()
                      setEditingEdgeLabel({
                        id: e.id,
                        value: e.label ?? '',
                        x: labelX,
                        y: labelY,
                      })
                    }}
                  >
                    <rect
                      x={labelX - Math.max(20, e.label.length * 5)}
                      y={labelY - 11}
                      width={Math.max(40, e.label.length * 10)}
                      height={18}
                      fill="white"
                      fillOpacity={0.9}
                      stroke="#e2e8f0"
                      strokeWidth={0.5}
                      rx={3}
                    />
                    <text
                      x={labelX}
                      y={labelY + 3}
                      textAnchor="middle"
                      fontSize={11}
                      fill="#334155"
                    >
                      {e.label}
                    </text>
                  </g>
                )}
                {/* v0.21.8 · waypoint handles (仅在选中时显示, 正交路由) */}
                {selected && routing === 'orthogonal' &&
                  pts.slice(0, -1).map((a, i) => {
                    const b = pts[i + 1]
                    const mx = (a.x + b.x) / 2
                    const my = (a.y + b.y) / 2
                    const horizontal = Math.abs(a.y - b.y) < 0.01
                    // 段太短的不显示把手(< 10)
                    if (Math.hypot(b.x - a.x, b.y - a.y) < 10) return null
                    return (
                      <circle
                        key={`wp-${e.id}-${i}`}
                        cx={mx}
                        cy={my}
                        r={5 / viewport.zoom}
                        fill="#6366f1"
                        stroke="white"
                        strokeWidth={1.5 / viewport.zoom}
                        style={{ cursor: horizontal ? 'ns-resize' : 'ew-resize' }}
                        onMouseDown={(ev) => startWaypointDrag(e.id, i, ev)}
                      />
                    )
                  })}
              </g>
            )
          })}

          {/* edge preview */}
          {tool === 'edge' && edgeStart && hoverAt && (() => {
            const from = data.nodes.find((n) => n.id === edgeStart)
            if (!from) return null
            const p0 = resolveAnchor(from, 'auto', {
              id: '__cursor__',
              x: hoverAt.x,
              y: hoverAt.y,
              w: 0,
              h: 0,
              text: '',
              shape: 'rect',
            } as FlowNode)
            return (
              <path
                d={`M ${p0.x} ${p0.y} L ${hoverAt.x} ${hoverAt.y}`}
                stroke="#6366f1"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                fill="none"
              />
            )
          })()}

          {/* nodes */}
          {data.nodes.map((n) => (
            <NodeShape
              key={n.id}
              node={n}
              selected={selectedIds.includes(n.id)}
              edgeStart={edgeStart === n.id}
              onMouseDown={(e) => onNodeMouseDown(e, n.id)}
              onDoubleClick={(e) => onNodeDoubleClick(e, n.id)}
            />
          ))}

          {/* A2 · resize handles (single-select only, non-edge tool, 未锁定) */}
          {tool !== 'edge' && selectedIds.length === 1 && (() => {
            const n = data.nodes.find((x) => x.id === selectedIds[0])
            if (!n || n.locked) return null
            return (
              <ResizeHandles
                node={n}
                zoom={viewport.zoom}
                onResizeStart={(dir, e) => startResize(dir, n.id, e)}
              />
            )
          })()}

          {/* v0.21.16 · 表格行列加减按钮 (单选表格时) */}
          {tool !== 'edge' && selectedIds.length === 1 && (() => {
            const n = data.nodes.find((x) => x.id === selectedIds[0])
            if (!n || n.shape !== 'table' || n.locked) return null
            const rows = n.cells && n.cells.length > 0 ? n.cells : [['']]
            const nRows = rows.length
            const nCols = Math.max(1, ...rows.map((r) => r.length))
            const addRow = () => {
              const next = rows.map((r) => [...r])
              next.push(Array.from({ length: nCols }, () => ''))
              store.updateNode(n.id, { cells: next, h: n.h + n.h / nRows })
            }
            const removeRow = () => {
              if (nRows <= 1) return
              const next = rows.slice(0, -1).map((r) => [...r])
              store.updateNode(n.id, { cells: next, h: Math.max(40, n.h - n.h / nRows) })
            }
            const addCol = () => {
              const next = rows.map((r) => [...r, ''])
              // v0.21.17 · 扩展 colWidths: 新列按平均宽度追加
              const prev = tableColRatios(n)
              const avg = 1 / (prev.length + 1)
              const scale = (1 - avg)
              const nextCW = [...prev.map((r) => r * scale), avg]
              store.updateNode(n.id, { cells: next, w: n.w + n.w / nCols, colWidths: nextCW })
            }
            const removeCol = () => {
              if (nCols <= 1) return
              const next = rows.map((r) => r.slice(0, -1))
              // v0.21.17 · 同步收缩 colWidths, 再归一化
              const prev = tableColRatios(n)
              const trimmed = prev.slice(0, -1)
              const sum = trimmed.reduce((a, b) => a + b, 0)
              const nextCW = sum > 0 ? trimmed.map((r) => r / sum) : undefined
              store.updateNode(n.id, {
                cells: next,
                w: Math.max(60, n.w - n.w / nCols),
                colWidths: nextCW,
              })
            }
            return (
              <>
                <TableInlineControls
                  node={n}
                  zoom={viewport.zoom}
                  onAddRow={addRow}
                  onRemoveRow={removeRow}
                  onAddCol={addCol}
                  onRemoveCol={removeCol}
                />
                <TableColResizers
                  node={n}
                  zoom={viewport.zoom}
                  onResize={(ratios) => store.updateNode(n.id, { colWidths: ratios })}
                />
              </>
            )
          })()}

          {/* A5 · 吸附引导线 */}
          {guides.map((g, i) =>
            g.kind === 'v' ? (
              <line
                key={`vg-${i}`}
                x1={g.at}
                x2={g.at}
                y1={-5000}
                y2={5000}
                stroke="#a855f7"
                strokeWidth={1 / viewport.zoom}
                strokeDasharray="4 3"
                pointerEvents="none"
              />
            ) : (
              <line
                key={`hg-${i}`}
                x1={-5000}
                x2={5000}
                y1={g.at}
                y2={g.at}
                stroke="#a855f7"
                strokeWidth={1 / viewport.zoom}
                strokeDasharray="4 3"
                pointerEvents="none"
              />
            ),
          )}

          {/* marquee */}
          {marquee && (() => {
            const x = Math.min(marquee.x0, marquee.x1)
            const y = Math.min(marquee.y0, marquee.y1)
            const w = Math.abs(marquee.x1 - marquee.x0)
            const h = Math.abs(marquee.y1 - marquee.y0)
            return (
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill="rgba(99,102,241,0.08)"
                stroke="#6366f1"
                strokeDasharray="4 4"
              />
            )
          })()}
        </g>
      </svg>

      {/* text editor overlay */}
      {editingText && (() => {
        const n = data.nodes.find((x) => x.id === editingText.id)
        if (!n) return null
        const left = viewport.x + n.x * viewport.zoom
        const top = viewport.y + n.y * viewport.zoom
        const width = n.w * viewport.zoom
        const height = n.h * viewport.zoom
        return (
          <textarea
            autoFocus
            value={editingText.value}
            onChange={(e) => setEditingText({ ...editingText, value: e.target.value })}
            onBlur={() => {
              store.updateNode(editingText.id, { text: editingText.value })
              setEditingText(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditingText(null)
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                store.updateNode(editingText.id, { text: editingText.value })
                setEditingText(null)
              }
            }}
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              padding: 6,
              border: '2px solid #6366f1',
              borderRadius: 6,
              resize: 'none',
              outline: 'none',
              background: 'white',
              fontSize: (n.fontSize ?? DEFAULT_NODE_FONT_SIZE) * viewport.zoom,
            }}
          />
        )
      })()}

      {/* v0.21.15 · table cell editor overlay */}
      {editingCell && (() => {
        const n = data.nodes.find((x) => x.id === editingCell.id)
        if (!n || n.shape !== 'table') return null
        const rows = n.cells && n.cells.length > 0 ? n.cells : [['']]
        const cols = Math.max(1, ...rows.map((r) => r.length))
        const { lefts: colLefts, widths: colWs } = tableColLefts(n)
        const cellW = colWs[editingCell.col] ?? n.w / cols
        const cellX = colLefts[editingCell.col] ?? editingCell.col * (n.w / cols)
        const cellH = n.h / rows.length
        const left = viewport.x + (n.x + cellX) * viewport.zoom
        const top = viewport.y + (n.y + editingCell.row * cellH) * viewport.zoom
        const width = cellW * viewport.zoom
        const height = cellH * viewport.zoom
        const commit = (value: string) => {
          const out = rows.map((r) => [...r])
          while (out.length <= editingCell.row) out.push(Array.from({ length: cols }, () => ''))
          while (out[editingCell.row].length <= editingCell.col) out[editingCell.row].push('')
          out[editingCell.row][editingCell.col] = value
          store.updateNode(editingCell.id, { cells: out })
        }
        return (
          <input
            autoFocus
            value={editingCell.value}
            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
            onBlur={() => {
              commit(editingCell.value)
              setEditingCell(null)
            }}
            onKeyDown={(e) => {
              // v0.21.16 · 方向键在格间跳转 (仅在光标处于边界时才跳格, 否则走默认光标移动)
              const moveTo = (r: number, c: number) => {
                commit(editingCell.value)
                setEditingCell({
                  id: editingCell.id,
                  row: r,
                  col: c,
                  value: rows[r]?.[c] ?? '',
                })
              }
              const target = e.currentTarget as HTMLInputElement
              const atStart = target.selectionStart === 0 && target.selectionEnd === 0
              const atEnd =
                target.selectionStart === target.value.length &&
                target.selectionEnd === target.value.length
              if (e.key === 'Escape') {
                setEditingCell(null)
              } else if (e.key === 'Enter') {
                commit(editingCell.value)
                // v0.21.15 · Enter 下移一行, Tab 右移一列
                const nextRow = editingCell.row + 1 < rows.length ? editingCell.row + 1 : -1
                if (nextRow >= 0) {
                  setEditingCell({
                    id: editingCell.id,
                    row: nextRow,
                    col: editingCell.col,
                    value: rows[nextRow]?.[editingCell.col] ?? '',
                  })
                } else {
                  setEditingCell(null)
                }
              } else if (e.key === 'Tab') {
                e.preventDefault()
                commit(editingCell.value)
                if (e.shiftKey) {
                  const prevCol = editingCell.col - 1
                  if (prevCol >= 0)
                    moveTo(editingCell.row, prevCol)
                  else if (editingCell.row - 1 >= 0)
                    moveTo(editingCell.row - 1, cols - 1)
                  else setEditingCell(null)
                } else {
                  const nextCol = editingCell.col + 1 < cols ? editingCell.col + 1 : -1
                  if (nextCol >= 0) {
                    setEditingCell({
                      id: editingCell.id,
                      row: editingCell.row,
                      col: nextCol,
                      value: rows[editingCell.row]?.[nextCol] ?? '',
                    })
                  } else if (editingCell.row + 1 < rows.length) {
                    moveTo(editingCell.row + 1, 0)
                  } else {
                    setEditingCell(null)
                  }
                }
              } else if (e.key === 'ArrowLeft' && atStart && editingCell.col > 0) {
                e.preventDefault()
                moveTo(editingCell.row, editingCell.col - 1)
              } else if (e.key === 'ArrowRight' && atEnd && editingCell.col + 1 < cols) {
                e.preventDefault()
                moveTo(editingCell.row, editingCell.col + 1)
              } else if (e.key === 'ArrowUp' && editingCell.row > 0) {
                e.preventDefault()
                moveTo(editingCell.row - 1, editingCell.col)
              } else if (e.key === 'ArrowDown' && editingCell.row + 1 < rows.length) {
                e.preventDefault()
                moveTo(editingCell.row + 1, editingCell.col)
              }
            }}
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              padding: '2px 6px',
              border: '2px solid #6366f1',
              borderRadius: 2,
              outline: 'none',
              background: 'white',
              fontSize: Math.max(10, ((n.fontSize ?? DEFAULT_NODE_FONT_SIZE) - 2) * viewport.zoom),
              fontWeight: editingCell.row === 0 ? 600 : 400,
              boxSizing: 'border-box',
            }}
          />
        )
      })()}

      {/* edge label editor overlay (v0.21.10) */}
      {editingEdgeLabel && (() => {
        const { id, x, y, value } = editingEdgeLabel
        const left = viewport.x + x * viewport.zoom - 70
        const top = viewport.y + y * viewport.zoom - 14
        return (
          <input
            autoFocus
            value={value}
            onChange={(ev) =>
              setEditingEdgeLabel({ ...editingEdgeLabel, value: ev.target.value })
            }
            onBlur={() => {
              store.updateEdge(id, { label: value })
              setEditingEdgeLabel(null)
            }}
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') {
                setEditingEdgeLabel(null)
              } else if (ev.key === 'Enter') {
                store.updateEdge(id, { label: value })
                setEditingEdgeLabel(null)
              }
            }}
            placeholder="输入 label"
            style={{
              position: 'absolute',
              left,
              top,
              width: 140,
              padding: '2px 6px',
              border: '2px solid #6366f1',
              borderRadius: 4,
              outline: 'none',
              background: 'white',
              fontSize: 12,
              textAlign: 'center',
            }}
          />
        )
      })()}

      {/* zoom indicator + minimap */}
      <MiniMap
        data={data}
        viewport={viewport}
        canvasW={wrapSize.w}
        canvasH={wrapSize.h}
        setViewport={(v) => store.setViewport(v)}
      />

      {/* edge hint */}
      {tool === 'edge' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs bg-indigo-600 text-white px-3 py-1 rounded-full shadow">
          {edgeStart ? '点击终点节点 (或点空白取消)' : '点击起点节点'}
        </div>
      )}

      {/* v0.21.16 · 图片裁剪浮层 (简易 crop rect, 默认铺满, 拖角即裁) */}
      {cropping && (() => {
        const n = data.nodes.find((x) => x.id === cropping.id)
        if (!n || n.shape !== 'image') return null
        const left = viewport.x + n.x * viewport.zoom
        const top = viewport.y + n.y * viewport.zoom
        const width = n.w * viewport.zoom
        const height = n.h * viewport.zoom
        return (
          <ImageCropOverlay
            node={n}
            left={left}
            top={top}
            width={width}
            height={height}
            onCommit={(patch) => {
              store.updateNode(n.id, patch)
              setCropping(null)
            }}
            onCancel={() => setCropping(null)}
          />
        )
      })()}

      {/* v0.21.16 · 右键上下文菜单 */}
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          data={data}
          store={store}
          onClose={() => setCtxMenu(null)}
          onStartCrop={(id) => setCropping({ id })}
        />
      )}

      {/* v0.21.17 · 快捷键帮助按钮 + 浮层 */}
      <button
        title="快捷键帮助 (?)"
        onClick={() => setHelpOpen((v) => !v)}
        className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm text-sm"
      >
        ?
      </button>
      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  )
}

function snap(v: number) {
  return Math.round(v / GRID) * GRID
}
function strokeToPath(s: Stroke): string {
  if (s.points.length === 0) return ''
  const [h, ...rest] = s.points
  return `M ${h[0]} ${h[1]} ` + rest.map(([x, y]) => `L ${x} ${y}`).join(' ')
}
function strokeHit(s: Stroke, x: number, y: number): boolean {
  const r = Math.max(6, s.size * 2)
  return s.points.some(([px, py]) => Math.hypot(px - x, py - y) <= r)
}

interface NodeShapeProps {
  node: FlowNode
  selected: boolean
  edgeStart: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
}
function NodeShape({ node: n, selected, edgeStart, onMouseDown, onDoubleClick }: NodeShapeProps) {
  const fill = n.fill ?? n.color ?? DEFAULT_NODE_FILL[n.shape]
  const stroke = n.stroke ?? DEFAULT_NODE_STROKE
  const strokeWidth = n.strokeWidth ?? DEFAULT_NODE_STROKE_WIDTH
  const fontSize = n.fontSize ?? DEFAULT_NODE_FONT_SIZE
  const cx = n.x + n.w / 2
  const cy = n.y + n.h / 2

  const body = (() => {
    switch (n.shape) {
      case 'ellipse':
        return (
          <ellipse
            cx={cx}
            cy={cy}
            rx={n.w / 2}
            ry={n.h / 2}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )
      case 'sticky':
        return (
          <g>
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              rx={4}
            />
            <path
              d={`M ${n.x + n.w - 14} ${n.y} L ${n.x + n.w} ${n.y + 14} L ${n.x + n.w - 14} ${n.y + 14} z`}
              fill="rgba(0,0,0,0.08)"
            />
          </g>
        )
      case 'plantuml':
        return (
          <g>
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              rx={6}
            />
            <PlantUmlPreview source={n.text || '@startuml\n@enduml'} x={n.x + 2} y={n.y + 2} w={Math.max(0, n.w - 4)} h={Math.max(0, n.h - 4)} />
          </g>
        )
      case 'text':
        // 无填充/无描边, 仅文本 (便于拖拽也给一个透明 hit-area)
        return (
          <rect
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            fill="transparent"
            stroke="transparent"
          />
        )
      case 'cylinder':
        return (
          <g>
            <path
              d={cylinderMainPath({ x: n.x, y: n.y, w: n.w, h: n.h })}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            <path
              d={`M ${n.x} ${n.y + Math.min(12, n.h * 0.15)} A ${n.w / 2} ${Math.min(12, n.h * 0.15)} 0 0 0 ${n.x + n.w} ${n.y + Math.min(12, n.h * 0.15)}`}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </g>
        )
      case 'bubble':
        return (
          <g>
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              rx={12}
            />
            <path
              d={bubbleTailPath({ x: n.x, y: n.y, w: n.w, h: n.h })}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </g>
        )
      case 'rect':
        return (
          <rect
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            rx={8}
          />
        )
      case 'image':
        return n.src ? (
          <image
            href={n.src}
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <rect
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            fill="#f1f5f9"
            stroke="#cbd5e1"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )
      case 'table': {
        const rows = n.cells && n.cells.length > 0 ? n.cells : [['']]
        const cols = Math.max(1, ...rows.map((r) => r.length))
        const ratios = tableColRatios(n)
        return (
          <foreignObject x={n.x} y={n.y} width={n.w} height={n.h}>
            <div
              // @ts-expect-error xmlns required by foreignObject
              xmlns="http://www.w3.org/1999/xhtml"
              style={{
                width: '100%',
                height: '100%',
                background: fill,
                border: `${strokeWidth}px solid ${stroke}`,
                borderRadius: 4,
                overflow: 'hidden',
                boxSizing: 'border-box',
                fontSize: fontSize - 2,
                color: '#0f172a',
                pointerEvents: 'none',
              }}
            >
              <table
                style={{
                  width: '100%',
                  height: '100%',
                  borderCollapse: 'collapse',
                  tableLayout: 'fixed',
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                <colgroup>
                  {Array.from({ length: cols }).map((_, ci) => (
                    <col key={ci} style={{ width: `${ratios[ci] * 100}%` }} />
                  ))}
                </colgroup>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri}>
                      {Array.from({ length: cols }).map((_, ci) => (
                        <td
                          key={ci}
                          style={{
                            border: `1px solid ${stroke}`,
                            padding: '2px 6px',
                            verticalAlign: 'middle',
                            textAlign: 'left',
                            fontWeight: ri === 0 ? 600 : 400,
                            background: ri === 0 ? 'rgba(148,163,184,0.12)' : 'transparent',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </foreignObject>
        )
      }
      default: {
        // 其余多边形/自由 shape 走 shapePath
        const d = shapePath(n.shape, { x: n.x, y: n.y, w: n.w, h: n.h })
        if (d) {
          return <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        }
        return (
          <rect
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            rx={8}
          />
        )
      }
    }
  })()

  return (
    <g
      transform={n.rotation ? `rotate(${n.rotation} ${cx} ${cy})` : undefined}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      style={{ cursor: 'move' }}
    >
      {body}
      <text
        x={cx}
        y={cy + fontSize / 3}
        textAnchor="middle"
        fontSize={fontSize}
        fill="#0f172a"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {n.shape === 'plantuml' || n.shape === 'table' || n.shape === 'image' ? '' : n.text}
      </text>
      {selected && (
        <rect
          x={n.x - 3}
          y={n.y - 3}
          width={n.w + 6}
          height={n.h + 6}
          fill="none"
          stroke="#6366f1"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      )}
      {edgeStart && (
        <circle cx={cx} cy={cy} r={6} fill="#6366f1" stroke="white" strokeWidth={2} pointerEvents="none" />
      )}
      {n.locked && (
        <g pointerEvents="none">
          <rect
            x={n.x + n.w - 18}
            y={n.y + 2}
            width={16}
            height={14}
            rx={3}
            fill="#fef3c7"
            stroke="#f59e0b"
            strokeWidth={0.8}
            opacity={0.9}
          />
          <text
            x={n.x + n.w - 10}
            y={n.y + 12}
            textAnchor="middle"
            fontSize={10}
            fill="#b45309"
          >
            🔒
          </text>
        </g>
      )}
    </g>
  )
}

interface ResizeHandlesProps {
  node: FlowNode
  zoom: number
  onResizeStart: (
    dir: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w',
    e: React.MouseEvent,
  ) => void
}
function ResizeHandles({ node: n, zoom, onResizeStart }: ResizeHandlesProps) {
  const size = 8 / zoom
  type Dir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  const cursor: Record<Dir, string> = {
    nw: 'nwse-resize',
    n: 'ns-resize',
    ne: 'nesw-resize',
    e: 'ew-resize',
    se: 'nwse-resize',
    s: 'ns-resize',
    sw: 'nesw-resize',
    w: 'ew-resize',
  }
  const pts: Array<{ dir: Dir; x: number; y: number }> = [
    { dir: 'nw', x: n.x, y: n.y },
    { dir: 'n', x: n.x + n.w / 2, y: n.y },
    { dir: 'ne', x: n.x + n.w, y: n.y },
    { dir: 'e', x: n.x + n.w, y: n.y + n.h / 2 },
    { dir: 'se', x: n.x + n.w, y: n.y + n.h },
    { dir: 's', x: n.x + n.w / 2, y: n.y + n.h },
    { dir: 'sw', x: n.x, y: n.y + n.h },
    { dir: 'w', x: n.x, y: n.y + n.h / 2 },
  ]
  return (
    <g pointerEvents="all">
      {pts.map((p) => (
        <rect
          key={p.dir}
          x={p.x - size / 2}
          y={p.y - size / 2}
          width={size}
          height={size}
          fill="white"
          stroke="#6366f1"
          strokeWidth={1.5 / zoom}
          style={{ cursor: cursor[p.dir] }}
          onMouseDown={(e) => onResizeStart(p.dir, e)}
        />
      ))}
    </g>
  )
}

// v0.21.16 · 表格行列内联加减按钮 (浮在选中的表格节点上方 / 右侧)
interface TableInlineControlsProps {
  node: FlowNode
  zoom: number
  onAddRow: () => void
  onRemoveRow: () => void
  onAddCol: () => void
  onRemoveCol: () => void
}
function TableInlineControls({
  node: n,
  zoom,
  onAddRow,
  onRemoveRow,
  onAddCol,
  onRemoveCol,
}: TableInlineControlsProps) {
  const btn = 20 / zoom
  const gap = 4 / zoom
  const fs = 12 / zoom
  // 右侧: + / - 列
  const rx = n.x + n.w + gap
  const ryTop = n.y
  // 底部: + / - 行
  const bx = n.x
  const by = n.y + n.h + gap
  return (
    <g pointerEvents="all">
      <rect
        x={rx}
        y={ryTop}
        width={btn}
        height={btn}
        rx={4 / zoom}
        fill="white"
        stroke="#6366f1"
        strokeWidth={1.2 / zoom}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          onAddCol()
        }}
      />
      <text
        x={rx + btn / 2}
        y={ryTop + btn / 2 + fs / 3}
        textAnchor="middle"
        fontSize={fs}
        fill="#4338ca"
        pointerEvents="none"
      >
        ＋
      </text>
      <rect
        x={rx}
        y={ryTop + btn + gap}
        width={btn}
        height={btn}
        rx={4 / zoom}
        fill="white"
        stroke="#e11d48"
        strokeWidth={1.2 / zoom}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          onRemoveCol()
        }}
      />
      <text
        x={rx + btn / 2}
        y={ryTop + btn + gap + btn / 2 + fs / 3}
        textAnchor="middle"
        fontSize={fs}
        fill="#be123c"
        pointerEvents="none"
      >
        －
      </text>

      <rect
        x={bx}
        y={by}
        width={btn}
        height={btn}
        rx={4 / zoom}
        fill="white"
        stroke="#6366f1"
        strokeWidth={1.2 / zoom}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          onAddRow()
        }}
      />
      <text
        x={bx + btn / 2}
        y={by + btn / 2 + fs / 3}
        textAnchor="middle"
        fontSize={fs}
        fill="#4338ca"
        pointerEvents="none"
      >
        ＋
      </text>
      <rect
        x={bx + btn + gap}
        y={by}
        width={btn}
        height={btn}
        rx={4 / zoom}
        fill="white"
        stroke="#e11d48"
        strokeWidth={1.2 / zoom}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          onRemoveRow()
        }}
      />
      <text
        x={bx + btn + gap + btn / 2}
        y={by + btn / 2 + fs / 3}
        textAnchor="middle"
        fontSize={fs}
        fill="#be123c"
        pointerEvents="none"
      >
        －
      </text>
    </g>
  )
}

// v0.21.17 · 表格列宽拖拽手柄 (浮在列分隔线上)
interface TableColResizersProps {
  node: FlowNode
  zoom: number
  onResize: (ratios: number[]) => void
}
function TableColResizers({ node: n, zoom, onResize }: TableColResizersProps) {
  const ratios = tableColRatios(n)
  const cols = ratios.length
  if (cols < 2) return null
  const lefts: number[] = []
  let acc = 0
  for (const r of ratios) {
    acc += r
    lefts.push(acc)
  }
  // lefts 含最后一列边界(= 1), 拖拽点只到 cols-1 条
  const handleW = 8 / zoom
  const handleH = n.h

  const onPointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const startX = e.clientX
    const startLeft = lefts[idx] // 当前分隔线在 [0,1] 中的位置
    // 相邻列拖动: 只改 idx / idx+1 两列
    const a0 = ratios[idx]
    const b0 = ratios[idx + 1]
    const combined = a0 + b0
    const MIN = 0.04 // 单列最小占比

    const onMove = (ev: PointerEvent) => {
      const dxPx = ev.clientX - startX
      const dxWorld = dxPx / zoom
      const dxRatio = dxWorld / n.w
      let nextLeft = startLeft + dxRatio
      const lower = startLeft - a0 + MIN
      const upper = startLeft + b0 - MIN
      if (nextLeft < lower) nextLeft = lower
      if (nextLeft > upper) nextLeft = upper
      const aNew = nextLeft - (startLeft - a0)
      const bNew = combined - aNew
      const next = [...ratios]
      next[idx] = aNew
      next[idx + 1] = bNew
      onResize(next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <g pointerEvents="all">
      {Array.from({ length: cols - 1 }).map((_, i) => {
        const x = n.x + lefts[i] * n.w
        return (
          <g key={i}>
            {/* 可视细线, 半透明 */}
            <line
              x1={x}
              x2={x}
              y1={n.y}
              y2={n.y + n.h}
              stroke="#6366f1"
              strokeOpacity={0.35}
              strokeWidth={1 / zoom}
              pointerEvents="none"
            />
            {/* 拖拽热区 */}
            <rect
              x={x - handleW / 2}
              y={n.y}
              width={handleW}
              height={handleH}
              fill="transparent"
              style={{ cursor: 'col-resize' }}
              onPointerDown={onPointerDown(i)}
            />
          </g>
        )
      })}
    </g>
  )
}

// v0.21.16 · 图片裁剪浮层 (DOM 层覆盖在 SVG 上)
// 策略: 用 canvas 将图像重绘到裁剪框内, 得到新的 data URL, 回写 src
interface ImageCropOverlayProps {
  node: FlowNode
  left: number
  top: number
  width: number
  height: number
  onCommit: (patch: Partial<FlowNode>) => void
  onCancel: () => void
}
function ImageCropOverlay({
  node,
  left,
  top,
  width,
  height,
  onCommit,
  onCancel,
}: ImageCropOverlayProps) {
  const [rect, setRect] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  const dragRef = useRef<{
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'
    sx: number
    sy: number
    orig: { x: number; y: number; w: number; h: number }
  } | null>(null)

  useEffect(() => {
    function mm(e: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      const dx = (e.clientX - d.sx) / width
      const dy = (e.clientY - d.sy) / height
      let { x, y, w, h } = d.orig
      if (d.mode === 'move') {
        x = Math.max(0, Math.min(1 - w, x + dx))
        y = Math.max(0, Math.min(1 - h, y + dy))
      } else {
        if (d.mode.includes('e')) w = Math.max(0.05, Math.min(1 - x, w + dx))
        if (d.mode.includes('s')) h = Math.max(0.05, Math.min(1 - y, h + dy))
        if (d.mode.includes('w')) {
          const nx = Math.max(0, Math.min(x + w - 0.05, x + dx))
          w = w - (nx - x)
          x = nx
        }
        if (d.mode.includes('n')) {
          const ny = Math.max(0, Math.min(y + h - 0.05, y + dy))
          h = h - (ny - y)
          y = ny
        }
      }
      setRect({ x, y, w, h })
    }
    function mu() {
      dragRef.current = null
    }
    window.addEventListener('mousemove', mm)
    window.addEventListener('mouseup', mu)
    return () => {
      window.removeEventListener('mousemove', mm)
      window.removeEventListener('mouseup', mu)
    }
  }, [width, height])

  const start =
    (mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      dragRef.current = {
        mode,
        sx: e.clientX,
        sy: e.clientY,
        orig: { ...rect },
      }
    }

  const apply = async () => {
    if (!node.src) {
      onCancel()
      return
    }
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = node.src
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('image load'))
      })
      const natW = img.naturalWidth
      const natH = img.naturalHeight
      const sx = rect.x * natW
      const sy = rect.y * natH
      const sw = rect.w * natW
      const sh = rect.h * natH
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sw))
      canvas.height = Math.max(1, Math.round(sh))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        onCancel()
        return
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      const url = canvas.toDataURL('image/png')
      // 保持节点左上角位置, 新尺寸按裁剪比例缩放
      onCommit({
        src: url,
        w: node.w * rect.w,
        h: node.h * rect.h,
      })
    } catch {
      onCancel()
    }
  }

  const bx = rect.x * width
  const by = rect.y * height
  const bw = rect.w * width
  const bh = rect.h * height

  return (
    <div
      className="absolute z-40"
      style={{ left, top, width, height, pointerEvents: 'none' }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,0.35)',
          pointerEvents: 'auto',
          cursor: 'default',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: bx,
          top: by,
          width: bw,
          height: bh,
          border: '2px solid #6366f1',
          boxShadow: '0 0 0 9999px rgba(15,23,42,0.55)',
          cursor: 'move',
          pointerEvents: 'auto',
        }}
        onMouseDown={start('move')}
      >
        {(['nw', 'ne', 'sw', 'se'] as const).map((d) => {
          const style: React.CSSProperties = {
            position: 'absolute',
            width: 10,
            height: 10,
            background: 'white',
            border: '1.5px solid #6366f1',
            cursor: (d === 'nw' || d === 'se' ? 'nwse-resize' : 'nesw-resize') as React.CSSProperties['cursor'],
          }
          if (d.includes('n')) style.top = -5
          if (d.includes('s')) style.bottom = -5
          if (d.includes('w')) style.left = -5
          if (d.includes('e')) style.right = -5
          return <div key={d} style={style} onMouseDown={start(d)} />
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: height + 6,
          pointerEvents: 'auto',
        }}
        className="flex gap-1"
      >
        <button
          onClick={apply}
          className="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
        >
          应用裁剪
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1 rounded border bg-white text-slate-600 hover:bg-slate-50"
        >
          取消
        </button>
      </div>
    </div>
  )
}

// v0.21.16 · 右键上下文菜单 (node / edge / blank 三态)
interface ContextMenuProps {
  menu: {
    screenX: number
    screenY: number
    worldX: number
    worldY: number
    target: { kind: 'node'; id: string } | { kind: 'edge'; id: string } | { kind: 'blank' }
  }
  data: import('../../lib/whiteboard/types').WhiteboardData
  store: WhiteboardStore
  onClose: () => void
  onStartCrop: (id: string) => void
}
function ContextMenu({ menu, data, store, onClose, onStartCrop }: ContextMenuProps) {
  useEffect(() => {
    const close = () => onClose()
    // 延迟绑定以避免右键释放立即关闭
    const t = window.setTimeout(() => {
      window.addEventListener('mousedown', close, { once: true })
      window.addEventListener('scroll', close, { once: true })
    }, 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close)
    }
  }, [onClose])

  const item = (label: string, fn: () => void, danger = false) => (
    <button
      key={label}
      onClick={(e) => {
        e.stopPropagation()
        fn()
        onClose()
      }}
      className={
        'w-full text-left px-3 py-1.5 text-xs rounded ' +
        (danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100')
      }
    >
      {label}
    </button>
  )
  const sep = (key: string) => <div key={key} className="my-1 h-px bg-slate-200" />

  const entries: React.ReactNode[] = []
  const selIds = store.getState().selectedIds

  if (menu.target.kind === 'node') {
    const id = menu.target.id
    const node = data.nodes.find((n) => n.id === id)
    const selNodes = data.nodes.filter((n) => selIds.includes(n.id))
    const payloadNodes = selNodes.length > 0 ? selNodes : node ? [node] : []
    entries.push(item('剪切 (Ctrl+X)', () => {
      if (payloadNodes.length === 0) return
      void wbClipboardWrite({ nodes: payloadNodes })
      if (selNodes.length > 0) store.removeSelected()
      else store.removeNode(id)
    }))
    entries.push(item('复制 (Ctrl+C)', () => {
      if (payloadNodes.length === 0) return
      void wbClipboardWrite({ nodes: payloadNodes })
    }))
    entries.push(item('复制为副本', () => {
      if (!node) return
      const copy: FlowNode = { ...node, id: newId(), x: node.x + 20, y: node.y + 20 }
      store.addNode(copy)
      store.select([copy.id])
    }))
    entries.push(sep('s1'))
    entries.push(item('置于顶层', () => store.bringToFront([id])))
    entries.push(item('置于底层', () => store.sendToBack([id])))
    entries.push(item('上移一层', () => store.bringForward([id])))
    entries.push(item('下移一层', () => store.sendBackward([id])))
    entries.push(sep('s2'))
    if (node?.locked) {
      entries.push(item('解锁', () => store.lockSelected(false)))
    } else {
      entries.push(item('锁定', () => {
        store.select([id])
        store.lockSelected(true)
      }))
    }
    if (selIds.length > 1) {
      entries.push(item('编组选中', () => store.groupSelected()))
      entries.push(item('取消编组', () => store.ungroupSelected()))
    }
    if (node?.shape === 'image') {
      entries.push(sep('s3'))
      entries.push(item('裁剪图片', () => onStartCrop(id)))
    }
    entries.push(sep('sdel'))
    entries.push(item('删除', () => store.removeNode(id), true))
  } else if (menu.target.kind === 'edge') {
    const id = menu.target.id
    const ed = data.edges.find((x) => x.id === id)
    entries.push(item('切换路由: 正交', () => store.updateEdge(id, { routing: 'orthogonal' })))
    entries.push(item('切换路由: 直线', () => store.updateEdge(id, { routing: 'straight' })))
    entries.push(item('切换路由: 曲线', () => store.updateEdge(id, { routing: 'curve' })))
    entries.push(sep('e1'))
    // v0.21.18 · 在右键位置插入折点 (仅正交路由)
    if ((ed?.routing ?? 'orthogonal') === 'orthogonal') {
      entries.push(item('在此插入折点', () => {
        if (!ed) return
        const from = data.nodes.find((n) => n.id === ed.from)
        const to = data.nodes.find((n) => n.id === ed.to)
        if (!from || !to) return
        const basePts = routeOrthogonalWithWaypoints(
          from,
          to,
          ed.fromAnchor,
          ed.toAnchor,
          ed.waypoints ?? [],
        )
        // 找到离右键位置最近的段 idx
        let bestIdx = 0
        let bestDist = Infinity
        for (let i = 0; i < basePts.length - 1; i++) {
          const d = pointToSegmentDistance(menu.worldX, menu.worldY, basePts[i], basePts[i + 1])
          if (d < bestDist) {
            bestDist = d
            bestIdx = i
          }
        }
        // 插入为最近段的中点 (正交: 保留对应坐标轴)
        const a = basePts[bestIdx]
        const b = basePts[bestIdx + 1]
        const horizontal = Math.abs(a.y - b.y) < 0.01
        const wp = horizontal
          ? { x: menu.worldX, y: a.y }
          : { x: a.x, y: menu.worldY }
        const existing = ed.waypoints ?? []
        const insertAt = Math.max(0, Math.min(existing.length, bestIdx))
        const next = [...existing]
        next.splice(insertAt, 0, wp)
        store.updateEdge(id, { waypoints: next })
      }))
    }
    entries.push(item('清除折点', () => store.updateEdge(id, { waypoints: [] })))
    entries.push(item('反转方向 (交换起止)', () => {
      if (!ed) return
      store.updateEdge(id, {
        from: ed.to,
        to: ed.from,
        fromAnchor: ed.toAnchor,
        toAnchor: ed.fromAnchor,
        arrowStart: ed.arrowEnd,
        arrowEnd: ed.arrowStart,
        // 折点序列反转, 避免错位
        waypoints: ed.waypoints ? [...ed.waypoints].reverse() : undefined,
      })
    }))
    entries.push(item('编辑标签', () => {
      const next = prompt('标签', ed?.label ?? '')
      if (next !== null) store.updateEdge(id, { label: next })
    }))
    entries.push(sep('e2'))
    entries.push(item('删除连线', () => store.removeEdge(id), true))
  } else {
    // blank: 粘贴 / 对齐视口 / 全选
    entries.push(item('粘贴 (Ctrl+V)', () => {
      wbClipboardRead().then((obj) => {
        if (!obj || !obj.nodes || obj.nodes.length === 0) return
        const base = obj.nodes[0]
        const ids: string[] = []
        for (const src of obj.nodes) {
          const copy: FlowNode = {
            ...src,
            id: newId(),
            x: menu.worldX + (src.x - base.x),
            y: menu.worldY + (src.y - base.y),
          }
          store.addNode(copy)
          ids.push(copy.id)
        }
        store.select(ids)
      })
    }))
    entries.push(sep('b1'))
    entries.push(item('全选节点', () => store.select(data.nodes.map((n) => n.id))))
    entries.push(item('清除全部笔画', () => store.clearStrokes(), true))
  }

  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px]"
      style={{ left: menu.screenX, top: menu.screenY }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {entries}
    </div>
  )
}

// v0.21.17 · 快捷键帮助浮层
function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const groups: Array<{ title: string; items: Array<[string, string]> }> = [
    {
      title: '工具',
      items: [
        ['V', '选择'],
        ['H / Space', '平移'],
        ['P', '手绘'],
        ['M', '高亮笔'],
        ['E', '橡皮'],
        ['C', '连线'],
        ['T', '文本'],
        ['N', '矩形'],
        ['Ctrl + /', '工具搜索'],
      ],
    },
    {
      title: '编辑',
      items: [
        ['Ctrl + Z / Y', '撤销 / 重做'],
        ['Ctrl + C / X / V', '复制 / 剪切 / 粘贴'],
        ['Delete / Backspace', '删除选中'],
        ['Ctrl + A', '全选'],
        ['Ctrl + G / Shift+G', '编组 / 取消编组'],
        ['Ctrl + L', '锁定 / 解锁'],
      ],
    },
    {
      title: '表格',
      items: [
        ['双击', '编辑单元格'],
        ['Enter', '下一行'],
        ['Tab / Shift+Tab', '下一 / 上一格'],
        ['← → ↑ ↓', '跨格导航 (光标在边界时)'],
        ['拖拽列分隔线', '调整列宽 (v0.21.17)'],
      ],
    },
    {
      title: '视口',
      items: [
        ['Ctrl + 滚轮', '缩放'],
        ['Space + 拖拽', '平移'],
        ['Ctrl + 0', '重置缩放'],
        ['?', '显示此帮助'],
      ],
    },
  ]
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/25"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border p-4 w-[640px] max-w-[90%] max-h-[80%] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-slate-700">快捷键</div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xs"
          >
            关闭 (Esc)
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="text-[11px] uppercase text-slate-400 tracking-wider mb-1">
                {g.title}
              </div>
              <table className="w-full text-[12px]">
                <tbody>
                  {g.items.map(([k, v]) => (
                    <tr key={k}>
                      <td className="py-0.5 pr-2 whitespace-nowrap">
                        <span className="inline-block px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600 text-[11px] font-mono">
                          {k}
                        </span>
                      </td>
                      <td className="py-0.5 text-slate-600">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
