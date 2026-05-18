// @vitest-environment jsdom

import fs from 'node:fs'
import path from 'node:path'

import { cleanup, render, screen } from '@testing-library/react'
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
  icon: '📄',
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

  it('shows search filters, recent sections, and search syntax guidance', () => {
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
    expect(screen.getByText('最近搜索')).toBeTruthy()
    expect(screen.getByText('最近打开')).toBeTruthy()
    expect(screen.getByText('搜索语法')).toBeTruthy()
    expect(screen.getByText('tag:灵感')).toBeTruthy()
  })

  it('shows graph preview, unlinked mentions, and copyable link syntax in backlinks', () => {
    render(
      <BacklinksPanel
        currentNoteId={1}
        notes={[
          makeNote({ id: 1, title: '需求文档', links: [2] }),
          makeNote({ id: 2, title: '已链接笔记' }),
          makeNote({ id: 3, title: '潜在关联', content: '<p>这里提到了需求文档，但还没有建立双链。</p>' }),
        ]}
        onSelectNote={() => {}}
      />,
    )

    expect(screen.getByTestId('qz-backlinks-mini-graph')).toBeTruthy()
    expect(screen.getByText('未链接提及')).toBeTruthy()
    expect(screen.getByText('潜在关联')).toBeTruthy()
    expect(screen.getByText('[[需求文档]]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'copy-current-note-wikilink' })).toBeTruthy()
  })

  it('keeps the AI tab contract source aligned with compact workbench controls', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../components/sidebar/AIImportPanel.tsx'), 'utf8')

    expect(source).toContain('qz-ai-compact-header')
    expect(source).toContain('qz-ai-compact-segment')
    expect(source).toContain('qz-ai-scope-chip')
    expect(source).toContain('qz-ai-compact-prompts')
    expect(source).toContain('qz-ai-compact-composer')
    expect(source).toContain('⌘↵')
  })
})
