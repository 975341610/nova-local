// @vitest-environment jsdom

import fs from 'node:fs'
import path from 'node:path'

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import BacklinksPanel from '../components/sidebar/BacklinksPanel'
import GlobalSearchPanel from '../components/sidebar/GlobalSearchPanel'
import type { Note } from '../lib/types'

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getNote: vi.fn(),
  },
}))

vi.mock('../lib/api', () => ({
  api: apiMock,
}))

const makeNote = (overrides: Partial<Note>): Note => ({
  id: 1,
  title: 'Note',
  icon: 'N',
  summary: '',
  content: '<p></p>',
  is_title_manually_edited: false,
  tags: [],
  properties: [],
  links: [],
  notebook_id: null,
  parent_id: null,
  position: 0,
  sort_key: 'm',
  is_folder: false,
  created_at: '2026-05-18T00:00:00.000Z',
  ...overrides,
})

describe('QingZhi sidebar tab upgrades', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('keeps upgraded search filters available', () => {
    render(
      <GlobalSearchPanel
        notes={[
          makeNote({ id: 1, title: 'Design Inspiration', content: '<p>ink wash note</p>', tags: ['design'] }),
        ]}
        onSelectNote={() => {}}
        onClose={() => {}}
      />,
    )

    expect(screen.getByTestId('qz-search-filter-all')).toBeTruthy()
    expect(screen.getByTestId('qz-search-filter-title')).toBeTruthy()
    expect(screen.getByTestId('qz-search-filter-content')).toBeTruthy()
    expect(screen.getByTestId('qz-search-filter-tag')).toBeTruthy()
  })

  it('renders note titles inside the backlinks mini graph nodes', () => {
    render(
      <BacklinksPanel
        currentNoteId={10}
        notes={[
          makeNote({ id: 10, title: 'Current Note', links: [11] }),
          makeNote({ id: 11, title: 'Forward Node' }),
          makeNote({ id: 12, title: 'Backward Node', links: [10] }),
        ]}
        onSelectNote={() => {}}
      />,
    )

    const miniGraph = screen.getByTestId('qz-backlinks-mini-graph')
    expect(within(miniGraph).getByText('Current Note')).toBeTruthy()
    expect(within(miniGraph).getByText('Forward Node')).toBeTruthy()
    expect(within(miniGraph).getByText('Backward Node')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'copy-current-note-wikilink' })).toBeTruthy()
  })

  it('keeps the AI tab contract source aligned with compact workbench controls', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../components/sidebar/AIImportPanel.tsx'), 'utf8')

    expect(source).toContain('qz-ai-compact-header')
    expect(source).toContain('qz-ai-compact-segment')
    expect(source).toContain('qz-ai-scope-chip')
    expect(source).toContain('qz-ai-shell-flat')
    expect(source).toContain('qz-ai-compact-prompts')
    expect(source).toContain('qz-ai-compact-composer')
    expect(source).toContain('qz-ai-write-chip')
    expect(source).toContain('qz-ai-compact-action-bar')
  })
})
