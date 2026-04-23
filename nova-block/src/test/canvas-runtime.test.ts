import { describe, expect, it, vi } from 'vitest'

import type { Note } from '../lib/types'
import {
  REFERENCE_NODE_TYPE,
  TEXT_NODE_TYPE,
  injectRuntimeIntoCanvasNode,
  resolveCanvasDragActivity,
  shouldHydrateCanvasFromIncomingNote,
  shouldPersistViewport,
} from '../components/canvas/canvasState'

const linkedNote: Note = {
  id: 42,
  title: '已关联笔记',
  icon: '📝',
  content: '这是一段最新摘要内容',
  file_path: 'linked.md',
  type: 'note',
  summary: '',
  is_title_manually_edited: false,
  tags: ['alpha', 'beta'],
  properties: [],
  sticky_notes: [],
  stickers: [],
  links: [],
  notebook_id: null,
  parent_id: null,
  position: 0,
  is_folder: false,
  created_at: '',
  updated_at: '',
}

describe('canvasState helpers', () => {
  it('only hydrates when the active note changes or external content actually changes', () => {
    expect(
      shouldHydrateCanvasFromIncomingNote({
        lastLoadedNoteId: 7,
        lastLoadedNoteContent: '{"nodes":[]}',
        noteId: 7,
        noteContent: '{"nodes":[]}',
        localSnapshot: '{"nodes":[]}',
        queuedSnapshot: null,
        isSaveInFlight: false,
        isDragging: false,
      }),
    ).toBe(false)

    expect(
      shouldHydrateCanvasFromIncomingNote({
        lastLoadedNoteId: 7,
        lastLoadedNoteContent: '{"nodes":[]}',
        noteId: 7,
        noteContent: '{"nodes":[{"id":"text-1"}]}',
        localSnapshot: '{"nodes":[]}',
        queuedSnapshot: null,
        isSaveInFlight: false,
        isDragging: false,
      }),
    ).toBe(true)

    expect(
      shouldHydrateCanvasFromIncomingNote({
        lastLoadedNoteId: 7,
        lastLoadedNoteContent: '{"nodes":[]}',
        noteId: 8,
        noteContent: '{"nodes":[]}',
        localSnapshot: '{"nodes":[]}',
        queuedSnapshot: null,
        isSaveInFlight: false,
        isDragging: false,
      }),
    ).toBe(true)
  })

  it('injects runtime callbacks into new text nodes immediately', () => {
    const onChange = vi.fn()
    const onInfoClick = vi.fn()

    const injected = injectRuntimeIntoCanvasNode(
      {
        id: 'text-1',
        type: TEXT_NODE_TYPE,
        position: { x: 20, y: 30 },
        data: {
          title: '灵感便签',
          body: '',
        },
      } as any,
      {
        linkedNotesById: new Map(),
        onChange,
        onInfoClick,
        onOpenNote: vi.fn(),
        onUngroup: vi.fn(),
        onToggleCollapse: vi.fn(),
      },
    ) as any

    expect(injected.dragHandle).toBe('.canvas-card-drag-handle')
    expect(injected.data.onChange).toBe(onChange)
    expect(injected.data.onInfoClick).toBe(onInfoClick)
  })

  it('refreshes reference node metadata from the latest linked note data', () => {
    const injected = injectRuntimeIntoCanvasNode(
      {
        id: 'ref-1',
        type: REFERENCE_NODE_TYPE,
        position: { x: 0, y: 0 },
        data: {
          noteId: linkedNote.id,
          title: '旧标题',
          icon: '📝',
          summary: '旧摘要',
          tags: [],
        },
      } as any,
      {
        linkedNotesById: new Map([[linkedNote.id, linkedNote]]),
        onChange: vi.fn(),
        onInfoClick: vi.fn(),
        onOpenNote: vi.fn(),
        onUngroup: vi.fn(),
        onToggleCollapse: vi.fn(),
      },
    ) as any

    expect(injected.dragHandle).toBe('.canvas-card-drag-handle')
    expect(injected.data.title).toBe(linkedNote.title)
    expect(injected.data.icon).toBe(linkedNote.icon)
    expect(injected.data.summary).toContain('这是一段最新摘要内容')
    expect(injected.data.tags).toEqual(linkedNote.tags)
    expect(typeof injected.data.onChange).toBe('function')
  })

  it('detects drag transitions and suppresses tiny viewport writes', () => {
    expect(resolveCanvasDragActivity([{ type: 'position', dragging: true } as any])).toBe(true)
    expect(resolveCanvasDragActivity([{ type: 'position', dragging: false } as any])).toBe(false)
    expect(resolveCanvasDragActivity([{ type: 'select', selected: true } as any])).toBe(null)

    expect(
      shouldPersistViewport(
        { x: 10, y: 20, zoom: 1 },
        { x: 10.4, y: 20.4, zoom: 1.0005 },
      ),
    ).toBe(false)

    expect(
      shouldPersistViewport(
        { x: 10, y: 20, zoom: 1 },
        { x: 14, y: 20, zoom: 1 },
      ),
    ).toBe(true)
  })
})
