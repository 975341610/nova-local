import type { Note } from '../types'

export type BlockLinkTarget = {
  noteId: number
  noteTitle: string
  blockId: string
  label: string
  preview: string
  type: string
}

export type BlockLinkRef = {
  noteId: number
  blockId: string
  label?: string
}

export const PENDING_BLOCK_JUMP_KEY = 'nova.pendingBlockJump'

export function buildBlockLinkHref(target: BlockLinkRef): string {
  const params = new URLSearchParams()
  params.set('note', String(target.noteId))
  params.set('block', target.blockId)
  if (target.label) {
    params.set('label', target.label)
  }
  return `#nova-block?${params.toString()}`
}

export function parseBlockLinkHref(href: string | null | undefined): BlockLinkRef | null {
  if (!href) return null
  try {
    const trimmed = href.trim()
    if (trimmed.startsWith('#nova-block?')) {
      return parseBlockLinkParams(new URLSearchParams(trimmed.slice('#nova-block?'.length)))
    }

    const url = new URL(href)
    if (url.hash.startsWith('#nova-block?')) {
      return parseBlockLinkParams(new URLSearchParams(url.hash.slice('#nova-block?'.length)))
    }
    if (url.protocol !== 'nova:' || url.hostname !== 'block') {
      return null
    }
    return parseBlockLinkParams(url.searchParams)
  } catch {
    return null
  }
}

function parseBlockLinkParams(params: URLSearchParams): BlockLinkRef | null {
  const noteId = Number(params.get('note'))
  const blockId = params.get('block')?.trim()
  if (!Number.isFinite(noteId) || noteId <= 0 || !blockId) {
    return null
  }
  const label = params.get('label') || undefined
  return { noteId, blockId, label }
}

export function storePendingBlockJump(target: BlockLinkRef): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(PENDING_BLOCK_JUMP_KEY, JSON.stringify(target))
}

export function readPendingBlockJump(): BlockLinkRef | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(PENDING_BLOCK_JUMP_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<BlockLinkRef>
    const noteId = Number(parsed.noteId)
    const blockId = typeof parsed.blockId === 'string' ? parsed.blockId.trim() : ''
    if (!Number.isFinite(noteId) || noteId <= 0 || !blockId) return null
    return { noteId, blockId, label: parsed.label }
  } catch {
    return null
  }
}

export function clearPendingBlockJump(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(PENDING_BLOCK_JUMP_KEY)
}

export function extractBlockLinkTargets(notes: Note[], limit = 500): BlockLinkTarget[] {
  const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null
  if (!parser) return []

  const targets: BlockLinkTarget[] = []
  for (const note of notes) {
    if (note.is_folder || note.deleted_at || !note.content) {
      continue
    }

    const doc = parser.parseFromString(`<main>${note.content}</main>`, 'text/html')
    const root = doc.body.querySelector('main')
    if (!root) continue

    const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]'))
    for (const element of elements) {
      if (targets.length >= limit) return targets
      if (element.parentElement?.closest('[data-block-id]')) {
        continue
      }

      const blockId = element.getAttribute('data-block-id')?.trim() || element.getAttribute('id')?.trim()
      if (!blockId) continue

      const text = getBlockText(element)
      if (!text) continue

      const label = text.slice(0, 64)
      targets.push({
        noteId: Number(note.id),
        noteTitle: note.title || '未命名笔记',
        blockId,
        label,
        preview: text.slice(0, 140),
        type: resolveBlockElementType(element),
      })
    }
  }
  return targets
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function resolveBlockElementType(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) return 'heading'
  if (tag === 'p') return 'paragraph'
  if (tag === 'ul') return 'bulletList'
  if (tag === 'ol') return 'orderedList'
  if (tag === 'blockquote') return 'blockquote'
  if (tag === 'pre') return 'codeBlock'
  if (tag === 'table') return 'table'
  return element.getAttribute('data-type') || tag
}

function getBlockText(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase()
  if (tag === 'ul' || tag === 'ol') {
    const items = Array.from(element.querySelectorAll(':scope > li'))
      .map(item => collapseWhitespace(item.textContent || ''))
      .filter(Boolean)
    return items.join(' ')
  }
  return collapseWhitespace(element.textContent || '')
}
