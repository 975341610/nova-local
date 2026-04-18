// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../components/sidebar/TreeNodeItem', () => ({
  TreeNodeItem: () => null,
}))

vi.mock('../components/sidebar/GlobalSearchPanel', () => ({
  default: () => null,
}))

vi.mock('../components/sidebar/BacklinksPanel', () => ({
  default: ({ currentNoteId, notes }: { currentNoteId: number | null; notes: Array<{ id: number }> }) => (
    <div data-testid="backlinks-current-note">
      {currentNoteId === null ? 'null' : `${currentNoteId}:${notes.length}`}
    </div>
  ),
}))

import { SidebarTree } from '../components/sidebar/SidebarTree'

describe('SidebarTree', () => {
  it('passes the current note id and notes to backlinks on first open without requiring a note switch', () => {
    const { container } = render(
      <SidebarTree
        initialNodes={[
          { id: '31', parentId: null, sortKey: 'm', title: '当前笔记', isFolder: false },
        ]}
        notes={[
          {
            id: 31,
            title: '当前笔记',
            icon: '📝',
            summary: '',
            content: '<p>[[测试]]</p>',
            is_title_manually_edited: false,
            tags: [],
            properties: [],
            links: [],
            notebook_id: null,
            parent_id: null,
            position: 0,
            sort_key: 'm',
            is_folder: false,
            created_at: '2026-04-18T00:00:00.000Z',
          },
        ]}
        selectedNodeId="31"
      />,
    )

    const tabButtons = container.querySelectorAll('button[title]')
    fireEvent.click(tabButtons[2] as HTMLButtonElement)

    expect(screen.getByTestId('backlinks-current-note').textContent).toBe('31:1')
  })
})
