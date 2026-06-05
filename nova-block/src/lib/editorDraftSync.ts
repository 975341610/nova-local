import type { Note } from './types'

type PersistedDraft = Note | null | undefined
type DraftLike = Partial<Note> | null | undefined
type NoteIdentifier = number | string | null | undefined
type QueuedSavePayload = Partial<Note> & { id?: number | string }

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

export function buildEditorSavePayload<T extends DraftLike>(
  currentDraft: T,
  html: string,
  updates?: Partial<Note>,
) {
  if (!currentDraft) {
    return null
  }

  return {
    ...currentDraft,
    ...updates,
    content: html,
  }
}

export function upsertQueuedSavePayload<T extends QueuedSavePayload>(
  queue: T[],
  nextPayload: T,
) {
  const noteId = nextPayload?.id
  const existingIndex = queue.findIndex((queued) => queued?.id === noteId)
  if (existingIndex >= 0) {
    queue[existingIndex] = nextPayload
    return
  }

  queue.push(nextPayload)
}

export function resolveQueuedSaveDrainIfIdle<T>(
  isSaving: boolean,
  queue: T[],
  drainResolvers: Array<() => void>,
) {
  if (isSaving || queue.length > 0) {
    return false
  }

  const resolvers = drainResolvers.splice(0)
  for (const resolve of resolvers) {
    resolve()
  }
  return true
}

export function waitForQueuedSaveDrain<T>(
  isSaving: boolean,
  queue: T[],
  drainResolvers: Array<() => void>,
) {
  if (!isSaving && queue.length === 0) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    drainResolvers.push(resolve)
  })
}

export function isSavedPayloadCurrentCleanDraft(
  currentDraft: DraftLike,
  savedDraft: DraftLike,
  editorHtml: string | undefined,
  savedContent: string | undefined,
) {
  return shouldApplySavedDraftToCurrentNote(currentDraft, savedDraft)
    && (editorHtml === savedContent || editorHtml === savedDraft?.content)
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
