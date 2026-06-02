export const NOTES_HOME_TITLE = '我的笔记'

export interface NotesHomeNode {
  id: number
  title?: string | null
  parent_id?: number | null
  is_folder?: boolean
  type?: string | null
}

export function getNotesHomeFolder<T extends NotesHomeNode>(notes: T[]): T | null {
  return notes.find((note) => (
    note.is_folder === true
    && (note.parent_id ?? null) === null
    && (note.title ?? '').trim() === NOTES_HOME_TITLE
  )) ?? null
}

export function getDefaultNoteParentId(notes: NotesHomeNode[]): number | null {
  return getNotesHomeFolder(notes)?.id ?? null
}

export function getRootNotesNeedingHome<T extends NotesHomeNode>(notes: T[], homeFolderId: number): T[] {
  return notes.filter((note) => (
    !note.is_folder
    && note.id !== homeFolderId
    && (note.parent_id ?? null) === null
  ))
}
