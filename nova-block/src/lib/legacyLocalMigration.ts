import type { Note } from './types'

type LegacyNote = Note

type NoteCreateClient = {
  createFolder: (payload: {
    title: string
    notebook_id?: number | null
    parent_id?: number | null
    tags?: string[]
    type?: string
  }) => Promise<{ id: number }>
  createNote: (payload: {
    title: string
    content?: string
    notebook_id?: number | null
    icon?: string
    parent_id?: number | null
    is_title_manually_edited?: boolean
    tags?: string[]
    type?: string
    is_folder?: boolean
    background_paper?: Note['background_paper']
    sort_key?: string | null
    stickers?: Note['stickers']
    sticky_notes?: Note['sticky_notes']
  }) => Promise<{ id: number; content?: string }>
  updateNote: (noteId: number, payload: Partial<Note>) => Promise<unknown>
}

type MigrationResult = {
  idMap: Map<number, number>
}

const LEGACY_LINK_PATTERNS = [
  /data-id="(\d+)"/g,
  /data-wiki-id="(\d+)"/g,
]

function replaceLegacyNoteLinks(content: string, idMap: Map<number, number>) {
  let nextContent = content

  for (const pattern of LEGACY_LINK_PATTERNS) {
    nextContent = nextContent.replace(pattern, (fullMatch, idText: string) => {
      const mappedId = idMap.get(Number(idText))
      if (!mappedId) {
        return fullMatch
      }
      return fullMatch.replace(idText, String(mappedId))
    })
  }

  return nextContent
}

function orderLegacyNotes(notes: LegacyNote[]) {
  const byParent = new Map<number | null, LegacyNote[]>()

  for (const note of notes) {
    const key = note.parent_id ?? null
    const bucket = byParent.get(key) ?? []
    bucket.push(note)
    byParent.set(key, bucket)
  }

  for (const bucket of byParent.values()) {
    bucket.sort((left, right) => {
      const leftPos = left.position ?? 0
      const rightPos = right.position ?? 0
      if (leftPos !== rightPos) {
        return leftPos - rightPos
      }
      return left.id - right.id
    })
  }

  const ordered: LegacyNote[] = []

  const visit = (parentId: number | null) => {
    for (const note of byParent.get(parentId) ?? []) {
      ordered.push(note)
      visit(note.id)
    }
  }

  visit(null)

  const seen = new Set(ordered.map(note => note.id))
  for (const note of notes) {
    if (!seen.has(note.id)) {
      ordered.push(note)
    }
  }

  return ordered
}

export async function migrateLegacyNotes(notes: LegacyNote[], client: NoteCreateClient): Promise<MigrationResult> {
  const orderedNotes = orderLegacyNotes(notes)
  const idMap = new Map<number, number>()
  const createdNotes = new Map<number, LegacyNote>()

  for (const note of orderedNotes) {
    const mappedParentId = note.parent_id ? (idMap.get(note.parent_id) ?? null) : null

    if (note.is_folder) {
      const folder = await client.createFolder({
        title: note.title,
        notebook_id: note.notebook_id,
        parent_id: mappedParentId,
        tags: note.tags,
        type: note.type,
      })
      idMap.set(note.id, folder.id)
      createdNotes.set(note.id, note)
      continue
    }

    const created = await client.createNote({
      title: note.title,
      content: note.content ?? '',
      notebook_id: note.notebook_id,
      icon: note.icon,
      parent_id: mappedParentId,
      is_title_manually_edited: note.is_title_manually_edited,
      tags: note.tags,
      type: note.type,
      is_folder: false,
      background_paper: note.background_paper,
      sort_key: note.sort_key,
      stickers: note.stickers ?? [],
      sticky_notes: note.sticky_notes ?? [],
    })
    idMap.set(note.id, created.id)
    createdNotes.set(note.id, note)
  }

  for (const note of orderedNotes) {
    if (note.is_folder || !note.content) {
      continue
    }

    const nextId = idMap.get(note.id)
    if (!nextId) {
      continue
    }

    const rewrittenContent = replaceLegacyNoteLinks(note.content, idMap)
    if (rewrittenContent !== note.content) {
      await client.updateNote(nextId, { content: rewrittenContent })
    }
  }

  return { idMap }
}

export function parseLegacyNotes(raw: string | null) {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is LegacyNote => typeof item?.id === 'number' && typeof item?.title === 'string')
  } catch (error) {
    console.error('Failed to parse legacy local notes:', error)
    return []
  }
}

export function shouldRunLegacyMigration(
  legacyNotes: Array<Pick<LegacyNote, 'id' | 'title'>>,
  currentVaultNotes: Array<Pick<LegacyNote, 'id' | 'title'>>,
  hasCompletedMigration: boolean,
) {
  if (hasCompletedMigration || legacyNotes.length === 0) {
    return false
  }

  if (currentVaultNotes.length === 0) {
    return true
  }

  const currentTitles = new Set(
    currentVaultNotes
      .map(note => note.title.trim().toLowerCase())
      .filter(Boolean),
  )

  const overlappingCount = legacyNotes.filter(note => currentTitles.has(note.title.trim().toLowerCase())).length
  return overlappingCount / legacyNotes.length < 0.5
}
