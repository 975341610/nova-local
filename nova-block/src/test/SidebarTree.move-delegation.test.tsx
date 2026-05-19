/**
 * @vitest-environment jsdom
 *
 * Batch 4-pre · SidebarTree 必须把"移动"完全委托给父级 onNodeMove,
 * 不再直接调用 useNoteStore.updateNote(...)
 *
 * 契约 (审查 v4-#5):
 *  1. 拖拽移动后 onNodeMove 必须被调用一次, 参数 (nodeId, parentId, sortKey)
 *  2. SidebarTree 不再自己调用 useNoteStore.updateNote()
 *  3. 父级 (App) 是 source of truth, SidebarTree 是受控组件
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../components/sidebar/GlobalSearchPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/BacklinksPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/AIImportPanel', () => ({ default: () => <div /> }))

const { useNoteStoreMock, updateNoteSpy } = vi.hoisted(() => {
  const updateNoteSpy = vi.fn()
  const noteState = {
    notes: [
      {
        id: 1,
        title: '源节点',
        content: '',
        parent_id: null,
        position: 'm',
        type: 'file',
        is_folder: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
      {
        id: 2,
        title: '目标节点',
        content: '',
        parent_id: null,
        position: 'q',
        type: 'file',
        is_folder: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    ],
    updateNote: updateNoteSpy,
  }
  const useNoteStoreMock = (selector?: (s: typeof noteState) => unknown) =>
    selector ? selector(noteState) : noteState
  return { useNoteStoreMock, updateNoteSpy }
})

vi.mock('../store/useNoteStore', () => ({
  useNoteStore: useNoteStoreMock,
}))

import { SidebarTree } from '../components/sidebar/SidebarTree'

describe('SidebarTree · move delegation (Batch 4-pre)', () => {
  beforeEach(() => {
    localStorage.clear()
    updateNoteSpy.mockClear()
  })
  afterEach(() => {
    cleanup()
  })

  it('drag-drop move calls onNodeMove(nodeId, parentId, sortKey) exactly once', () => {
    const onNodeMove = vi.fn()
    render(<SidebarTree isCollapsed={false} onNodeMove={onNodeMove} />)

    const sourceNode = screen.getByTestId('qingzhi-tree-node-1')
    const targetNode = screen.getByTestId('qingzhi-tree-node-2')

    // simulate HTML5 drag and drop
    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(key: string, value: string) {
        this.data[key] = value
      },
      getData(key: string) {
        return this.data[key] || ''
      },
      effectAllowed: '',
      types: [] as string[],
    }

    fireEvent.dragStart(sourceNode, { dataTransfer })
    // hit the "into" zone (middle of target)
    fireEvent.dragOver(targetNode, {
      dataTransfer,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.drop(targetNode, { dataTransfer })

    expect(onNodeMove).toHaveBeenCalledTimes(1)
    const [movedId, parentId, sortKey] = onNodeMove.mock.calls[0]
    expect(String(movedId)).toBe('1')
    expect(typeof sortKey).toBe('string')
    // parentId may be '2' (into) or null/string depending on drop zone
    void parentId
  })

  it('SidebarTree does NOT call useNoteStore.updateNote during drag-drop move', () => {
    const onNodeMove = vi.fn()
    render(<SidebarTree isCollapsed={false} onNodeMove={onNodeMove} />)

    const sourceNode = screen.getByTestId('qingzhi-tree-node-1')
    const targetNode = screen.getByTestId('qingzhi-tree-node-2')

    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(key: string, value: string) {
        this.data[key] = value
      },
      getData(key: string) {
        return this.data[key] || ''
      },
      effectAllowed: '',
      types: [] as string[],
    }

    fireEvent.dragStart(sourceNode, { dataTransfer })
    fireEvent.dragOver(targetNode, {
      dataTransfer,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.drop(targetNode, { dataTransfer })

    expect(updateNoteSpy).not.toHaveBeenCalled()
  })
})
