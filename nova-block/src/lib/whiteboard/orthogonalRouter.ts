/**
 * v0.21.6 · 简化版 Manhattan 正交路由
 *
 * 设计原则:
 *   - 不做障碍避让 (接受线穿过其它节点)
 *   - 水平优先 (H-V-H) 或垂直优先 (V-H-V), 取决于主方向
 *   - 'auto' anchor 根据相对位置选取最近的一个边 (right/left/top/bottom)
 */
import type { Anchor, FlowNode } from './types'

export interface Point {
  x: number
  y: number
}

/** 给节点几何解算指定锚点的绝对坐标 */
export function resolveAnchor(n: FlowNode, anchor: Anchor, counterpart?: FlowNode): Point {
  const cx = n.x + n.w / 2
  const cy = n.y + n.h / 2

  if (anchor === 'auto') {
    if (counterpart) {
      const ccx = counterpart.x + counterpart.w / 2
      const ccy = counterpart.y + counterpart.h / 2
      const dx = ccx - cx
      const dy = ccy - cy
      if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? { x: n.x + n.w, y: cy } : { x: n.x, y: cy }
      }
      return dy >= 0 ? { x: cx, y: n.y + n.h } : { x: cx, y: n.y }
    }
    return { x: n.x + n.w, y: cy }
  }

  switch (anchor) {
    case 'right':
      return { x: n.x + n.w, y: cy }
    case 'left':
      return { x: n.x, y: cy }
    case 'top':
      return { x: cx, y: n.y }
    case 'bottom':
      return { x: cx, y: n.y + n.h }
  }
}

/** 返回正交折线的顶点列表 (起点 … 终点) */
export function routeOrthogonal(
  from: FlowNode,
  to: FlowNode,
  fromAnchor: Anchor = 'auto',
  toAnchor: Anchor = 'auto',
): Point[] {
  // self-loop: 画一个在右侧的小环
  if (from === to || from.id === to.id) {
    const rx = from.x + from.w
    const ry = from.y + from.h / 2
    return [
      { x: rx, y: ry },
      { x: rx + 24, y: ry },
      { x: rx + 24, y: ry - 24 },
      { x: rx, y: ry - 24 },
    ]
  }

  const p0 = resolveAnchor(from, fromAnchor, to)
  const p1 = resolveAnchor(to, toAnchor, from)

  const dx = p1.x - p0.x
  const dy = p1.y - p0.y

  if (Math.abs(dx) >= Math.abs(dy)) {
    // H-V-H: 在中点处折
    const midX = p0.x + dx / 2
    return [
      p0,
      { x: midX, y: p0.y },
      { x: midX, y: p1.y },
      p1,
    ]
  }
  // V-H-V
  const midY = p0.y + dy / 2
  return [
    p0,
    { x: p0.x, y: midY },
    { x: p1.x, y: midY },
    p1,
  ]
}

/**
 * v0.21.8 · 携带用户自定义折点的正交路由
 *
 * 规则:
 *   - waypoints 为空或未提供 → 退化为 routeOrthogonal
 *   - 否则: 起点 anchor → 逐个 waypoint → 终点 anchor, 相邻段强制走"先水平再垂直"(或反之, 取主方向)
 *     但段与段之间若已共线则不再插入转角, 避免出现 0 长度段.
 */
export function routeOrthogonalWithWaypoints(
  from: FlowNode,
  to: FlowNode,
  fromAnchor: Anchor = 'auto',
  toAnchor: Anchor = 'auto',
  waypoints: Point[] = [],
): Point[] {
  if (!waypoints || waypoints.length === 0) {
    return routeOrthogonal(from, to, fromAnchor, toAnchor)
  }
  if (from.id === to.id) return routeOrthogonal(from, to, fromAnchor, toAnchor)

  const p0 = resolveAnchor(from, fromAnchor, waypoints[0] ? ({ id: '__wp__', x: waypoints[0].x, y: waypoints[0].y, w: 0, h: 0, text: '', shape: 'rect' } as FlowNode) : to)
  const pN = resolveAnchor(
    to,
    toAnchor,
    waypoints[waypoints.length - 1]
      ? ({ id: '__wp__', x: waypoints[waypoints.length - 1].x, y: waypoints[waypoints.length - 1].y, w: 0, h: 0, text: '', shape: 'rect' } as FlowNode)
      : from,
  )

  const pts: Point[] = [p0]
  const chain: Point[] = [p0, ...waypoints.map((w) => ({ x: w.x, y: w.y })), pN]

  // 在相邻两点之间插入正交转角
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1]
    const b = chain[i]
    if (a.x === b.x || a.y === b.y) {
      pts.push(b)
      continue
    }
    // 主方向: 若上一段是横的或起点 (i==1), 优先先走水平
    const prev = pts[pts.length - 1]
    const lastHorizontal = pts.length >= 2 && pts[pts.length - 2].y === prev.y
    if (lastHorizontal) {
      // 先纵再横
      pts.push({ x: a.x, y: b.y })
    } else {
      // 先横再纵
      pts.push({ x: b.x, y: a.y })
    }
    pts.push(b)
  }

  // 去掉相邻重复
  const dedup: Point[] = []
  for (const p of pts) {
    const last = dedup[dedup.length - 1]
    if (!last || last.x !== p.x || last.y !== p.y) dedup.push(p)
  }
  return dedup
}

/** 把点列表转成 SVG path d 字符串 */
export function pointsToPath(pts: Point[]): string {
  if (pts.length === 0) return ''
  const [h, ...rest] = pts
  return `M ${h.x} ${h.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(' ')
}

/**
 * v0.21.11 · 曲线路由 (三次贝塞尔)
 * 两端 anchor 自动取 'auto' 方向, 控制点向法线方向偏移距离的 40%.
 */
export function routeCurve(
  from: FlowNode,
  to: FlowNode,
  fromAnchor: Anchor = 'auto',
  toAnchor: Anchor = 'auto',
): { pts: Point[]; d: string } {
  if (from.id === to.id) {
    const pts = routeOrthogonal(from, to, fromAnchor, toAnchor)
    return { pts, d: pointsToPath(pts) }
  }
  const p0 = resolveAnchor(from, fromAnchor, to)
  const p1 = resolveAnchor(to, toAnchor, from)
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  // 水平/垂直自适应的控制点偏置
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const bend = Math.min(120, Math.max(40, Math.hypot(dx, dy) * 0.4))
  const c1 = horizontal
    ? { x: p0.x + Math.sign(dx || 1) * bend, y: p0.y }
    : { x: p0.x, y: p0.y + Math.sign(dy || 1) * bend }
  const c2 = horizontal
    ? { x: p1.x - Math.sign(dx || 1) * bend, y: p1.y }
    : { x: p1.x, y: p1.y - Math.sign(dy || 1) * bend }
  const d = `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p1.x} ${p1.y}`
  return { pts: [p0, p1], d }
}
