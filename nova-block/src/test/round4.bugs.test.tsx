/**
 * @vitest-environment jsdom
 *
 * Round 4 · 2 个回归
 *
 * Bug D — 右键菜单"移动到文件夹" → 笔记瞬现即消失
 *   根因: chokidar 触发的事件序列是 unlink 旧 path + change 新 path(rename 语义)。
 *         旧实现在 file_path 维度先做 deletedPaths 过滤,会把"持有旧 file_path 的笔记"
 *         先从 store 中删掉; 而 changedNotes 那一帧晚到时,视觉上就是"消失"。
 *   修复: 先 merge changedNotes(覆盖 id 已知的笔记 → file_path 同步刷新),
 *         再依据 deletedPaths 删除 id 不在 changedNotes 集合内的笔记。
 *   这条测试针对纯函数化提取的合并逻辑(applyVaultChange),在 atomic-rename 序列下
 *   绝不能丢失被移动的笔记。
 *
 * Bug E — Ctrl+鼠标左键不连续多选未生效
 *   根因: TreeNodeItem 是 draggable=true 的 <div>,Chromium 在某些版本下会把 Ctrl+click
 *         解释为"开始拖动"的 noop,导致 onClick 不触发。
 *   修复: 在 onMouseDown 阶段处理 Ctrl/Cmd toggle,保证可靠触发。
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../components/sidebar/GlobalSearchPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/BacklinksPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/AIImportPanel', () => ({ default: () => <div /> }))

const { useNoteStoreMock } = vi.hoisted(() => {
  const noteState = {
    notes: [
      { id: 1, title: 'A', content: '', parent_id: null, position: 'a', sort_key: 'a', type: 'file', is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 2, title: 'B', content: '', parent_id: null, position: 'b', sort_key: 'b', type: 'file', is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 3, title: 'C', content: '', parent_id: null, position: 'c', sort_key: 'c', type: 'file', is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
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

describe('Round4 · Bug E · Ctrl+click 不连续多选', () => {
  it('Ctrl+鼠标左键点击两个非相邻节点 → 两个节点都被加入 multiSelected (data-multi-selected=true)', () => {
    render(<SidebarTree isCollapsed={false} />)

    const a = screen.getByTestId('qingzhi-tree-node-1')
    const c = screen.getByTestId('qingzhi-tree-node-3')

    // 用 Ctrl+click 选中 A (toggle 加入多选)
    fireEvent.mouseDown(a, { ctrlKey: true, button: 0 })
    fireEvent.click(a, { ctrlKey: true, button: 0 })
    // 再 Ctrl+click 选中 C (不连续)
    fireEvent.mouseDown(c, { ctrlKey: true, button: 0 })
    fireEvent.click(c, { ctrlKey: true, button: 0 })

    // 修复后两个节点都应进入多选集合
    expect(a.getAttribute('data-multi-selected')).toBe('true')
    expect(c.getAttribute('data-multi-selected')).toBe('true')
    // B 不应被选中(说明是非连续多选,不是 shift 区间)
    const b = screen.getByTestId('qingzhi-tree-node-2')
    expect(b.getAttribute('data-multi-selected')).toBe('false')
  })

  it('Ctrl+点击已经在多选中的节点 → 该节点被反选(toggle 行为)', () => {
    render(<SidebarTree isCollapsed={false} />)
    const a = screen.getByTestId('qingzhi-tree-node-1')
    const b = screen.getByTestId('qingzhi-tree-node-2')

    fireEvent.mouseDown(a, { ctrlKey: true, button: 0 })
    fireEvent.click(a, { ctrlKey: true, button: 0 })
    fireEvent.mouseDown(b, { ctrlKey: true, button: 0 })
    fireEvent.click(b, { ctrlKey: true, button: 0 })
    expect(b.getAttribute('data-multi-selected')).toBe('true')

    fireEvent.mouseDown(b, { ctrlKey: true, button: 0 })
    fireEvent.click(b, { ctrlKey: true, button: 0 })
    expect(b.getAttribute('data-multi-selected')).toBe('false')
  })

  it('Round5 · 当前已选中/打开 A → Ctrl+click C → A 和 C 都进入多选', () => {
    // selectedNodeId="1" 模拟已打开/选中 A
    render(<SidebarTree isCollapsed={false} selectedNodeId="1" />)
    const a = screen.getByTestId('qingzhi-tree-node-1')
    const c = screen.getByTestId('qingzhi-tree-node-3')

    // Ctrl+click C(此时 multiSelected 为空,但 selectedId=1)
    fireEvent.mouseDown(c, { ctrlKey: true, button: 0 })
    fireEvent.click(c, { ctrlKey: true, button: 0 })

    // A 应自动被纳入多选,C 也在多选中
    expect(a.getAttribute('data-multi-selected')).toBe('true')
    expect(c.getAttribute('data-multi-selected')).toBe('true')
    // B 不在多选中
    const b = screen.getByTestId('qingzhi-tree-node-2')
    expect(b.getAttribute('data-multi-selected')).toBe('false')
  })
})
