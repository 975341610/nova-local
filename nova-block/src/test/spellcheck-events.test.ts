import { describe, expect, it } from 'vitest'

import type { SpellcheckError } from '../components/novablock/extensions/AISpellcheck'
import { findSpellcheckErrorFromTarget } from '../components/novablock/extensions/AISpellcheck'
import { findSpellcheckErrorFromCoords } from '../components/novablock/extensions/AISpellcheck'
import { findSpellcheckErrorFromRenderedRects } from '../components/novablock/extensions/AISpellcheck'
import { findSpellcheckErrorsInRange } from '../components/novablock/extensions/AISpellcheck'
import { findSpellcheckErrorsMatchingBlockText } from '../components/novablock/extensions/AISpellcheck'
import { findClosestSpellcheckErrorByPoint } from '../components/novablock/extensions/AISpellcheck'
import { findSpellcheckErrorFromCaretPoint } from '../components/novablock/extensions/AISpellcheck'
import { findSpellcheckErrorFromPointProbes } from '../components/novablock/extensions/AISpellcheck'
import { parseSpellcheckErrorFromTarget } from '../components/novablock/extensions/AISpellcheck'
import { mergeSpellcheckErrorsForRange } from '../components/novablock/extensions/AISpellcheck'
import { mapSpellcheckErrors } from '../components/novablock/extensions/AISpellcheck'
import { mapSpellcheckResultsToParagraph } from '../components/novablock/extensions/AISpellcheck'
import { collectSpellcheckTextblocks } from '../components/novablock/extensions/AISpellcheck'
import { getSpellcheckTextblockAtPos } from '../components/novablock/extensions/AISpellcheck'
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

  it('falls back to the clicked document coordinates when the underline marker is not the direct event target', () => {
    expect(
      findSpellcheckErrorFromCoords(
        errors,
        () => ({ pos: 21 }),
        { left: 100, top: 200 },
      ),
    ).toEqual(errors[1])
  })

  it('falls back to rendered error rectangles when dom target and pos lookup both miss', () => {
    expect(
      findSpellcheckErrorFromRenderedRects(
        errors,
        (pos: number) => {
          if (pos === 20) {
            return { left: 100, right: 110, top: 200, bottom: 220 }
          }
          return { left: 130, right: 145, top: 200, bottom: 220 }
        },
        { left: 118, top: 210 },
      ),
    ).toEqual(errors[1])
  })

  it('falls back to caret-resolved text position before broad geometry matching', () => {
    expect(
      findSpellcheckErrorFromCaretPoint(
        errors,
        () => 21,
        { left: 120, top: 200 },
      ),
    ).toEqual(errors[1])
  })

  it('probes a few pixels around the click so direct clicks on the glyph still resolve to the typo', () => {
    expect(
      findSpellcheckErrorFromPointProbes(
        (point) => point.top <= 196 ? errors[1] : null,
        { left: 120, top: 200 },
      ),
    ).toEqual(errors[1])
  })

  it('filters cached errors to the clicked text block range', () => {
    expect(findSpellcheckErrorsInRange(errors, 18, 24)).toEqual([errors[1]])
  })

  it('matches cached errors directly from the clicked block text when the event lands on the paragraph element', () => {
    expect(findSpellcheckErrorsMatchingBlockText(errors, 'this has teh inside')).toEqual([errors[1]])
  })

  it('chooses the closest cached error inside the clicked text block when multiple remain', () => {
    expect(
      findClosestSpellcheckErrorByPoint(
        errors,
        (pos: number) => {
          if (pos <= 15) {
            return { left: 40, right: 80, top: 100, bottom: 120 }
          }
          return { left: 140, right: 180, top: 100, bottom: 120 }
        },
        { left: 150, top: 110 },
      ),
    ).toEqual(errors[1])
  })

  it('does not choose a distant cached error when the click is too far away', () => {
    expect(
      findClosestSpellcheckErrorByPoint(
        errors,
        (_pos: number) => ({ left: 140, right: 180, top: 100, bottom: 120 }),
        { left: 400, top: 400 },
      ),
    ).toBeNull()
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

  it('maps spellcheck results using the explicit paragraph range when provided', () => {
    const mapped = mapSpellcheckResultsToParagraph(
      null,
      'teh',
      [{ word: 'teh', suggestion: 'the', reason: 'typo', offset: 0 }],
      42,
    )

    expect(mapped.rangeFrom).toBe(42)
    expect(mapped.rangeTo).toBe(45)
    expect(mapped.mappedErrors).toEqual([
      { word: 'teh', suggestion: 'the', reason: 'typo', offset: 0, from: 42, to: 45 },
    ])
  })

  it('collects all text blocks for initial spellcheck instead of stopping at the first paragraph', () => {
    const doc = {
      descendants: (callback: (node: any, pos: number) => boolean) => {
        callback({ isTextblock: true, textContent: 'first block', nodeSize: 13, type: { name: 'paragraph' } }, 0)
        callback({ isTextblock: true, textContent: 'second block', nodeSize: 14, type: { name: 'heading' } }, 20)
        return true
      },
    }

    expect(collectSpellcheckTextblocks(doc as any)).toEqual([
      { text: 'first block', rangeFrom: 1, rangeTo: 12, typeName: 'paragraph' },
      { text: 'second block', rangeFrom: 21, rangeTo: 33, typeName: 'heading' },
    ])
  })

  it('finds the clicked text block by document position for on-demand spellcheck refresh', () => {
    const doc = {
      descendants: (callback: (node: any, pos: number) => boolean) => {
        if (callback({ isTextblock: true, textContent: 'first block', nodeSize: 13, type: { name: 'paragraph' } }, 0) === false) {
          return false
        }
        if (callback({ isTextblock: true, textContent: 'second block', nodeSize: 14, type: { name: 'heading' } }, 20) === false) {
          return false
        }
        return true
      },
    }

    expect(getSpellcheckTextblockAtPos(doc as any, 25)).toEqual({
      text: 'second block',
      rangeFrom: 21,
      rangeTo: 33,
      typeName: 'heading',
    })
  })
})
