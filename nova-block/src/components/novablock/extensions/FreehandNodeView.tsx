/**
 * v0.21.6 · Whiteboard Display-Only NodeView
 * v0.21.8 · D · 缩略图增强: 自适应高度 + 快速导出 + 全屏查看
 *
 * 职责:
 *   - 在笔记正文中只做静态 SVG 缩略预览 (节点/连线/笔画)
 *   - 双击触发全屏编辑器 (WhiteboardEditorHost)
 *   - 提供"导出 SVG" 与 "全屏查看" 按钮 (不进编辑器, 只开只读大图)
 *   - 选中/删除由 tiptap 原生处理 (atom node)
 */
import { useCallback, useMemo } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { emitWhiteboardOpen } from '../../whiteboard/whiteboardBus'
import { migrate } from '../../../lib/whiteboard/schemaMigration'
import { exportSvg } from '../../../lib/whiteboard/export'
import {
  DEFAULT_EDGE_STROKE,
  DEFAULT_EDGE_STROKE_WIDTH,
  DEFAULT_NODE_FILL,
  DEFAULT_NODE_FONT_SIZE,
  DEFAULT_NODE_STROKE,
  DEFAULT_NODE_STROKE_WIDTH,
  type FlowEdge,
  type FlowNode,
  type Stroke,
  type WhiteboardData,
} from '../../../lib/whiteboard/types'
import {
  pointsToPath,
  resolveAnchor,
  routeOrthogonalWithWaypoints,
} from '../../../lib/whiteboard/orthogonalRouter'
import { PlantUmlPreview } from '../../whiteboard/PlantUmlPreview'

interface Props {
  node: {
    attrs: {
      strokes?: Stroke[]
      nodes?: FlowNode[]
      edges?: FlowEdge[]
      width?: number
      height?: number
    }
  }
  updateAttributes: (attrs: Record<string, unknown>) => void
  selected: boolean
}

