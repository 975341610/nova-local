/**
 * v0.21.8 · A5' · routeOrthogonalWithWaypoints 单元测试
 *
 * 覆盖:
 *   - 空 waypoints 退化为自动正交布线
 *   - 单个 waypoint 能产生 detour
 *   - 多 waypoint 按顺序串联
 *   - self-loop 忽略 waypoints
 */
import { describe, expect, it } from 'vitest'
import { routeOrthogonal, routeOrthogonalWithWaypoints } from '../../lib/whiteboard/orthogonalRouter'
import type { FlowNode } from '../../lib/whiteboard/types'

const A: FlowNode = { id: 'a', x: 0, y: 0, w: 40, h: 40, text: '', shape: 'rect' }
const B: FlowNode = { id: 'b', x: 200, y: 200, w: 40, h: 40, text: '', shape: 'rect' }

describe('routeOrthogonalWithWaypoints', () => {
  it('returns base route when waypoints is empty', () => {
    const base = routeOrthogonal(A, B)
    const wp = routeOrthogonalWithWaypoints(A, B, 'auto', 'auto', [])
    expect(wp).toEqual(base)
  })

  it('returns base route when waypoints is undefined', () => {
    const base = routeOrthogonal(A, B)
    const wp = routeOrthogonalWithWaypoints(A, B)
    expect(wp).toEqual(base)
  })

  it('inserts detour through a single waypoint', () => {
    const pts = routeOrthogonalWithWaypoints(A, B, 'auto', 'auto', [{ x: 20, y: 300 }])
    // 起点 / 一些拐角 / 终点
    expect(pts.length).toBeGreaterThanOrEqual(3)
    // 经过 waypoint 坐标 (或附近共线点)
    const hasWp = pts.some((p) => Math.abs(p.x - 20) < 1 && Math.abs(p.y - 300) < 1)
    expect(hasWp).toBe(true)
    // 所有相邻段都严格正交(x 或 y 相等)
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      expect(a.x === b.x || a.y === b.y).toBe(true)
    }
  })

  it('chains multiple waypoints in order', () => {
    const pts = routeOrthogonalWithWaypoints(
      A,
      B,
      'auto',
      'auto',
      [
        { x: 100, y: 50 },
        { x: 300, y: 50 },
        { x: 300, y: 150 },
      ],
    )
    // 全部正交
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      expect(a.x === b.x || a.y === b.y).toBe(true)
    }
    // 每个 waypoint 都应出现在折线上
    for (const wp of [
      { x: 100, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 150 },
    ]) {
      const hit = pts.some((p) => Math.abs(p.x - wp.x) < 1 && Math.abs(p.y - wp.y) < 1)
      expect(hit).toBe(true)
    }
  })

  it('ignores waypoints for self-loop', () => {
    const base = routeOrthogonal(A, A)
    const wp = routeOrthogonalWithWaypoints(A, A, 'auto', 'auto', [{ x: 500, y: 500 }])
    expect(wp).toEqual(base)
  })
})
