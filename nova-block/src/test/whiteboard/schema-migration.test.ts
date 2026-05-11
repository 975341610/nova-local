import { describe, it, expect } from 'vitest'
import { migrate } from '../../lib/whiteboard/schemaMigration'
import { DEFAULT_EDGE_ROUTING } from '../../lib/whiteboard/types'

describe('whiteboard schemaMigration', () => {
  it('migrates v1 data (no version field) to v2', () => {
    const v1 = {
      strokes: [{ color: '#000', size: 2, points: [[1, 2]] }],
      nodes: [{ id: 'n1', x: 0, y: 0, w: 100, h: 40, text: 'A', shape: 'rect', color: '#eef' }],
      edges: [{ id: 'e1', from: 'n1', to: 'n1' }],
      width: 720,
      height: 440,
    }
    const v2 = migrate(v1 as any)
    expect(v2.version).toBe(2)
    // color -> fill mapping preserved
    expect(v2.nodes[0].fill).toBe('#eef')
    // edges default to orthogonal
    expect(v2.edges[0].routing).toBe(DEFAULT_EDGE_ROUTING)
    // default viewport present
    expect(v2.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
    // strokes preserved
    expect(v2.strokes).toHaveLength(1)
  })

  it('passes through v2 data unchanged', () => {
    const v2 = {
      strokes: [],
      nodes: [],
      edges: [],
      width: 720,
      height: 440,
      viewport: { x: 5, y: 10, zoom: 1.5 },
      version: 2 as const,
    }
    const out = migrate(v2)
    expect(out.version).toBe(2)
    expect(out.viewport).toEqual({ x: 5, y: 10, zoom: 1.5 })
  })

  it('fills defaults for missing arrays / fields', () => {
    const bad = { width: 500, height: 300 } as any
    const out = migrate(bad)
    expect(out.nodes).toEqual([])
    expect(out.edges).toEqual([])
    expect(out.strokes).toEqual([])
    expect(out.width).toBe(500)
    expect(out.height).toBe(300)
    expect(out.version).toBe(2)
  })

  it('preserves explicit edge routing override', () => {
    const v1 = {
      strokes: [],
      nodes: [],
      edges: [{ id: 'e1', from: 'a', to: 'b', routing: 'straight' }],
      width: 100,
      height: 100,
    }
    const out = migrate(v1 as any)
    expect(out.edges[0].routing).toBe('straight')
  })
})
