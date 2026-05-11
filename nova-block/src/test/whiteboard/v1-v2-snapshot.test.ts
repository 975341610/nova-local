/**
 * v0.21.7 · C3 · v1 → v2 快照兼容测试
 *
 * 给定一份旧 v1 数据 (无 version, node 使用 color, edge 无 routing),
 * 经 migrate() 后应得到与预期 v2 快照一致的结果.
 *
 * 若将来调整迁移规则, 必须同时更新 expected 快照, 并在 CHANGELOG 说明字段演化.
 */
import { describe, expect, it } from 'vitest'
import { migrate } from '../../lib/whiteboard/schemaMigration'

const V1_FIXTURE = {
  strokes: [
    { color: '#000', size: 2, points: [[0, 0], [1, 1]] },
  ],
  nodes: [
    { id: 'a', x: 0, y: 0, w: 100, h: 40, text: '旧节点', shape: 'rect', color: '#fde68a' },
    { id: 'b', x: 200, y: 100, w: 80, h: 80, text: 'PU', shape: 'plantuml', color: '#f1f5f9' },
  ],
  edges: [{ id: 'e1', from: 'a', to: 'b' }],
  width: 720,
  height: 440,
}

describe('v1 → v2 snapshot compatibility', () => {
  it('migrates legacy v1 whiteboard to stable v2 shape', () => {
    const v2 = migrate(V1_FIXTURE as Parameters<typeof migrate>[0])

    // version 字段被补齐
    expect(v2.version).toBe(2)

    // 节点: color 保留, 同时 fill 新增为相同值
    expect(v2.nodes[0].fill).toBe('#fde68a')
    expect(v2.nodes[0].color).toBe('#fde68a')
    expect(v2.nodes[1].fill).toBe('#f1f5f9')

    // edges 必须有 routing, 默认 orthogonal
    expect(v2.edges[0].routing).toBe('orthogonal')

    // 原始不相关字段保持不变
    expect(v2.width).toBe(720)
    expect(v2.height).toBe(440)
    expect(v2.strokes.length).toBe(1)
    expect(v2.nodes.length).toBe(2)
    expect(v2.edges.length).toBe(1)
  })

  it('is stable: migrating already-v2 is a no-op modulo deep equality', () => {
    const v2 = migrate(V1_FIXTURE as Parameters<typeof migrate>[0])
    const again = migrate(v2 as Parameters<typeof migrate>[0])
    expect(again).toEqual(v2)
  })

  it('handles empty v1 payload', () => {
    const out = migrate({
      strokes: [],
      nodes: [],
      edges: [],
      width: 400,
      height: 300,
    } as Parameters<typeof migrate>[0])
    expect(out.version).toBe(2)
    expect(out.nodes).toEqual([])
    expect(out.edges).toEqual([])
  })

  it('preserves explicit v2 fields that are already set', () => {
    const input = {
      strokes: [],
      nodes: [
        { id: 'a', x: 0, y: 0, w: 10, h: 10, text: '', shape: 'rect', fill: '#fff', fontSize: 18 },
      ],
      edges: [
        { id: 'e', from: 'a', to: 'a', routing: 'straight', strokeWidth: 3, arrowEnd: 'none' },
      ],
      width: 100,
      height: 100,
      version: 2,
    }
    const out = migrate(input as Parameters<typeof migrate>[0])
    expect(out.nodes[0].fill).toBe('#fff')
    expect(out.nodes[0].fontSize).toBe(18)
    expect(out.edges[0].routing).toBe('straight')
    expect(out.edges[0].strokeWidth).toBe(3)
    expect(out.edges[0].arrowEnd).toBe('none')
  })
})
