type NoteLike = { id: number }

interface ChooseCurrentNoteIdOptions<TNote extends NoteLike> {
  previousId: number | null
  preferredId?: number | null
  fallbackId?: number | null
  protectedId?: number | null
  notes: TNote[]
  pickFallback: (notes: TNote[], preferredId?: number | null) => number | null
}

function hasNote<TNote extends NoteLike>(notes: TNote[], id: number | null | undefined): id is number {
  return typeof id === 'number' && notes.some((note) => note.id === id)
}

export function chooseCurrentNoteIdAfterRefresh<TNote extends NoteLike>({
  previousId,
  preferredId = null,
  fallbackId = null,
  protectedId = null,
  notes,
  pickFallback,
}: ChooseCurrentNoteIdOptions<TNote>): number | null {
  if (typeof protectedId === 'number') {
    return protectedId
  }
  if (hasNote(notes, previousId)) {
    return previousId
  }
  const targetId = preferredId ?? previousId ?? fallbackId
  if (hasNote(notes, targetId)) {
    return targetId
  }
  return pickFallback(notes, targetId)
}
