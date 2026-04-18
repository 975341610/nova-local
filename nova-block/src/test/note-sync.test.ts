import { describe, expect, it } from 'vitest'

import type { Note } from '../lib/types'
import { extractLinkedNoteIds, getNotesNeedingFilenameSync, shouldRenameNoteFile } from '../lib/noteSync'

const baseNote: Note = {
  id: 1,
  title: 'Untitled',
  icon: '📝',
  content: '<p></p>',
  file_path: 'C:/vault/Notes/Untitled.md',
  type: 'note',
  summary: '',
  is_title_manually_edited: false,
  tags: [],
  properties: [],
  sticky_notes: [],
  stickers: [],
  links: [],
  notebook_id: 1,
  parent_id: null,
  position: 0,
  sort_key: 'm',
  is_folder: false,
  created_at: '2026-04-18T00:00:00.000Z',
}

describe('noteSync helpers', () => {
  it('extracts linked note ids from supported link markup', () => {
    expect(
      extractLinkedNoteIds('<span data-id="4">A</span><span data-wiki-id="9">B</span><span data-id="4">A2</span>'),
    ).toEqual([4, 9])
  })

  it('detects when a note filename should be synchronized with the title', () => {
    expect(shouldRenameNoteFile(baseNote)).toBe(false)
    expect(shouldRenameNoteFile({ ...baseNote, title: '阶段修复' })).toBe(true)
    expect(shouldRenameNoteFile({ ...baseNote, is_folder: true })).toBe(false)
  })

  it('collects only notes whose filenames are out of sync', () => {
    const mismatched = { ...baseNote, id: 2, title: '阶段修复', file_path: 'C:/vault/Notes/无标题笔记 2.md' }
    const alreadySynced = { ...baseNote, id: 3, title: '测试', file_path: 'C:/vault/Notes/测试.md' }
    const folder = { ...baseNote, id: 4, is_folder: true, file_path: 'C:/vault/Notes/文件夹' }

    expect(getNotesNeedingFilenameSync([mismatched, alreadySynced, folder])).toEqual([mismatched])
  })
})
