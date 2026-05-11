import type { Edge, Node, Viewport } from '@xyflow/react'
import type { Note } from '../../lib/types'

export const TEXT_NODE_TYPE = 'canvas-text-card'
export const REFERENCE_NODE_TYPE = 'canvas-note-reference'
export const MEDIA_NODE_TYPE = 'canvas-media-node'
export const LINK_NODE_TYPE = 'canvas-link-node'
export const GROUP_NODE_TYPE = 'groupNode'

const CARD_DRAG_HANDLE = '.canvas-card-drag-handle'
const GROUP_DRAG_HANDLE = '.canvas-group-drag-handle'

export type RuntimeInjectionContext = {
  linkedNotesById: Map<number, Note>
  onChange: (id: string, patch: Record<string, unknown>) => void
  onInfoClick: (id: string) => void
  onOpenNote: (id: number) => void
  onUngroup: (id: string) => void
  onToggleCollapse: (id: string) => void
}

export type CanvasHydrationInput = {
  lastLoadedNoteId: number | null
  lastLoadedNoteContent: string | null
  noteId: number
  noteContent: string | null | undefined
  localSnapshot: string
  queuedSnapshot: string | null
  isSaveInFlight: boolean
  isDragging: boolean
}

export type CanvasHydrationDecision = 'hydrate' | 'ack' | 'ignore'

export type CanvasSerialized = {
  version: 'v1'
  nodes: Array<Node<Record<string, unknown>, string>>
  edges: Edge[]
  viewport?: Viewport
  backgroundUrl?: string
}

const toContentSnapshot = (content: string | null | undefined) => content ?? ''

const shallowEqualObject = (left: Record<string, unknown>, right: Record<string, unknown>) => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every((key) => {
    const leftValue = left[key]
    const rightValue = right[key]

    if (leftValue === rightValue) {
      return true
    }

    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      if (leftValue.length !== rightValue.length) {
        return false
      }
      return leftValue.every((item, index) => item === rightValue[index])
    }

    return false
  })
}

export function parseCanvasContent(content?: string): CanvasSerialized {
  if (!content) {
    return { version: 'v1', nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, backgroundUrl: undefined }
  }

  try {
    const parsed = JSON.parse(content) as Partial<CanvasSerialized>
    return {
      version: 'v1',
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      viewport: parsed.viewport ?? { x: 0, y: 0, zoom: 1 },
      backgroundUrl: typeof parsed.backgroundUrl === 'string' ? parsed.backgroundUrl : undefined,
    }
  } catch {
    return { version: 'v1', nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, backgroundUrl: undefined }
  }
}

