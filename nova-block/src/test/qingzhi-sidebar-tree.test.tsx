// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveQingzhiSettings } from '../lib/qingzhiSettings'

vi.mock('../components/sidebar/TreeNodeItem', () => ({
  TreeNodeItem: ({ node }: { node: { title: string } }) => <div>{node.title}</div>,
}))
vi.mock('../components/sidebar/GlobalSearchPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/BacklinksPanel', () => ({ default: () => <div /> }))
vi.mock('../components/sidebar/AIImportPanel', () => ({ default: () => <div /> }))

const { useNoteStoreMock } = vi.hoisted(() => {
  const noteState = {
    notes: [],
    updateNote: vi.fn(),
  }

  const useNoteStoreMock = (selector?: (state: typeof noteState) => unknown) => {
    return selector ? selector(noteState) : noteState
  }

  return { useNoteStoreMock }
})

vi.mock('../store/useNoteStore', () => ({
  useNoteStore: useNoteStoreMock,
}))

import { SidebarTree } from '../components/sidebar/SidebarTree'

describe('QingZhi SidebarTree shell', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('style')
  })

  afterEach(() => {
    cleanup()
  })

  it('uses QingZhi sidebar chrome and mascot backdrop instead of the old Nova brand', () => {
    render(<SidebarTree isCollapsed={false} />)

    expect(screen.getByTestId('qingzhi-real-sidebar')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-sidebar-mascot')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-sidebar-header')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-sidebar-tab-strip')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-sidebar-quick-search')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-sidebar-section-title')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-sidebar-footer-settings')).toBeTruthy()
    expect(screen.getByText('清知手账')).toBeTruthy()
    expect(screen.queryByText('Nova Block')).toBeNull()
    expect(screen.queryByTestId('legacy-sidebar-collapse')).toBeNull()
  })

  it('applies the configured mascot opacity to the sidebar illustration itself', () => {
    saveQingzhiSettings({
      topbarPins: ['daily', 'command'],
      mascotOpacity: 0.28,
    })

    render(<SidebarTree isCollapsed={false} />)

    expect(screen.getByTestId('qingzhi-sidebar-mascot').style.opacity).toBe('0.28')
  })
})
