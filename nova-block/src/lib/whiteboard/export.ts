/**
 * v0.21.7 · C1 · 画板导出 (SVG / PNG / Clipboard)
 *
 * 输入: WhiteboardData
 * 输出: SVG 字符串, 或 Blob (PNG)
 *
 * 实现细节:
 *   - 遍历 nodes/edges/strokes, 生成纯 SVG 字符串 (不依赖 Board.tsx)
 *   - PNG 走 canvas.drawImage(Image 载入 dataURL) 路径, 2x 分辨率
 *   - 剪贴板用 ClipboardItem (FF / Safari 需 Permissions)
 *
 * 注: PlantUML 节点在导出时仅绘制占位, 避免 cross-origin 污染 canvas.
 */
import {
  DEFAULT_EDGE_STROKE,
  DEFAULT_EDGE_STROKE_WIDTH,
  DEFAULT_NODE_FILL,
  DEFAULT_NODE_FONT_SIZE,
  DEFAULT_NODE_STROKE,
  DEFAULT_NODE_STROKE_WIDTH,
  type FlowNode,
  type Stroke,
  type WhiteboardData,
} from './types'
import { pointsToPath, resolveAnchor, routeCurve, routeOrthogonalWithWaypoints } from './orthogonalRouter'
import { bubbleTailPath, cylinderMainPath, shapePath } from './shapeGeometry'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function bbox(data: WhiteboardData): { x: number; y: number; w: number; h: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
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
  if (!isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = data.width > 0 ? data.width : 720
    maxY = data.height > 0 ? data.height : 440
  }
  const pad = 20
  const rawW = maxX - minX + pad * 2
  const rawH = maxY - minY + pad * 2
  return {
    x: minX - pad,
    y: minY - pad,
    w: rawW > 0 && isFinite(rawW) ? rawW : 720,
    h: rawH > 0 && isFinite(rawH) ? rawH : 440,
  }
}