export function summarizeNote(note: Note) {
  if (note.type === 'canvas') {
    try {
      const data = JSON.parse(note.content || '{}') as { nodes?: unknown[] }
      const nodeCount = data.nodes?.length || 0
      return `[无界画布] 包含 ${nodeCount} 个节点`
    } catch {
      return '[无界画布]'
    }
  }

  const plainText = (note.content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return plainText ? plainText.slice(0, 84) : '点击即可回到该笔记，继续完善你的灵感脉络。'
}

export function shouldHydrateCanvasFromIncomingNote({
  lastLoadedNoteId,
  lastLoadedNoteContent,
  noteId,
  noteContent,
  localSnapshot,
  queuedSnapshot,
  isSaveInFlight,
  isDragging,
}: CanvasHydrationInput) {
  return getCanvasHydrationDecision({
    lastLoadedNoteId,
    lastLoadedNoteContent,
    noteId,
    noteContent,
    localSnapshot,
    queuedSnapshot,
    isSaveInFlight,
    isDragging,
  }) === 'hydrate'
}

export function getCanvasHydrationDecision({
  lastLoadedNoteId,
  lastLoadedNoteContent,
  noteId,
  noteContent,
  localSnapshot,
  queuedSnapshot,
  isSaveInFlight,
  isDragging,
}: CanvasHydrationInput): CanvasHydrationDecision {
  const incomingSnapshot = toContentSnapshot(noteContent)
  const previousSnapshot = toContentSnapshot(lastLoadedNoteContent)

  if (lastLoadedNoteId !== noteId) {
    return 'hydrate'
  }

  if (previousSnapshot === incomingSnapshot) {
    return 'ignore'
  }

  if (incomingSnapshot === localSnapshot) {
    return 'ack'
  }

  if (queuedSnapshot && incomingSnapshot === queuedSnapshot) {
    return 'ack'
  }

  if (isDragging || isSaveInFlight || Boolean(queuedSnapshot)) {
    return 'ack'
  }

  return 'hydrate'
}

export function shouldAllowCanvasReferenceOpen({
  isDragging,
  lastDragStopAt,
  now,
  cooldownMs = 220,
}: {
  isDragging: boolean
  lastDragStopAt: number
  now: number
  cooldownMs?: number
}) {
  if (isDragging) {
    return false
  }

  if (lastDragStopAt <= 0) {
    return true
  }

  return now - lastDragStopAt >= cooldownMs
}

export function resolveCanvasDragActivity(changes: ReadonlyArray<{ type?: string; dragging?: boolean }>) {
  for (const change of changes) {
    if (change.type !== 'position' || typeof change.dragging !== 'boolean') {
      continue
    }

    return change.dragging
  }

  return null
}

export function shouldPersistViewport(
  previousViewport: Viewport | null | undefined,
  nextViewport: Viewport,
  thresholds: { pan: number; zoom: number } = { pan: 1, zoom: 0.001 },
) {
  if (!previousViewport) {
    return true
  }

  return (
    Math.abs(previousViewport.x - nextViewport.x) >= thresholds.pan ||
    Math.abs(previousViewport.y - nextViewport.y) >= thresholds.pan ||
    Math.abs(previousViewport.zoom - nextViewport.zoom) >= thresholds.zoom
  )
}

export function injectRuntimeIntoCanvasNode<T extends Node<Record<string, unknown>, string>>(
  node: T,
  runtime: RuntimeInjectionContext,
): T {
  const currentData = (node.data ?? {}) as Record<string, unknown>

  if (node.type === TEXT_NODE_TYPE) {
    const nextData = {
      ...currentData,
      title: typeof currentData.title === 'string' ? currentData.title : '灵感便签',
      body: typeof currentData.body === 'string' ? currentData.body : '',
      onChange: runtime.onChange,
      onInfoClick: runtime.onInfoClick,
    }

    if (node.dragHandle === CARD_DRAG_HANDLE && shallowEqualObject(currentData, nextData)) {
      return node
    }

    return {
      ...node,
      dragHandle: CARD_DRAG_HANDLE,
      data: nextData,
    }
  }

  if (node.type === REFERENCE_NODE_TYPE) {
    const linkedNoteId = Number(currentData.noteId)
    const linkedNote = runtime.linkedNotesById.get(linkedNoteId)
    const nextData = linkedNote
      ? {
          ...currentData,
          noteId: linkedNote.id,
          title: linkedNote.title || '无标题笔记',
          icon: linkedNote.icon || '📝',
          summary: summarizeNote(linkedNote),
          tags: linkedNote.tags || [],
          onChange: runtime.onChange,
          onInfoClick: runtime.onInfoClick,
          onOpenNote: runtime.onOpenNote,
        }
      : {
          ...currentData,
          onChange: runtime.onChange,
          onInfoClick: runtime.onInfoClick,
          onOpenNote: runtime.onOpenNote,
        }

    if (node.dragHandle === CARD_DRAG_HANDLE && shallowEqualObject(currentData, nextData)) {
      return node
    }

    return {
      ...node,
      dragHandle: CARD_DRAG_HANDLE,
      data: nextData,
    }
  }

  if (node.type === MEDIA_NODE_TYPE || node.type === LINK_NODE_TYPE) {
    const nextData = {
      ...currentData,
      onChange: runtime.onChange,
      onInfoClick: runtime.onInfoClick,
    }

    if (shallowEqualObject(currentData, nextData)) {
      return node
    }

    return {
      ...node,
      data: nextData,
    }
  }

  if (node.type === GROUP_NODE_TYPE) {
    const nextData = {
      ...currentData,
      onChange: runtime.onChange,
      onInfoClick: runtime.onInfoClick,
      onUngroup: runtime.onUngroup,
      onToggleCollapse: runtime.onToggleCollapse,
    }

    if (node.dragHandle === GROUP_DRAG_HANDLE && shallowEqualObject(currentData, nextData)) {
      return node
    }

    return {
      ...node,
      dragHandle: GROUP_DRAG_HANDLE,
      data: nextData,
    }
  }

  return node
}
