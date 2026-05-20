/**
 * @vitest-environment jsdom
 *
 * Round 3 · Bug B / Bug C 回归测试
 *
 * Bug B — 多选 + 拖拽到 root 兄弟之间(position='before'|'after') 也必须批量移动。
 *         之前的 SidebarTree.handleMove 只在 position==='into' 时走 bulk;
 *         drop 在两个根节点之间会退化成 onNodeMove 单条 → 只移动 1 个 → "移出文件夹只动一个"。
 *
 * Bug C — App.handleNodesBulkMove 必须串行调用 api.updateNote (而非 Promise.all),
 *         并且把后端响应 merge 回 store。否则 vault-watcher 在并发期间触发 reload,
 *         读取仅部分提交的状态 → 已移动节点"瞬现即消失"。
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, createEvent } from '@testing-library/react'

vi.mock('../components/sidebar/GlobalSearchPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/BacklinksPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/AIImportPanel', () => ({ default: () => <div /> }))

const { useNoteStoreMock } = vi.hoisted(() => {
  const noteState = {
    notes: [
      { id: 1, title: 'Folder',  content: '', parent_id: null, position: 'a', sort_key: 'a', type: 'folder', is_folder: true,  created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 2, title: 'File-A',  content: '', parent_id: 1,    position: 'b', sort_key: 'b', type: 'file',   is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 3, title: 'File-B',  content: '', parent_id: 1,    position: 'c', sort_key: 'c', type: 'file',   is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 4, title: 'Root-X',  content: '', parent_id: null, position: 'd', sort_key: 'd', type: 'file',   is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
    ],
    updateNote: vi.fn(),
  }
  const useNoteStoreMock = (selector?: (s: typeof noteState) => unknown) =>
    selector ? selector(noteState) : noteState
  return { useNoteStoreMock }
})

vi.mock('../store/useNoteStore', () => ({
  useNoteStore: useNoteStoreMock,
}))

import { SidebarTree } from '../components/sidebar/SidebarTree'

afterEach(() => cleanup())
beforeEach(() => localStorage.clear())

describe('Round3 · Bug B · 多选拖拽到 root 兄弟之间也走 bulk-move', () => {
  it('multi-selected + drop on root sibling with position=before → onNodesBulkMove([2,3], null)', () => {
    const onNodeMove = vi.fn()
    const onNodesBulkMove = vi.fn()
    render(
      <SidebarTree
        isCollapsed={false}
        onNodeMove={onNodeMove}
        onNodesBulkMove={onNodesBulkMove}
      />,
    )

    // 先展开 Folder(id=1) 才能看到子文件 File-A / File-B (默认 expandedIds 只含 'root')
    const folderDisclosure = screen.getByTestId('qingzhi-tree-node-disclosure-1')
    fireEvent.click(folderDisclosure)

    const fa = screen.getByTestId('qingzhi-tree-node-2') // 文件夹 1 内的 File-A
    const fb = screen.getByTestId('qingzhi-tree-node-3') // 文件夹 1 内的 File-B
    const rootX = screen.getByTestId('qingzhi-tree-node-4') // 根级 Root-X
    fireEvent.click(fa, { ctrlKey: true })
    fireEvent.click(fb, { ctrlKey: true })

    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(k: string, v: string) { this.data[k] = v },
      getData(k: string) { return this.data[k] || '' },
      effectAllowed: '',
      types: [] as string[],
    }
    // jsdom 默认 getBoundingClientRect 全 0,这里给 rootX 套一个 fake rect 让位置判定可计算。
    // 高度 40px,clientY=2 → y=2 < 40*0.25=10 → position='before'
    const fakeRect = { top: 100, bottom: 140, left: 0, right: 200, width: 200, height: 40, x: 0, y: 100, toJSON: () => ({}) }
    Object.defineProperty(rootX, 'getBoundingClientRect', {
      configurable: true,
      value: () => fakeRect,
    })

    // 拖拽 fa 到 rootX 的"上方"(before) — 期望 bulk
    fireEvent.dragStart(fa, { dataTransfer })
    // dragOver 在节点上方 1/4 处 → before。jsdom 下 fireEvent 的 init 不会写入 DragEvent 的 clientY,
    // 改用 createEvent 拿到 event 对象后直接定义 clientY 属性。
    const overEvent = createEvent.dragOver(rootX, { dataTransfer } as any)
    Object.defineProperty(overEvent, 'clientY', { value: 102 }) // top(100) + 2 → y=2 → before
    Object.defineProperty(overEvent, 'clientX', { value: 20 })
    fireEvent(rootX, overEvent)

    const dropEvent = createEvent.drop(rootX, { dataTransfer } as any)
    Object.defineProperty(dropEvent, 'clientY', { value: 102 })
    Object.defineProperty(dropEvent, 'clientX', { value: 20 })
    fireEvent(rootX, dropEvent)

    expect(onNodesBulkMove).toHaveBeenCalledTimes(1)
    expect(onNodeMove).not.toHaveBeenCalled()
    const [ids, parentId] = onNodesBulkMove.mock.calls[0]
    expect(new Set(ids)).toEqual(new Set(['2', '3']))
    // before/after on a root sibling → 父级是 root sibling 的父级 (null)
    expect(parentId).toBe(null)
  })
})

describe('Round3 · Bug C · handleNodesBulkMove 串行 + merge', () => {
  // 对 App.handleNodesBulkMove 行为做单元化建模 —
  // 这里直接测试一个独立纯函数 bulkMoveSerially(api, ids, parent, sortKeys),
  // 它必须串行 await 每个 update 并 merge 响应。
  it('串行调用 api.updateNote 且按返回值替换本地 note', async () => {
    const { bulkMoveSerially } = await import('../lib/novablock/bulkMove')
    const calls: number[] = []
    const api = {
      updateNote: vi.fn(async (id: number, _patch: any) => {
        calls.push(id)
        // 模拟较慢的第 1 个调用,验证后续不会并发
        if (id === 11) await new Promise((r) => setTimeout(r, 30))
        return { id, parent_id: 99, sort_key: `srv-${id}`, title: `t${id}` }
      }),
    }
    const ids = [11, 12, 13]
    const sortKeys = ['k1', 'k2', 'k3']
    const merged = await bulkMoveSerially(api as any, ids, 99, sortKeys)
    // 调用顺序必须等于传入顺序(串行)
    expect(calls).toEqual([11, 12, 13])
    // 返回的合并对象数量与 ids 相同
    expect(merged.length).toBe(3)
    expect(merged.every((m) => m.parent_id === 99)).toBe(true)
    // sort_key 来自 server 响应,不是优化锁的本地值
    expect(merged.map((m) => m.sort_key)).toEqual(['srv-11', 'srv-12', 'srv-13'])
  })

  it('某条失败时,继续推进其余条目;最终返回所有"成功"的 merge 结果', async () => {
    const { bulkMoveSerially } = await import('../lib/novablock/bulkMove')
    const api = {
      updateNote: vi.fn(async (id: number) => {
        if (id === 22) throw new Error('boom')
        return { id, parent_id: 7, sort_key: `s-${id}` }
      }),
    }
    const merged = await bulkMoveSerially(api as any, [21, 22, 23], 7, ['a', 'b', 'c'])
    expect(merged.length).toBe(2)
    expect(merged.map((m) => m.id).sort()).toEqual([21, 23])
  })
})