function nodeToSvg(n: FlowNode): string {
  const fill = n.fill ?? n.color ?? DEFAULT_NODE_FILL[n.shape] ?? '#ffffff'
  const stroke = n.stroke ?? DEFAULT_NODE_STROKE
  const sw = n.strokeWidth ?? DEFAULT_NODE_STROKE_WIDTH
  const fs = n.fontSize ?? DEFAULT_NODE_FONT_SIZE
  const cx = n.x + n.w / 2
  const cy = n.y + n.h / 2
  const rot = n.rotation ? ` transform="rotate(${n.rotation} ${cx} ${cy})"` : ''
  const text = escapeXml(
    n.shape === 'plantuml'
      ? 'PlantUML'
      : n.shape === 'image' || n.shape === 'table'
        ? ''
        : n.text || '',
  )
  let shape = ''
  switch (n.shape) {
    case 'ellipse':
      shape = `<ellipse cx="${cx}" cy="${cy}" rx="${n.w / 2}" ry="${n.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
      break
    case 'sticky':
      shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="4"/>`
      break
    case 'plantuml':
      shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="6" stroke-dasharray="6 4"/>`
      break
    case 'text':
      // 仅文字, 无填充无描边
      shape = ''
      break
    case 'cylinder': {
      const body = cylinderMainPath({ x: n.x, y: n.y, w: n.w, h: n.h })
      const ry = Math.min(12, n.h * 0.15)
      const cap = `M ${n.x} ${n.y + ry} A ${n.w / 2} ${ry} 0 0 0 ${n.x + n.w} ${n.y + ry}`
      shape = `<path d="${body}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/><path d="${cap}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`
      break
    }
    case 'bubble': {
      const tail = bubbleTailPath({ x: n.x, y: n.y, w: n.w, h: n.h })
      shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/><path d="${tail}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
      break
    }
    case 'rect':
      shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="8"/>`
      break
    case 'image': {
      // v0.21.14 · 图片节点: 直接嵌入 href (data URL / http URL)
      const href = n.src ?? ''
      if (href) {
        shape = `<image href="${escapeXml(href)}" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" preserveAspectRatio="xMidYMid meet"/>`
      } else {
        shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4 3"/>`
      }
      break
    }
    case 'table': {
      // v0.21.14 · 表格节点: foreignObject + XHTML table (符合 SVG 1.1)
      // v0.21.17 · 支持列宽比例 (colWidths)
      const rows = n.cells && n.cells.length > 0 ? n.cells : [['']]
      const cols = Math.max(1, ...rows.map((r) => r.length))
      const cwRaw = n.colWidths
      const ratios =
        cwRaw && cwRaw.length === cols && cwRaw.every((v) => isFinite(v) && v > 0)
          ? (() => {
              const sum = cwRaw.reduce((a, b) => a + b, 0)
              return sum > 0 ? cwRaw.map((v) => v / sum) : Array.from({ length: cols }, () => 1 / cols)
            })()
          : Array.from({ length: cols }, () => 1 / cols)
      const colgroup = `<colgroup>${ratios.map((r) => `<col style="width:${(r * 100).toFixed(4)}%"/>`).join('')}</colgroup>`
      const trs = rows
        .map((row, ri) => {
          const tds = Array.from({ length: cols })
            .map((_, ci) => {
              const v = escapeXml(row[ci] ?? '')
              const bg = ri === 0 ? 'background:rgba(148,163,184,0.12);font-weight:600;' : ''
              return `<td style="border:1px solid ${stroke};padding:2px 6px;${bg}overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v}</td>`
            })
            .join('')
          return `<tr>${tds}</tr>`
        })
        .join('')
      shape = `<foreignObject x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;background:${fill};border:${sw}px solid ${stroke};border-radius:4px;overflow:hidden;box-sizing:border-box;font-size:${Math.max(10, fs - 2)}px;color:#0f172a;font-family:system-ui,sans-serif;"><table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;">${colgroup}<tbody>${trs}</tbody></table></div></foreignObject>`
      break
    }
    default: {
      const d = shapePath(n.shape, { x: n.x, y: n.y, w: n.w, h: n.h })
      if (d) {
        shape = `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
      } else {
        shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="8"/>`
      }
    }
  }
  return `<g${rot}>${shape}<text x="${cx}" y="${cy + fs / 3}" text-anchor="middle" font-size="${fs}" fill="#0f172a" font-family="system-ui, sans-serif">${text}</text></g>`
}

function strokeToSvg(s: Stroke): string {
  if (s.points.length === 0) return ''
  const [h, ...rest] = s.points
  const d = `M ${h[0]} ${h[1]} ` + rest.map(([x, y]) => `L ${x} ${y}`).join(' ')
  const op = s.opacity ?? (s.tool === 'marker' ? 0.35 : 1)
  const blend = s.tool === 'marker' ? ' style="mix-blend-mode:multiply"' : ''
  return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"${blend}/>`
}

function markerRef(style: string | undefined, end: 'start' | 'end'): string {
  if (!style || style === 'none') return ''
  const suffix = end === 'start' ? '-start' : ''
  switch (style) {
    case 'arrow':
      return end === 'start' ? ' marker-start="url(#wb-export-arrow-start)"' : ' marker-end="url(#wb-export-arrow)"'
    case 'triangle':
      return end === 'start'
        ? ` marker-start="url(#wb-export-triangle${suffix})"`
        : ' marker-end="url(#wb-export-triangle)"'
    case 'dot':
      return end === 'start'
        ? ` marker-start="url(#wb-export-dot${suffix})"`
        : ' marker-end="url(#wb-export-dot)"'
    case 'diamond':
      return end === 'start'
        ? ` marker-start="url(#wb-export-diamond${suffix})"`
        : ' marker-end="url(#wb-export-diamond)"'
  }
  return ''
}

