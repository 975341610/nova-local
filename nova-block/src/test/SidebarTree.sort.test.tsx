/**
 * @vitest-environment jsdom
 *
 * Batch 5 - F2c sort contract
 *
 * 1. Default sortMode = 'manual', sorted by sort_key.
 * 2. Updated mode sorts DOM rows by updated_at desc.
 * 3. Created mode sorts DOM rows by created_at desc.
 * 4. Opened mode sorts DOM rows by openHistory.getLastOpened desc.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../components/sidebar/GlobalSearchPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/BacklinksPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/AIImportPanel', () => ({ default: () => <div /> }))

const { useNoteStoreMock } = vi.hoisted(() => {
  // A=oldest, B=middle, C=newest by created/updated
  const noteState = {
    notes: [
      { id: 1, title: 'A', content: '', parent_id: null, position: 'a', type: 'file', is_folder: false, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
      { id: 2, title: 'B', content: '', parent_id: null, position: 'b', type: 'file', is_folder: false, created_at: '2024-02-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z' },
      { id: 3, title: 'C', content: '', parent_id: null, position: 'c', type: 'file', is_folder: false, created_at: '2024-03-01T00:00:00Z', updated_at: '2024-02-01T00:00:00Z' },
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
import { recordOpen, clearOpenHistory } from '../lib/novablock/openHistory'

const titleOrder = () =>
  Array.from(document.querySelectorAll('[data-tree-node-id]'))
    .map((el) => el.querySelector('[data-testid^="qingzhi-tree-node-title-"]')?.textContent?.trim())

describe('SidebarTree F2c sort', () => {
  beforeEach(() => {
    localStorage.clear()
    clearOpenHistory()
  })
  afterEach(() => {
    cleanup()
  })

  it('defaults to manual sort (sort_key asc -> A, B, C)', () => {
    render(<SidebarTree isCollapsed={false} />)
    expect(titleOrder()).toEqual(['A', 'B', 'C'])
  })

  it('updated mode sorts by updated_at desc -> B, C, A', () => {
    render(<SidebarTree isCollapsed={false} />)
    const sel = screen.getByTestId('qingzhi-sidebar-sort-select') as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'updated' } })
    expect(titleOrder()).toEqual(['B', 'C', 'A'])
  })

  it('created mode sorts by created_at desc -> C, B, A', () => {
    render(<SidebarTree isCollapsed={false} />)
    const sel = screen.getByTestId('qingzhi-sidebar-sort-select') as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'created' } })
    expect(titleOrder()).toEqual(['C', 'B', 'A'])
  })

  it('opened mode sorts by last-opened desc -> A, C, B (B never opened)', () => {
    recordOpen('1', 3000) // A
    recordOpen('3', 2000) // C
    render(<SidebarTree isCollapsed={false} />)
    const sel = screen.getByTestId('qingzhi-sidebar-sort-select') as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'opened' } })
    const order = titleOrder()
    // A first (highest ts), C second, B last (never opened -> 0)
    expect(order[0]).toBe('A')
    expect(order[1]).toBe('C')
    expect(order[2]).toBe('B')
  })

  it('opened mode re-sorts immediately when another note is opened after render', async () => {
    recordOpen('1', 3000)
    recordOpen('3', 2000)
    render(<SidebarTree isCollapsed={false} />)
    const sel = screen.getByTestId('qingzhi-sidebar-sort-select') as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'opened' } })
    expect(titleOrder()[0]).toBe('A')

    recordOpen('2', 4000)

    await waitFor(() => expect(titleOrder()[0]).toBe('B'))
  })
})
