// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import type { Note } from '../lib/types'
import { getNotesMissingContent, searchNotes } from '../lib/searchUtils'

const baseNote: Note = {
  id: 1,
  title: '测试笔记',
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

describe('searchUtils', () => {
  it('finds notes whose bodies have not been loaded yet', () => {
    const missing = { ...baseNote, id: 2, title: '未加载正文' }
    const loaded = { ...baseNote, id: 3, title: '已加载正文', content: '<p>hello</p>' }
    const folder = { ...baseNote, id: 4, title: '文件夹', is_folder: true }

    expect(getNotesMissingContent([missing, loaded, folder])).toEqual([missing])
  })

  it('searches note title, body, sticky notes and tags together', () => {
    const results = searchNotes([
      {
        ...baseNote,
        id: 5,
        title: '日报',
        content: '<p>今天修复了双链首屏加载</p>',
        sticky_notes: [{ id: 'a', x: 0, y: 0, color: '#fff', rotation: 0, content: '<p>侧栏同步</p>' }],
        tags: ['backlinks'],
      },
      {
        ...baseNote,
        id: 6,
        title: '别的笔记',
        content: '<p>无关内容</p>',
      },
    ], '双链')

    expect(results).toHaveLength(1)
    expect(results[0].note.id).toBe(5)
    expect(results[0].snippet).toContain('双链')
  })
})
