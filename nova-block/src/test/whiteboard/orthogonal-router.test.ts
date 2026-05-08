import { describe, it, expect } from 'vitest'
import { routeOrthogonal, resolveAnchor } from '../../lib/whiteboard/orthogonalRouter'
import type { FlowNode } from '../../lib/whiteboard/types'

function box(id: string, x: number, y: number, w = 100, h = 60): FlowNode {
  return { id, x, y, w, h, text: '', shape: 'rect' }
}

describe('orthogonalRouter.resolveAnchor', () => {
  it('returns right-edge midpoint for "right" anchor', () => {
    const n = box('a', 0, 0, 100, 60)
    expect(resolveAnchor(n, 'right')).toEqual({ x: 100, y: 30 })
  })
  it('returns left midpoint for "left" anchor', () => {
    const n = box('a', 20, 40, 80, 40)
    expect(resolveAnchor(n, 'left')).toEqual({ x: 20, y: 60 })
  })
  it('returns top midpoint for "top" anchor', () => {
    expect(resolveAnchor(box('a', 0, 0, 100, 60), 'top')).toEqual({ x: 50, y: 0 })
  })
  it('returns bottom midpoint for "bottom" anchor', () => {
    expect(resolveAnchor(box('a', 0, 0, 100, 60), 'bottom')).toEqual({ x: 50, y: 60 })
  })
})

describe('orthogonalRouter.routeOrthogonal', () => {
  it('produces 3 segments (H-V-H) for a left-to-right connection', () => {
    const a = box('a', 0, 0, 100, 60)
    const b = box('b', 300, 100, 100, 60)
    const pts = routeOrthogonal(a, b, 'auto', 'auto')
    // expect start = right-of-a, end = left-of-b
    expect(pts[0]).toEqual({ x: 100, y: 30 })
    expect(pts[pts.length - 1]).toEqual({ x: 300, y: 130 })
    // middle waypoints: two corners -> 4 points total
    expect(pts.length).toBe(4)
  })

  it('routes downward using V-H-V when mostly vertical', () => {
    const a = box('a', 0, 0, 100, 60)
    const b = box('b', 50, 300, 100, 60)
    const pts = routeOrthogonal(a, b, 'auto', 'auto')
    expect(pts[0]).toEqual({ x: 50, y: 60 }) // bottom of a
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 300 }) // top of b
  })

  it('honours explicit anchors', () => {
    const a = box('a', 0, 0, 100, 60)
    const b = box('b', 300, 0, 100, 60)
    const pts = routeOrthogonal(a, b, 'top', 'top')
    expect(pts[0]).toEqual({ x: 50, y: 0 })
    expect(pts[pts.length - 1]).toEqual({ x: 350, y: 0 })
  })

  it('returns at least 2 points for self-loop', () => {
    const a = box('a', 0, 0, 100, 60)
    const pts = routeOrthogonal(a, a, 'auto', 'auto')
    expect(pts.length).toBeGreaterThanOrEqual(2)
  })
})
