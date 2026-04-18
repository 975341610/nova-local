import type { SpellcheckError } from './AISpellcheck'

type Coords = {
  top: number
  left: number
  right: number
  bottom: number
}

export function findSpellcheckErrorAtPos(errors: SpellcheckError[], pos: number | null | undefined) {
  if (typeof pos !== 'number') {
    return null
  }

  return errors.find((error) => pos >= error.from && pos <= error.to) ?? null
}

export function buildSpellcheckSuggestionDetail(error: SpellcheckError, startCoords: Coords, endCoords: Coords) {
  return {
    error,
    noteId: null as number | null,
    rect: {
      top: startCoords.top,
      left: startCoords.left,
      width: Math.max(endCoords.right - startCoords.left, 0),
      height: Math.max(startCoords.bottom - startCoords.top, 0),
    },
  }
}

export function isSpellcheckDetailForNote(currentNoteId: number | null | undefined, detail: { noteId?: number | null } | null | undefined) {
  if (typeof currentNoteId !== 'number') {
    return false
  }

  return Number(detail?.noteId) === currentNoteId
}
