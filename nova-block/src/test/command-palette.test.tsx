// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Note } from '../lib/types'

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getNote: vi.fn(),
  },
}))

vi.mock('../lib/api', () => ({
  api: apiMock,
}))

import CommandPalette from '../components/search/CommandPalette'
import { useNoteStore } from '../store/useNoteStore'

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

describe('CommandPalette', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    apiMock.getNote.mockReset()
    useNoteStore.getState().setNotes([])
  })

  it('hydrates unopened note bodies so quick search can match note content', async () => {
    const notes = [{ ...baseNote, id: 12, title: '未打开笔记', content: undefined }]
    useNoteStore.getState().setNotes(notes as any)
    
    apiMock.getNote.mockResolvedValue({
      ...baseNote,
      id: 12,
      title: '未打开笔记',
      content: '<p>只在正文里出现的词：实时双链</p>',
    })

    render(
      <CommandPalette
        isOpen
        onClose={() => {}}
        onSelectNote={() => {}}
      />,
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '实时双链' } })

    await waitFor(() => {
      expect(apiMock.getNote).toHaveBeenCalledWith(12)
    })

    expect(await screen.findByText('未打开笔记')).toBeTruthy()
  })

  it('hydrates unopened notes in small batches instead of reading the whole vault at once', async () => {
    const notes = Array.from({ length: 20 }, (_, index) => ({
      ...baseNote,
      id: index + 100,
      title: `Batch ${index}`,
      content: undefined,
    }))
    useNoteStore.getState().setNotes(notes as any)
    apiMock.getNote.mockImplementation(async (id: number) => ({
      ...baseNote,
      id,
      title: `Batch ${id}`,
      content: '<p>batch content</p>',
    }))

    render(
      <CommandPalette
        isOpen
        onClose={() => {}}
        onSelectNote={() => {}}
      />,
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'batch query' } })

    await waitFor(() => {
      expect(apiMock.getNote).toHaveBeenCalled()
    })

    expect(apiMock.getNote).toHaveBeenCalledTimes(8)
  })
})
