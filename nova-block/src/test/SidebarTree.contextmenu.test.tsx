/**
 * @vitest-environment jsdom
 *
 * F2a · 空白区右键菜单
 *
 * 契约 (审查 v4-#3):
 *  1. 右键 [data-sidebar-tree-canvas] 空白处 → 弹空白菜单
 *     (新建文件夹 / 笔记 / 画布,各自调用 onNodeAdd(null, type))
 *  2. 右键节点 (e.target.closest('[data-tree-node-id]')) → 节点级菜单接管,
 *     不弹空白菜单
 *  3. 右键 sidebar 其它区域 (header / tab / quick-search) → 不弹空白菜单
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../components/sidebar/GlobalSearchPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/BacklinksPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/AIImportPanel', () => ({ default: () => <div /> }))

const { useNoteStoreMock } = vi.hoisted(() => {
  const noteState = {
    notes: [
      {
        id: 1,
        title: '测试笔记',
        content: '',
        parent_id: null,
        position: 'm',
        type: 'file',
        is_folder: false,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
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

describe('SidebarTree · F2a blank-area context menu', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    cleanup()
  })

  it('exposes [data-sidebar-tree-canvas] wrapper around the tree scroll list', () => {
    render(<SidebarTree isCollapsed={false} />)
    const canvas = document.querySelector('[data-sidebar-tree-canvas]')
    expect(canvas).not.toBeNull()
  })

  it('right-click on blank canvas area opens the blank context menu with 3 actions', () => {
    render(<SidebarTree isCollapsed={false} />)
    const canvas = document.querySelector('[data-sidebar-tree-canvas]') as HTMLElement
    fireEvent.contextMenu(canvas, { clientX: 50, clientY: 200 })
    const menu = screen.getByTestId('qingzhi-sidebar-blank-context-menu')
    expect(menu).toBeTruthy()
    expect(screen.getByTestId('qingzhi-sidebar-blank-new-folder')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-sidebar-blank-new-note')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-sidebar-blank-new-canvas')).toBeTruthy()
  })

  it('clicking blank-menu items calls onNodeAdd(null, type)', () => {
    const onNodeAdd = vi.fn()
    render(<SidebarTree isCollapsed={false} onNodeAdd={onNodeAdd} />)
    const canvas = document.querySelector('[data-sidebar-tree-canvas]') as HTMLElement
    fireEvent.contextMenu(canvas, { clientX: 50, clientY: 200 })

    fireEvent.click(screen.getByTestId('qingzhi-sidebar-blank-new-folder'))
    expect(onNodeAdd).toHaveBeenLastCalledWith(null, 'folder')

    fireEvent.contextMenu(canvas, { clientX: 50, clientY: 200 })
    fireEvent.click(screen.getByTestId('qingzhi-sidebar-blank-new-note'))
    expect(onNodeAdd).toHaveBeenLastCalledWith(null, 'file')

    fireEvent.contextMenu(canvas, { clientX: 50, clientY: 200 })
    fireEvent.click(screen.getByTestId('qingzhi-sidebar-blank-new-canvas'))
    expect(onNodeAdd).toHaveBeenLastCalledWith(null, 'canvas')
  })

  it('right-click on a tree node does NOT open the blank menu', () => {
    render(<SidebarTree isCollapsed={false} />)
    // 模拟节点元素:即便测试中 mock 没塞 data-tree-node-id,我们也手工注入一个
    // 子元素以模拟用户在 [data-tree-node-id] 子树上右击
    const canvas = document.querySelector('[data-sidebar-tree-canvas]') as HTMLElement
    const fakeNode = document.createElement('div')
    fakeNode.setAttribute('data-tree-node-id', '1')
    fakeNode.textContent = 'fake'
    canvas.appendChild(fakeNode)
    fireEvent.contextMenu(fakeNode, { clientX: 50, clientY: 200, bubbles: true })
    expect(screen.queryByTestId('qingzhi-sidebar-blank-context-menu')).toBeNull()
  })

  it('right-click on sidebar header / tab strip / quick-search does NOT open blank menu', () => {
    render(<SidebarTree isCollapsed={false} />)
    const header = screen.getByTestId('qingzhi-sidebar-header')
    fireEvent.contextMenu(header)
    expect(screen.queryByTestId('qingzhi-sidebar-blank-context-menu')).toBeNull()

    const tabStrip = screen.getByTestId('qingzhi-sidebar-tab-strip')
    fireEvent.contextMenu(tabStrip)
    expect(screen.queryByTestId('qingzhi-sidebar-blank-context-menu')).toBeNull()

    const quickSearch = screen.getByTestId('qingzhi-sidebar-quick-search')
    fireEvent.contextMenu(quickSearch)
    expect(screen.queryByTestId('qingzhi-sidebar-blank-context-menu')).toBeNull()
  })
})
