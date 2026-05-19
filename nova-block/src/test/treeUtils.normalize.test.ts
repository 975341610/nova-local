/**
 * Batch 4 · F2b · normalizeSelectedRoots
 *
 * 契约:
 *  给定一个 selectedIds 集合 + 全部节点, 返回去除"祖先已被选"的子孙后的最小代表集.
 *  - 用于批量移动/批量删除前,避免对已被祖先包含的子孙重复操作或制造非法状态.
 *  - 不改变集合中其它无亲缘关系的节点.
 *  - 输入空集 → 返回空数组.
 */
import { describe, it, expect } from 'vitest'
import { normalizeSelectedRoots } from '../lib/novablock/treeUtils'
import type { TreeNode } from '../lib/novablock/treeUtils'

const nodes: TreeNode[] = [
  { id: 'A', parentId: null, sortKey: 'a', title: 'A', isFolder: true },
  { id: 'A1', parentId: 'A', sortKey: 'a', title: 'A1' },
  { id: 'A2', parentId: 'A', sortKey: 'b', title: 'A2', isFolder: true },
  { id: 'A2a', parentId: 'A2', sortKey: 'a', title: 'A2a' },
  { id: 'B', parentId: null, sortKey: 'b', title: 'B' },
  { id: 'C', parentId: null, sortKey: 'c', title: 'C', isFolder: true },
  { id: 'C1', parentId: 'C', sortKey: 'a', title: 'C1' },
]

describe('normalizeSelectedRoots (Batch 4 / F2b)', () => {
  it('returns empty array for empty input', () => {
    expect(normalizeSelectedRoots(nodes, new Set<string>())).toEqual([])
  })

  it('drops descendants when their ancestor is also selected', () => {
    // A 已选 → A1 / A2 / A2a 都应该被丢弃
    const got = normalizeSelectedRoots(nodes, new Set(['A', 'A1', 'A2', 'A2a']))
    expect(new Set(got)).toEqual(new Set(['A']))
  })

  it('keeps unrelated siblings; drops only descendants', () => {
    // 选 A2 + A2a + B + C1: 期望 [A2, B, C1]
    const got = normalizeSelectedRoots(nodes, new Set(['A2', 'A2a', 'B', 'C1']))
    expect(new Set(got)).toEqual(new Set(['A2', 'B', 'C1']))
  })
})
