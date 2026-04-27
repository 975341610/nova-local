import { describe, expect, it } from 'vitest'

import type { SpellcheckError } from '../components/novablock/extensions/AISpellcheck'
import {
  collectSpellcheckTextblocks,
  findSpellcheckErrorAtDocPos,
  getSpellcheckTextblockAtPos,
  getSpellcheckTextblockFromSelection,
  mapSpellcheckResultsToTextblock,
  reduceSpellcheckErrorsAfterDocChange,
  resolveSpellcheckPopupRequest,
  resolveTextOffsetToDocPos,
} from '../components/novablock/extensions/AISpellcheck'

describe('AISpellcheck rebuilt core', () => {
  const errors: SpellcheckError[] = [
    { word: 'wrnog', suggestion: 'wrong', reason: 'typo', from: 10, to: 15 },
    { word: 'teh', suggestion: 'the', reason: 'typo', from: 20, to: 23 },
  ]

  it('maps backend code-point offsets to ProseMirror UTF-16 document positions', () => {
    const mapped = mapSpellcheckResultsToTextblock(
      null,
      '🙂这里有地确',
      [{ word: '地确', suggestion: '的确', reason: '常见错别字', offset: 4 }],
      42,
    )

    expect(mapped.rangeFrom).toBe(42)
    expect(mapped.rangeTo).toBe(49)
    expect(mapped.errors).toEqual([
      { word: '地确', suggestion: '的确', reason: '常见错别字', offset: 4, from: 47, to: 49 },
    ])
  })

  it('maps text offsets through inline atom nodes without drifting redlines', () => {
    const textblock = {
      descendants: (callback: (node: any, pos: number) => boolean | void) => {
        callback({ isText: true, text: 'ab', textContent: 'ab', nodeSize: 2 }, 0)
        callback({ isText: false, textContent: '', nodeSize: 1 }, 2)
        callback({ isText: true, text: '地确', textContent: '地确', nodeSize: 2 }, 3)
        return true
      },
    }

    expect(resolveTextOffsetToDocPos(textblock as any, 42, 2)).toBe(45)
    expect(resolveTextOffsetToDocPos(textblock as any, 42, 4)).toBe(47)
  })

  it('uses document position as the single popup hit-test channel', () => {
    expect(findSpellcheckErrorAtDocPos(errors, 20)).toEqual(errors[1])
    expect(findSpellcheckErrorAtDocPos(errors, 22)).toEqual(errors[1])
    expect(findSpellcheckErrorAtDocPos(errors, 23)).toBeNull()
  })

  it('builds popup request from clicked document position and editor coords', () => {
    expect(
      resolveSpellcheckPopupRequest(
        errors,
        21,
        (pos: number) => {
          if (pos === 20) return { left: 100, right: 100, top: 200, bottom: 220 }
          if (pos === 23) return { left: 130, right: 130, top: 200, bottom: 220 }
          return { left: 0, right: 0, top: 0, bottom: 0 }
        },
      ),
    ).toEqual({
      error: errors[1],
      rect: {
        top: 200,
        left: 100,
        right: 130,
        bottom: 220,
        width: 30,
        height: 20,
      },
    })
  })

  it('clears cached errors immediately after document edits so typing is never blocked by stale redlines', () => {
    expect(reduceSpellcheckErrorsAfterDocChange(errors, true)).toEqual([])
    expect(reduceSpellcheckErrorsAfterDocChange(errors, false)).toEqual(errors)
  })

  it('collects editable text blocks for initial note checks', () => {
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

  it('finds the text block containing a corrected error for recheck', () => {
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

  it('gets the current text block from selection without scanning the full document', () => {
    expect(
      getSpellcheckTextblockFromSelection({
        parent: {
          isTextblock: true,
          textContent: '当前段落地确',
          type: { name: 'paragraph' },
          content: { size: 6 },
        },
        start: () => 42,
      } as any),
    ).toEqual({
      text: '当前段落地确',
      rangeFrom: 42,
      rangeTo: 48,
      typeName: 'paragraph',
    })

    expect(
      getSpellcheckTextblockFromSelection({
        parent: {
          isTextblock: false,
          textContent: 'not editable',
          type: { name: 'doc' },
        },
        start: () => 0,
      } as any),
    ).toBeNull()
  })
})
