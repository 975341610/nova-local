import type { Note } from './types'

const NOTE_LINK_PATTERNS = [/data-id="(\d+)"/g, /data-wiki-id="(\d+)"/g, /data-type="block-link"[^>]*data-note-id="(\d+)"/g]

export function extractLinkedNoteIds(content?: string) {
  if (typeof content !== 'string' || !content.trim()) {
    return []
  }

  const ids = new Set<number>()
  for (const pattern of NOTE_LINK_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const nextId = Number(match[1])
      if (Number.isFinite(nextId)) {
        ids.add(nextId)
      }
    }
  }
  return Array.from(ids)
}

export function sanitizeFilenameSegment(value: string) {
  const sanitized = String(value || '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
  return sanitized || 'Untitled'
}

export function getPathBaseName(filePath?: string | null) {
  if (!filePath) {
    return null
  }

  const normalized = filePath.replace(/\\/g, '/')
  const leaf = normalized.split('/').pop() || ''
  return leaf.toLowerCase().endsWith('.md') ? leaf.slice(0, -3) : leaf
}

export function shouldRenameNoteFile(note: Partial<Note>) {
  if (!note.file_path || note.is_folder || typeof note.title !== 'string') {
    return false
  }

  const currentBaseName = getPathBaseName(note.file_path)
  if (currentBaseName === null) {
    return false
  }

  return sanitizeFilenameSegment(note.title) !== currentBaseName
}

export function getNotesNeedingFilenameSync(notes: Note[]) {
  return notes.filter((note) => shouldRenameNoteFile(note))
}
