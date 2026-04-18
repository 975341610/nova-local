// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Note } from '../lib/types'

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getNote: vi.fn(),
  },
}))

vi.mock('../lib/api', () => ({
  api: apiMock,
}))

import GlobalSearchPanel from '../components/sidebar/GlobalSearchPanel'

const baseNote: Note = {
  id: 1,
  title: '首篇笔记',
  icon: '📝',
  summary: '',
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
}

describe('GlobalSearchPanel', () => {
  beforeEach(() => {
    apiMock.getNote.mockReset()
  })

  it('hydrates unopened note bodies so content search works before opening the note', async () => {
    apiMock.getNote.mockResolvedValue({
      ...baseNote,
      id: 9,
      title: '未打开的笔记',
      content: '<p>这里有只在正文里的关键字：画布联动</p>',
    })

    render(
      <GlobalSearchPanel
        notes={[{ ...baseNote, id: 9, title: '未打开的笔记', content: undefined }]}
        onSelectNote={() => {}}
        onClose={() => {}}
      />,
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '画布联动' } })

    await waitFor(() => {
      expect(apiMock.getNote).toHaveBeenCalledWith(9)
    })

    await screen.findByText('未打开的笔记')
    expect(screen.getByText(/画布联动/)).toBeTruthy()
  })
})