function edgeToSvg(data: WhiteboardData, edgeIdx: number): string {
  const e = data.edges[edgeIdx]
  const from = data.nodes.find((n) => n.id === e.from)
  const to = data.nodes.find((n) => n.id === e.to)
  if (!from || !to) return ''
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
  const color = e.stroke ?? DEFAULT_EDGE_STROKE
  const sw = e.strokeWidth ?? DEFAULT_EDGE_STROKE_WIDTH
  const me = markerRef(e.arrowEnd ?? 'arrow', 'end')
  const ms = markerRef(e.arrowStart ?? 'none', 'start')
  let label = ''
  if (e.label) {
    const lx = (pts[0].x + pts[pts.length - 1].x) / 2
    const ly = (pts[0].y + pts[pts.length - 1].y) / 2
    const txt = escapeXml(e.label)
    const halfW = Math.max(20, e.label.length * 5)
    label = `<rect x="${lx - halfW}" y="${ly - 10}" width="${halfW * 2}" height="18" fill="white" fill-opacity="0.9" stroke="#e2e8f0" stroke-width="0.5" rx="3"/><text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="11" fill="#334155" font-family="system-ui, sans-serif">${txt}</text>`
  }
  return `<g color="${color}"><path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}"${me}${ms}/>${label}</g>`
}

/**
 * 把 WhiteboardData 导出为独立 SVG 字符串
 */
export function exportSvg(data: WhiteboardData): string {
  const b = bbox(data)
  const defs = [
    '<defs>',
    '<marker id="wb-export-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker>',
    '<marker id="wb-export-arrow-start" markerWidth="10" markerHeight="10" refX="1" refY="5" orient="auto"><path d="M 10 0 L 0 5 L 10 10 z" fill="currentColor"/></marker>',
    '<marker id="wb-export-triangle" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M 0 0 L 12 6 L 0 12 z" fill="currentColor" stroke="currentColor"/></marker>',
    '<marker id="wb-export-triangle-start" markerWidth="12" markerHeight="12" refX="2" refY="6" orient="auto"><path d="M 12 0 L 0 6 L 12 12 z" fill="currentColor" stroke="currentColor"/></marker>',
    '<marker id="wb-export-dot" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto"><circle cx="5" cy="5" r="3.5" fill="currentColor"/></marker>',
    '<marker id="wb-export-dot-start" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto"><circle cx="5" cy="5" r="3.5" fill="currentColor"/></marker>',
    '<marker id="wb-export-diamond" markerWidth="14" markerHeight="10" refX="12" refY="5" orient="auto"><path d="M 0 5 L 7 0 L 14 5 L 7 10 Z" fill="currentColor"/></marker>',
    '<marker id="wb-export-diamond-start" markerWidth="14" markerHeight="10" refX="2" refY="5" orient="auto"><path d="M 0 5 L 7 0 L 14 5 L 7 10 Z" fill="currentColor"/></marker>',
    '</defs>',
  ].join('')
  const body = [
    ...data.strokes.map((s) => strokeToSvg(s)),
    ...data.edges.map((_, i) => edgeToSvg(data, i)),
    ...data.nodes.map((n) => nodeToSvg(n)),
  ].join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${b.w}" height="${b.h}">${defs}<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="white"/>${body}</svg>`
}

/**
 * 把 SVG 字符串转成 PNG Blob (Retina 2x)
 */
export async function exportPng(data: WhiteboardData, scale = 2): Promise<Blob> {
  const svg = exportSvg(data)
  const b = bbox(data)
  const w = Math.ceil(b.w * scale)
  const h = Math.ceil(b.h * scale)
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('SVG 图片加载失败'))
    })
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D 不可用')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((png) => {
        if (png) resolve(png)
        else reject(new Error('toBlob 返回 null'))
      }, 'image/png')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 触发浏览器下载
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyPngToClipboard(data: WhiteboardData): Promise<void> {
  const png = await exportPng(data)
  // ClipboardItem 不一定支持, 失败时退回到下载 PNG
  const anyWindow = window as unknown as { ClipboardItem?: typeof ClipboardItem }
  if (!anyWindow.ClipboardItem || !navigator.clipboard?.write) {
    throw new Error('浏览器不支持 ClipboardItem, 请改用下载 PNG')
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}
