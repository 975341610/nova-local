import { describe, expect, it } from 'vitest'
import {
  buildJournalProperties,
  findDailyNotesByDate,
  findDuplicateDailyNotes,
  formatDailyTitle,
  getDailyDate,
  isDailyNote,
  parseDailyTitle,
} from '../lib/journal'

const note = (overrides: Partial<any>) => ({
  id: 1,
  title: '普通笔记',
  properties: [],
  is_folder: false,
  updated_at: '2026-06-01T08:00:00Z',
  ...overrides,
})

describe('journal service', () => {
  it('formats and parses legacy daily titles with strict valid dates', () => {
    expect(formatDailyTitle(new Date(2026, 5, 1))).toBe('2026-06-01')
    expect(parseDailyTitle('2026-06-01')?.dateKey).toBe('2026-06-01')
    expect(parseDailyTitle('2026/06/01 今日记录')?.dateKey).toBe('2026-06-01')
    expect(parseDailyTitle('2026-13-01')).toBeNull()
    expect(parseDailyTitle('2026-02-31')).toBeNull()
    expect(parseDailyTitle('普通笔记')).toBeNull()
  })

  it('uses journal metadata before title so renamed daily notes remain identifiable', () => {
    const renamed = note({
      title: '今天的工作记录',
      properties: buildJournalProperties('daily', '2026-06-01'),
    })

    expect(isDailyNote(renamed)).toBe(true)
    expect(getDailyDate(renamed)).toBe('2026-06-01')
  })

  it('falls back to legacy title parsing when metadata is absent', () => {
    expect(getDailyDate(note({ title: '2026/06/01 今日记录' }))).toBe('2026-06-01')
  })

  it('finds and groups duplicate daily notes by normalized date', () => {
    const notes = [
      note({ id: 1, title: '2026-06-01' }),
      note({ id: 2, title: '今天', properties: buildJournalProperties('daily', '2026-06-01') }),
      note({ id: 3, title: '2026-06-02' }),
      note({ id: 4, title: '文件夹', is_folder: true, properties: buildJournalProperties('daily', '2026-06-01') }),
    ]

    expect(findDailyNotesByDate(notes, '2026-06-01').map((item) => item.id)).toEqual([1, 2])
    const duplicates = findDuplicateDailyNotes(notes)
    expect(duplicates.get('2026-06-01')?.map((item) => item.id)).toEqual([1, 2])
    expect(duplicates.has('2026-06-02')).toBe(false)
  })
})
