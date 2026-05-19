/**
 * @vitest-environment jsdom
 *
 * Batch 4 · F2b · 多选交互
 *
 * 契约:
 *  1. Ctrl/Cmd+Click 切换单个选中态 (集合操作)
 *  2. Shift+Click 在最近一次锚点和当前节点之间形成连续范围选 (基于 visibleNodes 顺序)
 *  3. 普通 Click 清空多选,只走单选 onSelect 流程
 *  4. 多选>=2 时右键节点弹出"批量"菜单 (删除选中 / 移动选中)
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../components/sidebar/GlobalSearchPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/BacklinksPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/AIImportPanel', () => ({ default: () => <div /> }))

const { useNoteStoreMock } = vi.hoisted(() => {
  const noteState = {
    notes: [
      { id: 1, title: 'N1', content: '', parent_id: null, position: 'a', type: 'file', is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 2, title: 'N2', content: '', parent_id: null, position: 'b', type: 'file', is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 3, title: 'N3', content: '', parent_id: null, position: 'c', type: 'file', is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 4, title: 'N4', content: '', parent_id: null, position: 'd', type: 'file', is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
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

describe('SidebarTree · F2b multi-select', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    cleanup()
  })

  it('Ctrl+Click toggles a node into the multi-select set without firing single-select', () => {
    const onNodeSelect = vi.fn()
    render(<SidebarTree isCollapsed={false} onNodeSelect={onNodeSelect} />)

    const n1 = screen.getByTestId('qingzhi-tree-node-1')
    const n3 = screen.getByTestId('qingzhi-tree-node-3')
    fireEvent.click(n1, { ctrlKey: true })
    fireEvent.click(n3, { ctrlKey: true })

    // multi-select markers visible on selected items
    expect(n1.getAttribute('data-multi-selected')).toBe('true')
    expect(n3.getAttribute('data-multi-selected')).toBe('true')
    // unselected node has no marker
    expect(screen.getByTestId('qingzhi-tree-node-2').getAttribute('data-multi-selected')).not.toBe('true')

    // single-select must NOT fire while modifier-clicking
    expect(onNodeSelect).not.toHaveBeenCalled()
  })

  it('Shift+Click selects a contiguous range based on visible order', () => {
    render(<SidebarTree isCollapsed={false} />)

    const n1 = screen.getByTestId('qingzhi-tree-node-1')
    const n4 = screen.getByTestId('qingzhi-tree-node-4')
    // anchor = n1
    fireEvent.click(n1, { ctrlKey: true })
    // range to n4
    fireEvent.click(n4, { shiftKey: true })

    expect(screen.getByTestId('qingzhi-tree-node-1').getAttribute('data-multi-selected')).toBe('true')
    expect(screen.getByTestId('qingzhi-tree-node-2').getAttribute('data-multi-selected')).toBe('true')
    expect(screen.getByTestId('qingzhi-tree-node-3').getAttribute('data-multi-selected')).toBe('true')
    expect(screen.getByTestId('qingzhi-tree-node-4').getAttribute('data-multi-selected')).toBe('true')
  })

  it('plain Click clears the multi-select set and only fires single-select', () => {
    const onNodeSelect = vi.fn()
    render(<SidebarTree isCollapsed={false} onNodeSelect={onNodeSelect} />)

    const n1 = screen.getByTestId('qingzhi-tree-node-1')
    const n2 = screen.getByTestId('qingzhi-tree-node-2')
    fireEvent.click(n1, { ctrlKey: true })
    fireEvent.click(n2, { ctrlKey: true })
    expect(n1.getAttribute('data-multi-selected')).toBe('true')

    // plain click on n3
    const n3 = screen.getByTestId('qingzhi-tree-node-3')
    fireEvent.click(n3)

    expect(n1.getAttribute('data-multi-selected')).not.toBe('true')
    expect(n2.getAttribute('data-multi-selected')).not.toBe('true')
    expect(onNodeSelect).toHaveBeenLastCalledWith('3')
  })

  it('right-click on a multi-selected node opens BULK context menu (>=2 selected)', () => {
    render(<SidebarTree isCollapsed={false} />)

    const n1 = screen.getByTestId('qingzhi-tree-node-1')
    const n2 = screen.getByTestId('qingzhi-tree-node-2')
    fireEvent.click(n1, { ctrlKey: true })
    fireEvent.click(n2, { ctrlKey: true })

    fireEvent.contextMenu(n2, { clientX: 50, clientY: 50 })

    expect(screen.getByTestId('qingzhi-sidebar-bulk-context-menu')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-sidebar-bulk-move')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-sidebar-bulk-delete')).toBeTruthy()
    // single-node menu must NOT show
    expect(screen.queryByText('制作副本')).toBeNull()
  })
})