export function FreehandNodeView({ node, updateAttributes, selected }: Props) {
  const data = useMemo<WhiteboardData>(
    () =>
      migrate({
        strokes: node.attrs.strokes ?? [],
        nodes: node.attrs.nodes ?? [],
        edges: node.attrs.edges ?? [],
        width: node.attrs.width ?? 720,
        height: node.attrs.height ?? 440,
      }),
    [node.attrs.strokes, node.attrs.nodes, node.attrs.edges, node.attrs.width, node.attrs.height],
  )

  const onDoubleClick = useCallback(() => {
    emitWhiteboardOpen({
      nodeId: 'freehand',
      data,
      commitBack: (next) => {
        updateAttributes({
          strokes: next.strokes,
          nodes: next.nodes,
          edges: next.edges,
          width: next.width,
          height: next.height,
        })
      },
    })
  }, [data, updateAttributes])

  // v0.21.8 · D 线 · 直接导出当前缩略图为 .svg 文件
  const onExportSvg = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        const svg = exportSvg(data)
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `whiteboard-${Date.now()}.svg`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch {
        // 导出失败时安静回退
      }
    },
    [data],
  )

  // v0.21.8 · D 线 · 新窗口只读预览 (不进编辑器)
  const onOpenPreview = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        const svg = exportSvg(data)
        const html = `<!doctype html><meta charset="utf-8"><title>白板预览</title><style>html,body{margin:0;padding:24px;background:#f7f8fa;font-family:system-ui,sans-serif}svg{max-width:100%;height:auto;background:white;box-shadow:0 4px 24px rgba(0,0,0,0.08);border-radius:8px}</style>${svg}`
        const w = window.open('', '_blank', 'noopener,noreferrer,width=960,height=640')
        if (w) {
          w.document.open()
          w.document.write(html)
          w.document.close()
        }
      } catch {
        // noop
      }
    },
    [data],
  )

  const isEmpty = data.nodes.length === 0 && data.edges.length === 0 && data.strokes.length === 0

  const viewBox = useMemo(() => {
    if (isEmpty) return `0 0 ${data.width} ${data.height}`
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of data.nodes) {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.w)
      maxY = Math.max(maxY, n.y + n.h)
    }
    for (const s of data.strokes) {
      for (const [x, y] of s.points) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
    if (!isFinite(minX)) return `0 0 ${data.width} ${data.height}`
    const pad = 24
    return `${minX - pad} ${minY - pad} ${Math.max(40, maxX - minX + pad * 2)} ${Math.max(
      40,
      maxY - minY + pad * 2,
    )}`
  }, [data, isEmpty])

  return (
    <NodeViewWrapper
      as="div"
      data-type="freehand"
      className={
        'my-3 rounded-xl border transition bg-gradient-to-br from-white to-slate-50 ' +
        (selected
          ? 'ring-2 ring-indigo-400 border-indigo-300'
          : 'border-slate-200 hover:border-slate-300')
      }
      onDoubleClick={onDoubleClick}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-white/60 rounded-t-xl">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="inline-flex w-5 h-5 rounded bg-gradient-to-br from-indigo-500 to-purple-500 text-white items-center justify-center text-[10px]">
            ✎
          </span>
          画板
          <span className="text-slate-400">
            · {data.nodes.length} 节点 · {data.edges.length} 连线 · {data.strokes.length} 笔画
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onExportSvg}
            title="导出当前缩略图为 SVG"
            className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            ⬇ SVG
          </button>
          <button
            type="button"
            onClick={onOpenPreview}
            title="在新窗口只读预览"
            className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            ⛶ 预览
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDoubleClick()
            }}
            className="text-[11px] px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700"
          >
            双击编辑 ↗
          </button>
        </div>
      </div>
      <div
        className="relative bg-white rounded-b-xl overflow-hidden"
        style={{
          aspectRatio: `${data.width} / ${data.height}`,
          // 节点越多预览越高 (160 ~ 360 px)
          minHeight: Math.min(360, 160 + Math.min(data.nodes.length, 12) * 12),
        }}
      >
        {isEmpty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-sm gap-1">
            <span className="text-2xl">＋</span>
            <span>空白画板 · 双击开始编辑</span>
          </div>
        ) : (
          <svg
            width="100%"
            height="100%"
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            style={{ pointerEvents: 'none' }}
          >
            <defs>
              <marker
                id="wb-disp-arrow"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="5"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {data.strokes.map((s, i) => (
              <path
                key={`s-${i}`}
                d={strokePath(s)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.size}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
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
              const color = e.stroke ?? DEFAULT_EDGE_STROKE
              return (
                <path
                  key={e.id}
                  d={pointsToPath(pts)}
                  fill="none"
                  stroke={color}
                  strokeWidth={e.strokeWidth ?? DEFAULT_EDGE_STROKE_WIDTH}
                  markerEnd={(e.arrowEnd ?? 'arrow') === 'arrow' ? 'url(#wb-disp-arrow)' : undefined}
                  style={{ color }}
                />
              )
            })}
            {data.nodes.map((n) => (
              <NodeGlyph key={n.id} node={n} />
            ))}
          </svg>
        )}
      </div>
    </NodeViewWrapper>
  )
}

function strokePath(s: Stroke): string {
  if (s.points.length === 0) return ''
  const [h, ...rest] = s.points
  return `M ${h[0]} ${h[1]} ` + rest.map(([x, y]) => `L ${x} ${y}`).join(' ')
}

function NodeGlyph({ node: n }: { node: FlowNode }) {
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
    <g transform={n.rotation ? `rotate(${n.rotation} ${cx} ${cy})` : undefined}>
      {body}
      <text
        x={cx}
        y={cy + fontSize / 3}
        textAnchor="middle"
        fontSize={fontSize}
        fill="#0f172a"
        style={{ userSelect: 'none' }}
      >
        {n.shape === 'plantuml' ? '' : n.text}
      </text>
    </g>
  )
}

export default FreehandNodeView
