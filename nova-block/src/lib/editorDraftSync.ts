import type { Note } from './types'

type PersistedDraft = Note | null | undefined
type DraftLike = Partial<Note> | null | undefined
type NoteIdentifier = number | string | null | undefined

type PendingSwitchSaveArgs = {
  currentDraft: DraftLike
  previousNoteId: NoteIdentifier
  isDirty: boolean
  html: string
}

export function syncLatestDraftWithIncomingNote(
  currentDraft: PersistedDraft,
  incomingNote: PersistedDraft,
  previousNoteId: NoteIdentifier,
): Note | null {
  if (!incomingNote) {
    return currentDraft ?? null
  }

  if (!currentDraft) {
    return incomingNote
  }

  if (previousNoteId !== null && previousNoteId !== undefined && currentDraft.id === previousNoteId) {
    return incomingNote
  }

  return currentDraft.id === incomingNote.id
    ? { ...incomingNote, content: currentDraft.content ?? incomingNote.content }
    : incomingNote
}

export function shouldApplySavedDraftToCurrentNote(
  currentDraft: DraftLike,
  savedDraft: DraftLike,
) {
  if (!currentDraft || !savedDraft) {
    return false
  }

  if (currentDraft.id !== undefined && savedDraft.id !== undefined) {
    return currentDraft.id === savedDraft.id
  }

  if (currentDraft.file_path && savedDraft.file_path) {
    return currentDraft.file_path === savedDraft.file_path
  }

  return false
}

export function buildPendingSwitchSavePayload({
  currentDraft,
  previousNoteId,
  isDirty,
  html,
}: PendingSwitchSaveArgs) {
  if (!currentDraft || !isDirty) {
    return null
  }

  if (previousNoteId === null || previousNoteId === undefined) {
    return null
  }

  if (currentDraft.id !== previousNoteId) {
    return null
  }

  return {
    ...currentDraft,
    content: html,
  }
}
