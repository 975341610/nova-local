import { describe, expect, it } from 'vitest'
import {
  isLatestNoteSaveSequence,
  mergeNote,
  nextNoteSaveSequence,
  pickCurrentNoteId,
  updatePendingNoteSaveCount,
} from '../App'
import type { Note } from '../lib/types'

const mockNote: Note = {
  id: 1,
  title: 'Note 1',
  icon: '📝',
  content: 'content 1',
  file_path: 'note1.md',
  type: 'note',
  is_folder: false,
  created_at: '',
  updated_at: '',
  tags: [],
  links: [],
  stickers: [],
  sticky_notes: []
} as any

describe('Canvas Stability Helpers', () => {
  describe('mergeNote', () => {
    it('should merge incoming content correctly', () => {
      const existing = { ...mockNote, content: 'old' }
      const incoming = { ...mockNote, content: 'new' }
      const merged = mergeNote(existing, incoming)
      expect(merged.content).toBe('new')
    })

    it('should keep existing content if incoming is undefined', () => {
      const existing = { ...mockNote, content: 'old' }
      const incoming = { ...mockNote, content: undefined } as any
      const merged = mergeNote(existing, incoming)
      expect(merged.content).toBe('old')
    })
    
    it('should merge stickers and sticky notes', () => {
        const existing = { ...mockNote, stickers: [{ id: 's1' }] }
        const incoming = { ...mockNote, stickers: [{ id: 's2' }] }
        const merged = mergeNote(existing, incoming as any)
        expect(merged.stickers).toEqual([{ id: 's2' }])
    })
  })

  describe('save sequencing helpers', () => {
    it('should keep only the latest save response as commit eligible', () => {
      const sequenceMap = new Map<number, number>()
      const first = nextNoteSaveSequence(sequenceMap, 1)
      const second = nextNoteSaveSequence(sequenceMap, 1)

      expect(first).toBe(1)
      expect(second).toBe(2)
      expect(isLatestNoteSaveSequence(sequenceMap, 1, first)).toBe(false)
      expect(isLatestNoteSaveSequence(sequenceMap, 1, second)).toBe(true)
    })

    it('should clamp pending save counts at zero', () => {
      const pendingMap = new Map<number, number>()

      expect(updatePendingNoteSaveCount(pendingMap, 1, 1)).toBe(1)
      expect(updatePendingNoteSaveCount(pendingMap, 1, 1)).toBe(2)
      expect(updatePendingNoteSaveCount(pendingMap, 1, -1)).toBe(1)
      expect(updatePendingNoteSaveCount(pendingMap, 1, -5)).toBe(0)
      expect(pendingMap.has(1)).toBe(false)
    })
  })

  describe('pickCurrentNoteId', () => {
    const notes = [
      { ...mockNote, id: 1 },
      { ...mockNote, id: 2 },
      { ...mockNote, id: 3, is_folder: true }
    ] as Note[]

    it('should pick preferredId if it exists in notes', () => {
      expect(pickCurrentNoteId(notes, 2)).toBe(2)
    })

    it('should pick first non-folder note if preferredId is null or missing', () => {
      expect(pickCurrentNoteId(notes, null)).toBe(1)
      expect(pickCurrentNoteId(notes, 999)).toBe(1)
    })

    it('should pick first note if no non-folder notes exist', () => {
      const folderOnly = [{ ...mockNote, id: 3, is_folder: true }] as Note[]
      expect(pickCurrentNoteId(folderOnly)).toBe(3)
    })
    
    it('should return null if notes array is empty', () => {
        expect(pickCurrentNoteId([])).toBe(null)
    })
  })
})
