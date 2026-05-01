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
import { pointsToPath, resolveAnchor, routeOrthogonalWithWaypoints } from '../../lib/whiteboard/orthogonalRouter'
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
}

interface Marquee {
  x0: number
  y0: number
  x1: number
  y1: number
}

const GRID = 20

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
  const [spaceDown, setSpaceDown] = useState(false)
  // A5 · 吸附引导线 (在拖拽过程中高亮)
  const [guides, setGuides] = useState<Array<{ kind: 'v' | 'h'; at: number }>>([])

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

      if (tool.startsWith('node-')) {
        const shape = tool.replace('node-', '') as FlowNode['shape']
        const w = shape === 'sticky' ? 140 : shape === 'plantuml' ? 260 : 140
        const h = shape === 'sticky' ? 140 : shape === 'plantuml' ? 180 : 64
        const node: FlowNode = {
          id: newId(),
          x: snap(x) - w / 2,
          y: snap(y) - h / 2,
          w,
          h,
          text: shape === 'sticky' ? '便签' : shape === 'plantuml' ? '@startuml\nAlice -> Bob : hi\nBob --> Alice : ok\n@enduml' : '节点',
          shape,
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
        const inside = data.nodes
          .filter((n) => n.x >= x && n.y >= y && n.x + n.w <= x + w && n.y + n.h <= y + h)
          .map((n) => n.id)
        store.select(inside)
      }
      setMarquee(null)
    }
  }, [pending, marquee, data.nodes, store])

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
      // select
      if (e.shiftKey) store.toggleSelect(id)
      else if (!selectedIds.includes(id)) store.select([id])

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
    (_e: React.MouseEvent, id: string) => {
      const n = data.nodes.find((x) => x.id === id)
      if (!n) return
      setEditingText({ id, value: n.text })
    },
    [data.nodes],
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
        // uniform scale with Shift
        if (ev.shiftKey) {
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
    if (tool === 'pen') return 'crosshair'
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
          {data.strokes.map((s, i) => (
            <path
              key={`s-${i}`}
              d={strokeToPath(s)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.size}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {pending && (
            <path
              d={strokeToPath(pending as Stroke)}
              fill="none"
              stroke={pending.color}
              strokeWidth={pending.size}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.8}
            />
          )}

          {/* edges */}
          {data.edges.map((e) => {
            const from = data.nodes.find((n) => n.id === e.from)
            const to = data.nodes.find((n) => n.id === e.to)
            if (!from || !to) return null
            const routing = e.routing ?? 'orthogonal'
            const pts =
              routing === 'orthogonal'
                ? routeOrthogonalWithWaypoints(from, to, e.fromAnchor, e.toAnchor, e.waypoints ?? [])
                : [
                    resolveAnchor(from, e.fromAnchor ?? 'auto', to),
                    resolveAnchor(to, e.toAnchor ?? 'auto', from),
                  ]
            const d = pointsToPath(pts)
            const selected = selectedIds.includes(e.id)
            const color = e.stroke ?? DEFAULT_EDGE_STROKE
            return (
              <g key={e.id} onClick={(ev) => onEdgeClick(ev, e.id)} style={{ cursor: 'pointer' }}>
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(12, (e.strokeWidth ?? 1.5) + 10)}
                  onDoubleClick={(ev) => {
                    ev.stopPropagation()
                    if ((e.waypoints ?? []).length > 0) clearEdgeWaypoints(e.id)
                  }}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={(e.strokeWidth ?? DEFAULT_EDGE_STROKE_WIDTH) + (selected ? 1 : 0)}
                  markerEnd={(e.arrowEnd ?? 'arrow') === 'arrow' ? 'url(#wb-arrow)' : undefined}
                  markerStart={e.arrowStart === 'arrow' ? 'url(#wb-arrow)' : undefined}
                  style={{ color }}
                />
                {e.label && (
                  <text
                    x={(pts[0].x + pts[pts.length - 1].x) / 2}
                    y={(pts[0].y + pts[pts.length - 1].y) / 2 - 4}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#475569"
                  >
                    {e.label}
                  </text>
                )}
                {/* v0.21.8 · waypoint handles (仅在选中时显示) */}
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

          {/* A2 · resize handles (single-select only, non-edge tool) */}
          {tool !== 'edge' && selectedIds.length === 1 && (() => {
            const n = data.nodes.find((x) => x.id === selectedIds[0])
            if (!n) return null
            return (
              <ResizeHandles
                node={n}
                zoom={viewport.zoom}
                onResizeStart={(dir, e) => startResize(dir, n.id, e)}
              />
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
      case 'diamond':
        return (
          <polygon
            points={`${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}`}
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
      case 'rect':
      default:
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
        {n.shape === 'plantuml' ? '' : n.text}
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
