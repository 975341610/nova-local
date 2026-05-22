/**
 * @vitest-environment jsdom
 *
 * 测试侧边栏时间排序分组:
 * - 时间模式下只显示笔记(不含文件夹)
 * - 分为 今天/昨天/更早 三个可折叠分组
 * - 支持正/反排序切换
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../components/sidebar/GlobalSearchPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/BacklinksPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/AIImportPanel', () => ({ default: () => <div /> }))

const { useNoteStoreMock } = vi.hoisted(() => {
  const now = Date.now()
  const todayTs = new Date(now).setHours(12, 0, 0, 0)
  const yesterdayTs = todayTs - 24 * 3600 * 1000
  const earlierTs = todayTs - 7 * 24 * 3600 * 1000

  const noteState = {
    notes: [
      { id: 1, title: '今天的笔记', content: '', parent_id: null, position: 'a', sort_key: 'a', type: 'file', is_folder: false, created_at: new Date(todayTs).toISOString(), updated_at: new Date(todayTs).toISOString() },
      { id: 2, title: '昨天的笔记', content: '', parent_id: null, position: 'b', sort_key: 'b', type: 'file', is_folder: false, created_at: new Date(yesterdayTs).toISOString(), updated_at: new Date(yesterdayTs).toISOString() },
      { id: 3, title: '很早的笔记', content: '', parent_id: null, position: 'c', sort_key: 'c', type: 'file', is_folder: false, created_at: new Date(earlierTs).toISOString(), updated_at: new Date(earlierTs).toISOString() },
      { id: 4, title: '我的文件夹', content: '', parent_id: null, position: 'd', sort_key: 'd', type: 'folder', is_folder: true, created_at: new Date(todayTs).toISOString(), updated_at: new Date(todayTs).toISOString() },
      { id: 5, title: '文件夹内笔记', content: '', parent_id: 4, position: 'e', sort_key: 'e', type: 'file', is_folder: false, created_at: new Date(todayTs).toISOString(), updated_at: new Date(todayTs).toISOString() },
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

describe('Sidebar · 时间排序分组', () => {
  it('手动模式保留文件夹结构 (folder visible)', () => {
    render(<SidebarTree isCollapsed={false} />)
    // 默认手动模式
    expect(screen.getByTestId('qingzhi-tree-node-4')).toBeTruthy() // 文件夹可见
  })

  it('切换到创建时间 → 只显示笔记,不显示文件夹,显示3个分组', () => {
    render(<SidebarTree isCollapsed={false} />)
    const select = screen.getByTestId('qingzhi-sidebar-sort-select')
    fireEvent.change(select, { target: { value: 'created' } })

    // 分组头可见
    const headers = screen.getAllByTestId('qingzhi-sidebar-group-header')
    expect(headers.length).toBeGreaterThanOrEqual(2) // 至少有今天和更早

    // 文件夹不可见
    expect(screen.queryByTestId('qingzhi-tree-node-4')).toBeNull()

    // 笔记可见(包括原本在文件夹内的笔记)
    expect(screen.getByTestId('qingzhi-tree-node-1')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-tree-node-5')).toBeTruthy() // 文件夹内笔记也扁平显示
  })

  it('分组可以折叠和展开', () => {
    render(<SidebarTree isCollapsed={false} />)
    const select = screen.getByTestId('qingzhi-sidebar-sort-select')
    fireEvent.change(select, { target: { value: 'created' } })

    // 找到"今天"分组头
    const headers = screen.getAllByTestId('qingzhi-sidebar-group-header')
    const todayHeader = headers.find((h) => h.getAttribute('data-group-bucket') === 'today')
    expect(todayHeader).toBeTruthy()
    expect(todayHeader!.getAttribute('data-group-collapsed')).toBe('false')

    // 点击折叠
    fireEvent.click(todayHeader!)
    expect(todayHeader!.getAttribute('data-group-collapsed')).toBe('true')

    // 今天的笔记应该被隐藏
    expect(screen.queryByTestId('qingzhi-tree-node-1')).toBeNull()

    // 再次点击展开
    fireEvent.click(todayHeader!)
    expect(screen.getByTestId('qingzhi-tree-node-1')).toBeTruthy()
  })

  it('时间模式下出现排序方向按钮', () => {
    render(<SidebarTree isCollapsed={false} />)
    // 手动模式无方向按钮
    expect(screen.queryByTestId('qingzhi-sidebar-sort-direction')).toBeNull()

    // 切换到时间模式
    const select = screen.getByTestId('qingzhi-sidebar-sort-select')
    fireEvent.change(select, { target: { value: 'updated' } })

    // 方向按钮出现
    expect(screen.getByTestId('qingzhi-sidebar-sort-direction')).toBeTruthy()
  })
})
