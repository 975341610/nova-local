/**
 * v0.21.7 · A3 · 对齐与分布 (bbox anchor)
 *
 * 约定:
 *   - "bbox" = 所有选中节点的外接矩形
 *   - 对齐:  把所有节点的某条边/中线吸到 bbox 的同一条边上
 *   - 分布:  保证首尾位置不动, 中间节点按等间距排布 (至少 3 个才有效果)
 *
 * 所有函数都返回新 nodes 数组 (不变原对象), 便于接入 store.replace().
 */
import type { FlowNode } from './types'

export type AlignDir =
  | 'align-left'
  | 'align-center-x'
  | 'align-right'
  | 'align-top'
  | 'align-center-y'
  | 'align-bottom'
  | 'distribute-h'
  | 'distribute-v'

function bbox(ns: FlowNode[]) {
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
  return { minX, minY, maxX, maxY }
}

export function applyAlign(
  all: FlowNode[],
  selectedIds: string[],
  dir: AlignDir,
): FlowNode[] {
  const ids = new Set(selectedIds)
  const sel = all.filter((n) => ids.has(n.id))
  if (sel.length < 2) return all
  const b = bbox(sel)

  const patch: Record<string, Partial<FlowNode>> = {}

  if (dir === 'align-left') {
    for (const n of sel) patch[n.id] = { x: b.minX }
  } else if (dir === 'align-center-x') {
    const cx = (b.minX + b.maxX) / 2
    for (const n of sel) patch[n.id] = { x: cx - n.w / 2 }
  } else if (dir === 'align-right') {
    for (const n of sel) patch[n.id] = { x: b.maxX - n.w }
  } else if (dir === 'align-top') {
    for (const n of sel) patch[n.id] = { y: b.minY }
  } else if (dir === 'align-center-y') {
    const cy = (b.minY + b.maxY) / 2
    for (const n of sel) patch[n.id] = { y: cy - n.h / 2 }
  } else if (dir === 'align-bottom') {
    for (const n of sel) patch[n.id] = { y: b.maxY - n.h }
  } else if (dir === 'distribute-h') {
    if (sel.length < 3) return all
    const sorted = [...sel].sort((a, bb) => a.x + a.w / 2 - (bb.x + bb.w / 2))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const firstCenter = first.x + first.w / 2
    const lastCenter = last.x + last.w / 2
    const gap = (lastCenter - firstCenter) / (sorted.length - 1)
    for (let i = 1; i < sorted.length - 1; i++) {
      const targetCenter = firstCenter + gap * i
      patch[sorted[i].id] = { x: targetCenter - sorted[i].w / 2 }
    }
  } else if (dir === 'distribute-v') {
    if (sel.length < 3) return all
    const sorted = [...sel].sort((a, bb) => a.y + a.h / 2 - (bb.y + bb.h / 2))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const firstCenter = first.y + first.h / 2
    const lastCenter = last.y + last.h / 2
    const gap = (lastCenter - firstCenter) / (sorted.length - 1)
    for (let i = 1; i < sorted.length - 1; i++) {
      const targetCenter = firstCenter + gap * i
      patch[sorted[i].id] = { y: targetCenter - sorted[i].h / 2 }
    }
  }

  return all.map((n) => (patch[n.id] ? { ...n, ...patch[n.id] } : n))
}
