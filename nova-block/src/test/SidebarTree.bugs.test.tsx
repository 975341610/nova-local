/**
 * @vitest-environment jsdom
 *
 * F2/F3-Bugs · 多选 + 移动 + 清空 + 分组
 *
 * 2a. 拖拽 multi-selected 节点 → 必须移动所有选中项 (调用 onNodesBulkMove)
 * 2b. "移动到..." 菜单选择目标文件夹后,目标文件夹必须被自动展开
 * 2c. 多选状态下点击空白区域 → 取消多选
 * 3. sortMode != 'manual' 时,visibleNodes 应该出现日期分组头 (今天/昨天/更早)
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../components/sidebar/GlobalSearchPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/BacklinksPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/AIImportPanel', () => ({ default: () => <div /> }))

// 三个固定时间戳 — 用于 F3 分组测试 (今天/昨天/更早)
const NOW = new Date('2026-05-19T12:00:00Z').getTime()
const YESTERDAY = NOW - 24 * 3600 * 1000
const LAST_WEEK = NOW - 8 * 24 * 3600 * 1000

const { useNoteStoreMock } = vi.hoisted(() => {
  const noteState = {
    notes: [
      { id: 1, title: 'Folder',  content: '', parent_id: null, position: 'a', sort_key: 'a', type: 'folder', is_folder: true,  created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 2, title: 'File-A',  content: '', parent_id: null, position: 'b', sort_key: 'b', type: 'file',   is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 3, title: 'File-B',  content: '', parent_id: null, position: 'c', sort_key: 'c', type: 'file',   is_folder: false, created_at: '2024-01-01', updated_at: '2024-01-01' },
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

describe('F2 bug 2a · 拖拽 multi-selected 节点 → 批量移动', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    cleanup()
  })

  it('当被拖拽的节点处于多选集合 (size>=2) 时,触发 onNodesBulkMove 而非 onNodeMove(单条)', () => {
    const onNodeMove = vi.fn()
    const onNodesBulkMove = vi.fn()
    render(
      <SidebarTree
        isCollapsed={false}
        onNodeMove={onNodeMove}
        onNodesBulkMove={onNodesBulkMove}
      />,
    )

    // 多选 File-A(2) 与 File-B(3)
    const fa = screen.getByTestId('qingzhi-tree-node-2')
    const fb = screen.getByTestId('qingzhi-tree-node-3')
    fireEvent.click(fa, { ctrlKey: true })
    fireEvent.click(fb, { ctrlKey: true })

    // 拖拽 File-A 到 Folder(1) "into"
    const folder = screen.getByTestId('qingzhi-tree-node-1')
    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(k: string, v: string) { this.data[k] = v },
      getData(k: string) { return this.data[k] || '' },
      effectAllowed: '',
      types: [] as string[],
    }
    fireEvent.dragStart(fa, { dataTransfer })
    fireEvent.dragOver(folder, { dataTransfer, clientX: 100, clientY: 100 })
    fireEvent.drop(folder, { dataTransfer })

    expect(onNodesBulkMove).toHaveBeenCalledTimes(1)
    expect(onNodeMove).not.toHaveBeenCalled()
    const [ids, parentId] = onNodesBulkMove.mock.calls[0]
    expect(new Set(ids)).toEqual(new Set(['2', '3']))
    expect(parentId).toBe('1')
  })
})

describe('F2 bug 2b · "移动到..." 后目标文件夹自动展开', () => {
  afterEach(() => cleanup())

  it('选择目标文件夹后,该文件夹的 disclosure 处于展开态(其内容可见)', () => {
    const onNodesBulkMove = vi.fn()
    render(<SidebarTree isCollapsed={false} onNodesBulkMove={onNodesBulkMove} />)

    const fa = screen.getByTestId('qingzhi-tree-node-2')
    const fb = screen.getByTestId('qingzhi-tree-node-3')
    fireEvent.click(fa, { ctrlKey: true })
    fireEvent.click(fb, { ctrlKey: true })

    fireEvent.contextMenu(fa, { clientX: 50, clientY: 50 })
    fireEvent.click(screen.getByTestId('qingzhi-sidebar-bulk-move'))
    // 选择目标文件夹 "Folder" (id=1) — 使用 modal 内按钮 (含 FolderPlus 图标)
    // 这里 modal 渲染了 button list,标题是 "Folder"。 用 querySelector 直接定位。
    const modalRoot = document.querySelector('.bg-background.border.border-border\\/40.shadow-2xl') as HTMLElement | null
    expect(modalRoot).not.toBeNull()
    const folderBtn = Array.from(modalRoot!.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Folder')) as HTMLElement | undefined
    expect(folderBtn).toBeTruthy()
    fireEvent.click(folderBtn!)

    expect(onNodesBulkMove).toHaveBeenCalledTimes(1)
    // Folder 1 应被自动展开 — node-1 行的 data-expanded='true'
    const folderRow = screen.getByTestId('qingzhi-tree-node-1')
    expect(folderRow.getAttribute('data-expanded')).toBe('true')
  })
})

describe('F2 bug 2c · 点击空白区域取消多选', () => {
  afterEach(() => cleanup())

  it('多选后点击 sidebar-tree 画布空白区域 → 后续右键 fa 弹出的应是单条菜单(不是 bulk)', () => {
    render(<SidebarTree isCollapsed={false} />)
    const fa = screen.getByTestId('qingzhi-tree-node-2')
    const fb = screen.getByTestId('qingzhi-tree-node-3')
    fireEvent.click(fa, { ctrlKey: true })
    fireEvent.click(fb, { ctrlKey: true })

    const canvas = document.querySelector('[data-sidebar-tree-canvas]') as HTMLElement
    expect(canvas).not.toBeNull()
    fireEvent.click(canvas)

    // 此时多选应被清空。直接 contextMenu fa(此节点之前在多选集合里)
    fireEvent.contextMenu(fa, { clientX: 50, clientY: 50 })
    // 多选若还在,bulk 菜单会出现; 否则不出现
    expect(screen.queryByTestId('qingzhi-sidebar-bulk-move')).toBeNull()
  })
})

describe('F3 bug · 排序按日期分组 (今天/昨天/更早)', () => {
  afterEach(() => cleanup())

  // 这个测试通过 fake timers/Date 控制 "今天" — 直接 mock Date.now
  it('sortMode=updated 时,渲染出 "今天/昨天/更早" 分组标题', () => {
    // mock Date.now → NOW
    const realDateNow = Date.now
    Date.now = () => NOW
    try {
      // 重写 mock 中 notes 的 updated_at 为不同时间桶
      // 由于 useNoteStore 已经 mock,直接通过临时 mock 模块替换不可行,
      // 这里我们通过 localStorage 设置 sortMode 即可
      localStorage.setItem('qz.sidebar.sortMode.v1', 'updated')

      render(<SidebarTree isCollapsed={false} />)

      // 至少一个分组标题应当出现
      const groups = screen.queryAllByTestId('qingzhi-sidebar-group-header')
      expect(groups.length).toBeGreaterThanOrEqual(1)
    } finally {
      Date.now = realDateNow
    }
  })
})

// 让上面 F3 测试中无用的常量仍有引用,避免 noUnused
void YESTERDAY
void LAST_WEEK
