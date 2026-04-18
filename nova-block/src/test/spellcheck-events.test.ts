import { describe, expect, it } from 'vitest'

import type { SpellcheckError } from '../components/novablock/extensions/AISpellcheck'
import { findSpellcheckErrorFromTarget } from '../components/novablock/extensions/AISpellcheck'
import { parseSpellcheckErrorFromTarget } from '../components/novablock/extensions/AISpellcheck'
import { mergeSpellcheckErrorsForRange } from '../components/novablock/extensions/AISpellcheck'
import { mapSpellcheckErrors } from '../components/novablock/extensions/AISpellcheck'
import {
  buildSpellcheckSuggestionDetail,
  findSpellcheckErrorAtPos,
  isSpellcheckDetailForNote,
} from '../components/novablock/extensions/spellcheckHelpers'

describe('spellcheckHelpers', () => {
  const errors: SpellcheckError[] = [
    { word: 'wrnog', suggestion: 'wrong', reason: 'typo', from: 10, to: 15 },
    { word: 'teh', suggestion: 'the', reason: 'typo', from: 20, to: 23 },
  ]

  it('finds the clicked spellcheck error by document position', () => {
    expect(findSpellcheckErrorAtPos(errors, 12)).toEqual(errors[0])
    expect(findSpellcheckErrorAtPos(errors, 21)).toEqual(errors[1])
    expect(findSpellcheckErrorAtPos(errors, 30)).toBeNull()
  })

  it('builds popup coordinates from the clicked range', () => {
    const detail = buildSpellcheckSuggestionDetail(errors[0], {
      top: 100,
      left: 40,
      right: 68,
      bottom: 120,
    }, {
      top: 100,
      left: 80,
      right: 120,
      bottom: 120,
    })

    expect(detail).toEqual({
      error: errors[0],
      noteId: null,
      rect: {
        top: 100,
        left: 40,
        width: 80,
        height: 20,
      },
    })
  })

  it('matches popup details to the currently opened note only', () => {
    expect(isSpellcheckDetailForNote(31, { noteId: 31 })).toBe(true)
    expect(isSpellcheckDetailForNote(31, { noteId: 18 })).toBe(false)
    expect(isSpellcheckDetailForNote(31, null)).toBe(false)
    expect(isSpellcheckDetailForNote(null, { noteId: 31 })).toBe(false)
  })

  it('keeps errors from other paragraphs when one paragraph is rechecked', () => {
    const existing: SpellcheckError[] = [
      { word: 'wrnog', suggestion: 'wrong', reason: 'typo', from: 10, to: 15 },
      { word: 'teh', suggestion: 'the', reason: 'typo', from: 40, to: 43 },
    ]

    expect(
      mergeSpellcheckErrorsForRange(
        existing,
        [],
        8,
        20,
      ),
    ).toEqual([
      { word: 'teh', suggestion: 'the', reason: 'typo', from: 40, to: 43 },
    ])

    expect(
      mergeSpellcheckErrorsForRange(
        existing,
        [{ word: 'wierd', suggestion: 'weird', reason: 'typo', from: 12, to: 17 }],
        8,
        20,
      ),
    ).toEqual([
      { word: 'wierd', suggestion: 'weird', reason: 'typo', from: 12, to: 17 },
      { word: 'teh', suggestion: 'the', reason: 'typo', from: 40, to: 43 },
    ])
  })

  it('maps cached error positions forward with document changes so clicking keeps working after edits', () => {
    const mapped = mapSpellcheckErrors(
      [{ word: 'teh', suggestion: 'the', reason: 'typo', from: 20, to: 23 }],
      {
        map: (pos: number) => pos + 5,
      },
    )

    expect(mapped).toEqual([
      { word: 'teh', suggestion: 'the', reason: 'typo', from: 25, to: 28 },
    ])
  })

  it('finds the clicked error from the rendered underline marker so reopening works reliably', () => {
    const marker = {
      dataset: {
        spellcheckFrom: '20',
        spellcheckTo: '23',
      },
      closest: () => marker,
    }
    const child = {
      closest: () => marker,
    }

    expect(findSpellcheckErrorFromTarget(errors, child as unknown as EventTarget)).toEqual(errors[1])
  })

  it('reconstructs the clicked spellcheck error directly from the rendered underline marker', () => {
    const marker = {
      dataset: {
        spellcheckWord: 'teh',
        spellcheckSuggestion: 'the',
        spellcheckReason: 'typo',
        spellcheckFrom: '20',
        spellcheckTo: '23',
      },
      closest: () => marker,
    }

    expect(parseSpellcheckErrorFromTarget(marker as unknown as EventTarget)).toEqual(errors[1])
  })
})
