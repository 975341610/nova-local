/**
 * Round 4 · Bug D · applyVaultChange 纯函数回归测试
 *
 * 关键不变量:
 *   atomic-rename 序列(unlink 旧 path + change 新 path)中,
 *   被移动的笔记永远不会从 store 中消失。
 */
import { describe, it, expect } from 'vitest'
import { applyVaultChange } from '../lib/novablock/applyVaultChange'

const norm = (p: string | null | undefined) => (p ? p.replace(/\//g, '\\').toLowerCase() : '')
const merger = (prev: any, incoming: any) => ({ ...(prev ?? {}), ...incoming })

describe('Round4 · Bug D · applyVaultChange', () => {
  it('rename: unlink 旧 path + change 新 path → 笔记保留(file_path 被刷新)', () => {
    const previousNotes = [
      { id: 1, file_path: 'vault/old.md', title: 'X', parent_id: null },
      { id: 2, file_path: 'vault/other.md', title: 'Y', parent_id: null },
    ]
    const result = applyVaultChange<any>({
      previousNotes,
      changedNotes: [
        { id: 1, file_path: 'vault/folder/new.md', title: 'X', parent_id: 99 },
      ],
      deletedPaths: new Set([norm('vault/old.md')]),
      normalizePath: norm,
      merger,
    })
    // 笔记 id=1 必须保留,且 file_path 已刷新到新路径
    const moved = result.find((n) => n.id === 1)
    expect(moved).toBeDefined()
    expect(moved!.file_path).toBe('vault/folder/new.md')
    expect(moved!.parent_id).toBe(99)
    // 其他笔记保持
    expect(result.find((n) => n.id === 2)).toBeDefined()
  })

  it('真删除: unlink 且没有对应 changedNotes → 笔记被移除', () => {
    const previousNotes = [
      { id: 1, file_path: 'vault/a.md' },
      { id: 2, file_path: 'vault/b.md' },
    ]
    const result = applyVaultChange<any>({
      previousNotes,
      changedNotes: [],
      deletedPaths: new Set([norm('vault/a.md')]),
      normalizePath: norm,
      merger,
    })
    expect(result.find((n) => n.id === 1)).toBeUndefined()
    expect(result.find((n) => n.id === 2)).toBeDefined()
  })

  it('bulk rename: 多条 unlink + 多条 change(同 id) → 所有笔记保留', () => {
    const previousNotes = [
      { id: 1, file_path: 'vault/a.md', parent_id: null },
      { id: 2, file_path: 'vault/b.md', parent_id: null },
      { id: 3, file_path: 'vault/c.md', parent_id: null },
    ]
    const result = applyVaultChange<any>({
      previousNotes,
      changedNotes: [
        { id: 1, file_path: 'vault/f/a.md', parent_id: 99 },
        { id: 2, file_path: 'vault/f/b.md', parent_id: 99 },
        { id: 3, file_path: 'vault/f/c.md', parent_id: 99 },
      ],
      deletedPaths: new Set([
        norm('vault/a.md'),
        norm('vault/b.md'),
        norm('vault/c.md'),
      ]),
      normalizePath: norm,
      merger,
    })
    expect(result).toHaveLength(3)
    expect(result.every((n) => n.parent_id === 99)).toBe(true)
    expect(result.map((n) => n.file_path).sort()).toEqual([
      'vault/f/a.md', 'vault/f/b.md', 'vault/f/c.md',
    ])
  })

  it('混合: 一条 rename + 一条真删 → 仅真删的被移除', () => {
    const previousNotes = [
      { id: 1, file_path: 'vault/keep.md', parent_id: null },
      { id: 2, file_path: 'vault/delete.md', parent_id: null },
    ]
    const result = applyVaultChange<any>({
      previousNotes,
      changedNotes: [
        { id: 1, file_path: 'vault/folder/keep.md', parent_id: 7 },
      ],
      deletedPaths: new Set([
        norm('vault/keep.md'),    // unlink 旧 path,但 changedNotes 里有 id=1 → 保留
        norm('vault/delete.md'),  // 真删
      ]),
      normalizePath: norm,
      merger,
    })
    expect(result.find((n) => n.id === 1)).toBeDefined()
    expect(result.find((n) => n.id === 1)!.file_path).toBe('vault/folder/keep.md')
    expect(result.find((n) => n.id === 2)).toBeUndefined()
  })
})
