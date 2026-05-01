/**
 * v0.21.7 · A6 · Mini-map
 *
 * 显示:
 *   - 缩略的节点+边的灰色方块
 *   - 红框表示当前视口范围
 * 交互:
 *   - 点击某处 → 平移让画布中心移到该处 (保持缩放不变)
 */
import { useMemo } from 'react'
import type { WhiteboardData } from '../../lib/whiteboard/types'

interface Props {
  data: WhiteboardData
  viewport: { x: number; y: number; zoom: number }
  canvasW: number
  canvasH: number
  setViewport: (v: { x: number; y: number; zoom: number }) => void
}

const W = 160
const H = 100

export function MiniMap({ data, viewport, canvasW, canvasH, setViewport }: Props) {
  const { bounds, scale, offsetX, offsetY } = useMemo(() => {
    let minX = 0,
      minY = 0,
      maxX = canvasW,
      maxY = canvasH
    for (const n of data.nodes) {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.w)
      maxY = Math.max(maxY, n.y + n.h)
    }
    // 额外包含当前视口 (反算出视口世界坐标范围)
    const vx0 = -viewport.x / viewport.zoom
    const vy0 = -viewport.y / viewport.zoom
    const vx1 = vx0 + canvasW / viewport.zoom
    const vy1 = vy0 + canvasH / viewport.zoom
    minX = Math.min(minX, vx0)
    minY = Math.min(minY, vy0)
    maxX = Math.max(maxX, vx1)
    maxY = Math.max(maxY, vy1)
    const pad = 20
    minX -= pad
    minY -= pad
    maxX += pad
    maxY += pad
    const bw = Math.max(1, maxX - minX)
    const bh = Math.max(1, maxY - minY)
    const scale = Math.min(W / bw, H / bh)
    const offsetX = (W - bw * scale) / 2 - minX * scale
    const offsetY = (H - bh * scale) / 2 - minY * scale
    return { bounds: { minX, minY, maxX, maxY }, scale, offsetX, offsetY }
  }, [data.nodes, canvasW, canvasH, viewport])
  void bounds // keep TS happy

  // 当前视口矩形 (世界坐标)
  const vx0 = -viewport.x / viewport.zoom
  const vy0 = -viewport.y / viewport.zoom
  const vw = canvasW / viewport.zoom
  const vh = canvasH / viewport.zoom

  const handleClick = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = (e.target as Element).closest('svg') as SVGSVGElement | null
    if (!svg) return
    const r = svg.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    // 屏幕 -> 世界
    const wx = (mx - offsetX) / scale
    const wy = (my - offsetY) / scale
    // 让 (wx, wy) 成为视口中心
    setViewport({
      x: canvasW / 2 - wx * viewport.zoom,
      y: canvasH / 2 - wy * viewport.zoom,
      zoom: viewport.zoom,
    })
  }

  return (
    <div
      className="absolute bottom-3 right-3 bg-white/95 border rounded-lg shadow-md overflow-hidden"
      style={{ width: W + 8, height: H + 24 }}
    >
      <div className="h-5 px-2 text-[10px] flex items-center justify-between text-slate-500 border-b bg-slate-50">
        <span>Mini-map</span>
        <span>{Math.round(viewport.zoom * 100)}%</span>
      </div>
      <svg width={W + 8} height={H + 4} style={{ display: 'block' }}>
        <rect
          x={4}
          y={2}
          width={W}
          height={H}
          fill="#f8fafc"
          stroke="#e2e8f0"
          onClick={handleClick}
          style={{ cursor: 'crosshair' }}
        />
        <g transform={`translate(${4 + offsetX} ${2 + offsetY})`} pointerEvents="none">
          {data.nodes.map((n) => (
            <rect
              key={n.id}
              x={n.x * scale}
              y={n.y * scale}
              width={Math.max(1, n.w * scale)}
              height={Math.max(1, n.h * scale)}
              fill="#94a3b8"
              opacity={0.6}
            />
          ))}
          <rect
            x={vx0 * scale}
            y={vy0 * scale}
            width={vw * scale}
            height={vh * scale}
            fill="rgba(239,68,68,0.08)"
            stroke="#ef4444"
            strokeWidth={1}
          />
        </g>
      </svg>
    </div>
  )
}
