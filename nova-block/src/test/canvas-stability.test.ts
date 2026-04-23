import { describe, expect, it } from 'vitest'
import {
  isLatestNoteSaveSequence,
  mergeNote,
  nextNoteSaveSequence,
  pickCurrentNoteId,
  updatePendingNoteSaveCount,
} from '../App'
import {
  REFERENCE_NODE_TYPE,
  getCanvasHydrationDecision as getCanvasHydrationDecisionFromState,
  injectRuntimeIntoCanvasNode,
  shouldAllowCanvasReferenceOpen as shouldAllowCanvasReferenceOpenFromState,
} from '../components/canvas/canvasState'
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
  describe('canvas hydration decisions', () => {
    it('hydrates when switching to another note', () => {
      expect(getCanvasHydrationDecisionFromState({
        lastLoadedNoteId: 1,
        lastLoadedNoteContent: '{"nodes":[]}',
        noteId: 2,
        noteContent: '{"nodes":[{"id":"a"}]}',
        localSnapshot: '{"nodes":[]}',
        queuedSnapshot: null,
        isSaveInFlight: false,
        isDragging: false,
      })).toBe('hydrate')
    })

    it('acknowledges same-note save echo without hydrating', () => {
      expect(getCanvasHydrationDecisionFromState({
        lastLoadedNoteId: 1,
        lastLoadedNoteContent: '{"nodes":[]}',
        noteId: 1,
        noteContent: '{"nodes":[{"id":"a"}]}',
        localSnapshot: '{"nodes":[{"id":"a"}]}',
        queuedSnapshot: null,
        isSaveInFlight: false,
        isDragging: false,
      })).toBe('ack')
    })

    it('keeps local state authoritative while save is queued', () => {
      expect(getCanvasHydrationDecisionFromState({
        lastLoadedNoteId: 1,
        lastLoadedNoteContent: '{"nodes":[]}',
        noteId: 1,
        noteContent: '{"nodes":[{"id":"remote"}]}',
        localSnapshot: '{"nodes":[{"id":"local"}]}',
        queuedSnapshot: '{"nodes":[{"id":"local"}]}',
        isSaveInFlight: false,
        isDragging: false,
      })).toBe('ack')
    })

    it('keeps local state authoritative while save is in flight', () => {
      expect(getCanvasHydrationDecisionFromState({
        lastLoadedNoteId: 1,
        lastLoadedNoteContent: '{"nodes":[]}',
        noteId: 1,
        noteContent: '{"nodes":[{"id":"remote"}]}',
        localSnapshot: '{"nodes":[{"id":"local"}]}',
        queuedSnapshot: null,
        isSaveInFlight: true,
        isDragging: false,
      })).toBe('ack')
    })

    it('hydrates same-note external content when no local pending work exists', () => {
      expect(getCanvasHydrationDecisionFromState({
        lastLoadedNoteId: 1,
        lastLoadedNoteContent: '{"nodes":[]}',
        noteId: 1,
        noteContent: '{"nodes":[{"id":"remote"}]}',
        localSnapshot: '{"nodes":[]}',
        queuedSnapshot: null,
        isSaveInFlight: false,
        isDragging: false,
      })).toBe('hydrate')
    })
  })

  describe('reference open guard', () => {
    it('blocks open while dragging', () => {
      expect(shouldAllowCanvasReferenceOpenFromState({
        isDragging: true,
        lastDragStopAt: 0,
        now: 1000,
      })).toBe(false)
    })

    it('blocks open immediately after drag stop', () => {
      expect(shouldAllowCanvasReferenceOpenFromState({
        isDragging: false,
        lastDragStopAt: 1000,
        now: 1100,
      })).toBe(false)
    })

    it('allows open after cooldown', () => {
      expect(shouldAllowCanvasReferenceOpenFromState({
        isDragging: false,
        lastDragStopAt: 1000,
        now: 1300,
      })).toBe(true)
    })
  })

  describe('runtime node injection stability', () => {
    it('keeps reference node stable when tags only change array identity', () => {
      const onChange = () => undefined
      const onInfoClick = () => undefined
      const onOpenNote = () => undefined
      const node = {
        id: 'ref-1',
        type: REFERENCE_NODE_TYPE,
        position: { x: 0, y: 0 },
        dragHandle: '.canvas-card-drag-handle',
        data: {
          noteId: 7,
          title: 'Linked',
          icon: '📝',
          summary: 'hello world',
          tags: ['alpha'],
          onChange,
          onInfoClick,
          onOpenNote,
        },
      } as any

      const linkedNote = {
        ...mockNote,
        id: 7,
        title: 'Linked',
        icon: '📝',
        content: 'hello world',
        tags: ['alpha'],
      } as Note

      const injected = injectRuntimeIntoCanvasNode(node, {
        linkedNotesById: new Map([[7, linkedNote]]),
        onChange,
        onInfoClick,
        onOpenNote,
        onUngroup: () => undefined,
        onToggleCollapse: () => undefined,
      })

      expect(injected).toBe(node)
    })
  })

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
        const existing = { ...mockNote, stickers: [{ id: 's1', type: 'image' as const, url: 'a.png', x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }] } as Note
        const incoming = { ...mockNote, stickers: [{ id: 's2', type: 'image' as const, url: 'b.png', x: 8, y: 9, scale: 1, rotation: 0, opacity: 1 }] } as Note
        const merged = mergeNote(existing, incoming as any)
        expect(merged.stickers).toEqual([{ id: 's2', type: 'image', url: 'b.png', x: 8, y: 9, scale: 1, rotation: 0, opacity: 1 }])
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
