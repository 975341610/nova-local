/**
 * v0.21.7 · A3 · align 单元测试
 */
import { describe, expect, it } from 'vitest'
import { applyAlign } from '../../lib/whiteboard/align'
import type { FlowNode } from '../../lib/whiteboard/types'

function mk(id: string, x: number, y: number, w = 40, h = 20): FlowNode {
  return { id, x, y, w, h, text: id, shape: 'rect' }
}

describe('applyAlign', () => {
  it('align-left puts all nodes at bbox.minX', () => {
    const ns = [mk('a', 10, 0), mk('b', 30, 50), mk('c', 100, 100)]
    const out = applyAlign(ns, ['a', 'b', 'c'], 'align-left')
    expect(out.map((n) => n.x)).toEqual([10, 10, 10])
    expect(out.map((n) => n.y)).toEqual([0, 50, 100]) // y unchanged
  })

  it('align-right puts all nodes right edge at bbox.maxX', () => {
    const ns = [mk('a', 10, 0, 40), mk('b', 30, 50, 60), mk('c', 100, 100, 40)]
    const out = applyAlign(ns, ['a', 'b', 'c'], 'align-right')
    const maxX = 140 // 100+40
    expect(out.find((n) => n.id === 'a')!.x + out.find((n) => n.id === 'a')!.w).toBe(maxX)
    expect(out.find((n) => n.id === 'b')!.x + out.find((n) => n.id === 'b')!.w).toBe(maxX)
    expect(out.find((n) => n.id === 'c')!.x + out.find((n) => n.id === 'c')!.w).toBe(maxX)
  })

  it('align-center-x centers nodes on bbox center', () => {
    const ns = [mk('a', 0, 0, 40), mk('b', 60, 0, 40)]
    const out = applyAlign(ns, ['a', 'b'], 'align-center-x')
    // bbox 0..100, center=50, node width 40 → x=30
    expect(out.map((n) => n.x)).toEqual([30, 30])
  })

  it('distribute-h evenly spaces 3 nodes by center', () => {
    const ns = [mk('a', 0, 0, 40), mk('b', 45, 0, 40), mk('c', 200, 0, 40)]
    const out = applyAlign(ns, ['a', 'b', 'c'], 'distribute-h')
    // firstCenter = 20, lastCenter = 220, gap = 100; middle center = 120
    // node width 40 → x = 100
    expect(out.find((n) => n.id === 'a')!.x).toBe(0)
    expect(out.find((n) => n.id === 'c')!.x).toBe(200)
    expect(out.find((n) => n.id === 'b')!.x).toBe(100)
  })

  it('distribute-h is no-op with <3 selected', () => {
    const ns = [mk('a', 0, 0), mk('b', 100, 0)]
    const out = applyAlign(ns, ['a', 'b'], 'distribute-h')
    expect(out).toEqual(ns)
  })

  it('no-op with <2 selected', () => {
    const ns = [mk('a', 0, 0), mk('b', 100, 0)]
    const out = applyAlign(ns, ['a'], 'align-left')
    expect(out).toEqual(ns)
  })

  it('non-selected nodes are untouched', () => {
    const ns = [mk('a', 10, 0), mk('b', 30, 50), mk('outside', 500, 500)]
    const out = applyAlign(ns, ['a', 'b'], 'align-left')
    expect(out.find((n) => n.id === 'outside')).toEqual(ns[2])
  })
})
