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
import { pointsToPath, resolveAnchor, routeOrthogonalWithWaypoints } from './orthogonalRouter'

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
    maxX = data.width
    maxY = data.height
  }
  const pad = 20
  return {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  }
}

function nodeToSvg(n: FlowNode): string {
  const fill = n.fill ?? n.color ?? DEFAULT_NODE_FILL[n.shape]
  const stroke = n.stroke ?? DEFAULT_NODE_STROKE
  const sw = n.strokeWidth ?? DEFAULT_NODE_STROKE_WIDTH
  const fs = n.fontSize ?? DEFAULT_NODE_FONT_SIZE
  const cx = n.x + n.w / 2
  const cy = n.y + n.h / 2
  const rot = n.rotation ? ` transform="rotate(${n.rotation} ${cx} ${cy})"` : ''
  const text = escapeXml(n.shape === 'plantuml' ? 'PlantUML' : n.text || '')
  let shape = ''
  switch (n.shape) {
    case 'ellipse':
      shape = `<ellipse cx="${cx}" cy="${cy}" rx="${n.w / 2}" ry="${n.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
      break
    case 'diamond':
      shape = `<polygon points="${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
      break
    case 'sticky':
      shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="4"/>`
      break
    case 'plantuml':
      shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="6" stroke-dasharray="6 4"/>`
      break
    case 'rect':
    default:
      shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="8"/>`
  }
  return `<g${rot}>${shape}<text x="${cx}" y="${cy + fs / 3}" text-anchor="middle" font-size="${fs}" fill="#0f172a" font-family="system-ui, sans-serif">${text}</text></g>`
}

function strokeToSvg(s: Stroke): string {
  if (s.points.length === 0) return ''
  const [h, ...rest] = s.points
  const d = `M ${h[0]} ${h[1]} ` + rest.map(([x, y]) => `L ${x} ${y}`).join(' ')
  return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round"/>`
}

function edgeToSvg(data: WhiteboardData, edgeIdx: number): string {
  const e = data.edges[edgeIdx]
  const from = data.nodes.find((n) => n.id === e.from)
  const to = data.nodes.find((n) => n.id === e.to)
  if (!from || !to) return ''
  const routing = e.routing ?? 'orthogonal'
  const pts =
    routing === 'orthogonal'
      ? routeOrthogonalWithWaypoints(from, to, e.fromAnchor, e.toAnchor, e.waypoints ?? [])
      : [
          resolveAnchor(from, e.fromAnchor ?? 'auto', to),
          resolveAnchor(to, e.toAnchor ?? 'auto', from),
        ]
  const d = pointsToPath(pts)
  const color = e.stroke ?? DEFAULT_EDGE_STROKE
  const sw = e.strokeWidth ?? DEFAULT_EDGE_STROKE_WIDTH
  const markerEnd = (e.arrowEnd ?? 'arrow') === 'arrow' ? ' marker-end="url(#wb-export-arrow)"' : ''
  const markerStart = e.arrowStart === 'arrow' ? ' marker-start="url(#wb-export-arrow)"' : ''
  const label = e.label
    ? `<text x="${(pts[0].x + pts[pts.length - 1].x) / 2}" y="${(pts[0].y + pts[pts.length - 1].y) / 2 - 4}" text-anchor="middle" font-size="11" fill="#475569" font-family="system-ui, sans-serif">${escapeXml(e.label)}</text>`
    : ''
  return `<g color="${color}"><path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}"${markerEnd}${markerStart}/>${label}</g>`
}

/**
 * 把 WhiteboardData 导出为独立 SVG 字符串
 */
export function exportSvg(data: WhiteboardData): string {
  const b = bbox(data)
  const defs = `<defs><marker id="wb-export-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>`
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
