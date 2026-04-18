import { describe, expect, it, vi } from 'vitest'

import { migrateLegacyNotes, shouldRunLegacyMigration } from '../lib/legacyLocalMigration'

describe('migrateLegacyNotes', () => {
  it('creates folders first, preserves hierarchy, and remaps legacy note links', async () => {
    const createFolder = vi
      .fn()
      .mockResolvedValueOnce({ id: 101 })

    const createNote = vi
      .fn()
      .mockResolvedValueOnce({ id: 102, content: '<p>child</p>' })
      .mockResolvedValueOnce({
        id: 103,
        content: '<span data-type="note-link" data-id="3">child</span>',
      })

    const updateNote = vi.fn().mockResolvedValue({ id: 103 })

    const result = await migrateLegacyNotes(
      [
        {
          id: 10,
          title: 'Projects',
          icon: '📁',
          content: '',
          tags: [],
          properties: [],
          links: [],
          notebook_id: null,
          parent_id: null,
          position: 0,
          sort_key: 'a',
          summary: '',
          is_title_manually_edited: false,
          is_folder: true,
          created_at: '2026-04-18T00:00:00.000Z',
        },
        {
          id: 3,
          title: 'Child Note',
          icon: '📝',
          content: '<p>child</p>',
          tags: [],
          properties: [],
          links: [],
          notebook_id: null,
          parent_id: 10,
          position: 1,
          sort_key: 'b',
          summary: '',
          is_title_manually_edited: false,
          is_folder: false,
          created_at: '2026-04-18T00:00:01.000Z',
        },
        {
          id: 20,
          title: 'Index',
          icon: '📝',
          content: '<span data-type="note-link" data-id="3">child</span>',
          tags: [],
          properties: [],
          links: [],
          notebook_id: null,
          parent_id: null,
          position: 2,
          sort_key: 'c',
          summary: '',
          is_title_manually_edited: false,
          is_folder: false,
          created_at: '2026-04-18T00:00:02.000Z',
        },
      ],
      {
        createFolder,
        createNote,
        updateNote,
      },
    )

    expect(createFolder).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Projects',
      parent_id: null,
    }))
    expect(createNote).toHaveBeenNthCalledWith(1, expect.objectContaining({
      title: 'Child Note',
      parent_id: 101,
    }))
    expect(updateNote).toHaveBeenCalledWith(103, expect.objectContaining({
      content: '<span data-type="note-link" data-id="102">child</span>',
    }))
    expect(result.idMap.get(10)).toBe(101)
    expect(result.idMap.get(3)).toBe(102)
    expect(result.idMap.get(20)).toBe(103)
  })

  it('still migrates legacy notes when current vault only has a few unrelated new notes', () => {
    const shouldMigrate = shouldRunLegacyMigration(
      [
        { id: 1, title: 'Project Alpha' },
        { id: 2, title: 'Weekly Review' },
      ],
      [
        { id: 9, title: '无标题笔记' },
        { id: 10, title: '测试' },
      ],
      false,
    )

    expect(shouldMigrate).toBe(true)
  })
})
