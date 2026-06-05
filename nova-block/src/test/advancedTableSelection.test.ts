import { describe, expect, it } from 'vitest'

import {
  forEachAdvancedTableCellInSelection,
  getAdvancedTableCellSelectionSize,
  getAdvancedTableSelectionScope,
  isAdvancedTableCellSelection,
} from '../lib/advancedTableSelection'

describe('advanced table selection helpers', () => {
  it('recognizes ProseMirror cell selections by shape', () => {
    const selection = {
      $anchorCell: {},
      $headCell: {},
      forEachCell: () => undefined,
    }

    expect(isAdvancedTableCellSelection(selection)).toBe(true)
    expect(isAdvancedTableCellSelection({})).toBe(false)
  })

  it('derives row, column and cell selection scopes', () => {
    expect(getAdvancedTableSelectionScope({
      $anchorCell: {},
      $headCell: {},
      isRowSelection: () => true,
      isColSelection: () => false,
    })).toBe('row')

    expect(getAdvancedTableSelectionScope({
      $anchorCell: {},
      $headCell: {},
      isRowSelection: () => false,
      isColSelection: () => true,
    })).toBe('column')

    expect(getAdvancedTableSelectionScope({
      $anchorCell: {},
      $headCell: {},
    })).toBe('cell')
  })

  it('counts selected cells with safe failure handling', () => {
    expect(getAdvancedTableCellSelectionSize({
      $anchorCell: {},
      $headCell: {},
      forEachCell: (fn: () => void) => {
        fn()
        fn()
      },
    })).toBe(2)

    expect(getAdvancedTableCellSelectionSize({
      $anchorCell: {},
      $headCell: {},
      forEachCell: () => {
        throw new Error('selection changed')
      },
    })).toBe(0)
  })

  it('iterates selected cells in reverse document order', () => {
    const visited: number[] = []
    const count = forEachAdvancedTableCellInSelection({
      selection: {
        $anchorCell: {},
        $headCell: {},
        forEachCell: (fn: (node: unknown, pos: number) => void) => {
          fn({ attrs: {} }, 10)
          fn({ attrs: {} }, 3)
          fn({ attrs: {} }, 7)
        },
      },
    }, (_node, pos) => visited.push(pos))

    expect(count).toBe(3)
    expect(visited).toEqual([10, 7, 3])
  })

  it('falls back to the ancestor table cell around a text selection', () => {
    const node = { type: { name: 'tableCell' }, nodeSize: 5 }
    const visited: Array<{ node: unknown; pos: number }> = []
    const state = {
      selection: {
        $from: {
          depth: 2,
          node: (depth: number) => depth === 2 ? node : { type: { name: 'table' } },
          before: () => 42,
        },
      },
    }

    const count = forEachAdvancedTableCellInSelection(state, (nextNode, pos) => {
      visited.push({ node: nextNode, pos })
    })

    expect(count).toBe(1)
    expect(visited).toEqual([{ node, pos: 42 }])
  })
})
