/**
 * @vitest-environment jsdom
 *
 * Batch 4 · F2b · 批量操作回调
 *
 * 契约:
 *  1. 批量删除菜单 → onNodesBulkDelete([...ids]) 被调用一次,
 *     传入的 id 集合是 normalizeSelectedRoots 的结果 (祖先包含子孙时只保留祖先).
 *  2. 批量"移动到根目录" → onNodesBulkMove([...ids], null) 被调用一次,
 *     ids 同样是 normalize 之后的根集合.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../components/sidebar/GlobalSearchPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/BacklinksPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/AIImportPanel', () => ({ default: () => <div /> }))

const { useNoteStoreMock } = vi.hoisted(() => {
  const noteState = {
    notes: [
      { id: 1, title: 'Folder',  content: '', parent_id: null, position: 'a', type: 'folder', is_folder: true,  created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 2, title: 'Child1', content: '', parent_id: 1,    position: 'a', type: 'file',   is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 3, title: 'Sib',    content: '', parent_id: null, position: 'b', type: 'file',   is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
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

describe('SidebarTree · F2b bulk-ops callbacks', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    cleanup()
  })

  it('bulk delete dispatches onNodesBulkDelete with normalized roots', () => {
    const onNodesBulkDelete = vi.fn()
    render(
      <SidebarTree
        isCollapsed={false}
        onNodesBulkDelete={onNodesBulkDelete}
      />,
    )

    // expand folder so child shows up; we select Folder + its descendant Child1 + Sib
    fireEvent.click(screen.getByTestId('qingzhi-tree-node-disclosure-1'))
    const folder = screen.getByTestId('qingzhi-tree-node-1')
    const sib = screen.getByTestId('qingzhi-tree-node-3')
    fireEvent.click(folder, { ctrlKey: true })
    // Child1 (id=2) only visible after expansion; if not present, skip — folder should still be normalized to itself.
    const maybeChild = screen.queryByTestId('qingzhi-tree-node-2')
    if (maybeChild) {
      fireEvent.click(maybeChild, { ctrlKey: true })
    }
    fireEvent.click(sib, { ctrlKey: true })

    fireEvent.contextMenu(folder, { clientX: 50, clientY: 50 })
    fireEvent.click(screen.getByTestId('qingzhi-sidebar-bulk-delete'))
    // confirm modal
    fireEvent.click(screen.getByTestId('qingzhi-sidebar-bulk-delete-confirm'))

    expect(onNodesBulkDelete).toHaveBeenCalledTimes(1)
    const ids = onNodesBulkDelete.mock.calls[0][0] as string[]
    expect(new Set(ids)).toEqual(new Set(['1', '3']))
  })

  it('bulk move-to-root dispatches onNodesBulkMove([...ids], null)', () => {
    const onNodesBulkMove = vi.fn()
    render(
      <SidebarTree
        isCollapsed={false}
        onNodesBulkMove={onNodesBulkMove}
      />,
    )

    const folder = screen.getByTestId('qingzhi-tree-node-1')
    const sib = screen.getByTestId('qingzhi-tree-node-3')
    fireEvent.click(folder, { ctrlKey: true })
    fireEvent.click(sib, { ctrlKey: true })

    fireEvent.contextMenu(folder, { clientX: 50, clientY: 50 })
    fireEvent.click(screen.getByTestId('qingzhi-sidebar-bulk-move'))
    // dialog appears with a "root" option
    fireEvent.click(screen.getByTestId('qingzhi-sidebar-bulk-move-root'))

    expect(onNodesBulkMove).toHaveBeenCalledTimes(1)
    const [ids, parentId] = onNodesBulkMove.mock.calls[0]
    expect(new Set(ids)).toEqual(new Set(['1', '3']))
    expect(parentId).toBeNull()
  })
})
