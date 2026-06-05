export type AdvancedTableSelectionScope = 'cell' | 'row' | 'column' | null

type CellVisitor = (node: any, pos: number) => void

export function isAdvancedTableCellSelection(selection: any): boolean {
  return Boolean(
    selection &&
      '$anchorCell' in selection &&
      '$headCell' in selection,
  )
}

export function getAdvancedTableSelectionScope(selection: any): AdvancedTableSelectionScope {
  if (!isAdvancedTableCellSelection(selection)) return null
  if (typeof selection.isRowSelection === 'function' && selection.isRowSelection()) return 'row'
  if (typeof selection.isColSelection === 'function' && selection.isColSelection()) return 'column'
  return 'cell'
}

export function getAdvancedTableCellSelectionSize(selection: any): number {
  if (!isAdvancedTableCellSelection(selection) || typeof selection.forEachCell !== 'function') {
    return 0
  }
  let count = 0
  try {
    selection.forEachCell(() => {
      count += 1
    })
  } catch {
    count = 0
  }
  return count
}

export function forEachAdvancedTableCellInSelection(state: any, fn: CellVisitor): number {
  const selection = state?.selection

  if (isAdvancedTableCellSelection(selection) && typeof selection.forEachCell === 'function') {
    const cells: Array<{ node: any; pos: number }> = []
    selection.forEachCell((node: any, pos: number) => {
      cells.push({ node, pos })
    })
    cells.sort((a, b) => b.pos - a.pos)
    cells.forEach(({ node, pos }) => fn(node, pos))
    return cells.length
  }

  const $from = selection?.$from
  if (!$from) return 0

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    const nodeName = node?.type?.name
    if (nodeName === 'tableCell' || nodeName === 'tableHeader') {
      const pos = $from.before(depth)
      fn(node, pos)
      return 1
    }
  }

  return 0
}
