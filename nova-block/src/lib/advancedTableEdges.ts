export type AdvancedTableRect = {
  left: number
  top: number
  width: number
  height: number
}

export type AdvancedTableEdgeDot = {
  key: string
  left: number
  top: number
  commandPoint: { x: number; y: number }
  line: { left: number; top: number; width: number; height: number }
}

export type AdvancedTableEdgeControl = {
  kind: 'row' | 'column'
  select: { left: number; top: number; width: number; height: number }
  dots: AdvancedTableEdgeDot[]
}

export type AdvancedTableEdgeIntent = null | {
  row: AdvancedTableEdgeControl
  column: AdvancedTableEdgeControl
}

export type AdvancedTableEdgeMetrics = {
  tableRect: AdvancedTableRect
  columnRects: AdvancedTableRect[]
  rowRects: AdvancedTableRect[]
}

const rightOf = (rect: AdvancedTableRect) => rect.left + rect.width
const bottomOf = (rect: AdvancedTableRect) => rect.top + rect.height

export function buildAdvancedTableEdgeIntent(metrics: AdvancedTableEdgeMetrics): AdvancedTableEdgeIntent {
  const { tableRect, columnRects, rowRects } = metrics

  if (!columnRects.length || !rowRects.length || tableRect.width <= 0 || tableRect.height <= 0) {
    return null
  }

  const columnDots: AdvancedTableEdgeDot[] = columnRects.map((rect, index) => {
    const safeY = rect.top + Math.min(20, Math.max(8, rect.height / 2))
    const right = rightOf(rect)
    return {
      key: `col-${index}`,
      left: right - 17,
      top: tableRect.top - 40,
      commandPoint: { x: rect.left + rect.width / 2, y: safeY },
      line: { left: right - 1, top: tableRect.top, width: 2, height: tableRect.height },
    }
  })

  const rowDots: AdvancedTableEdgeDot[] = rowRects.map((rect, index) => {
    const safeX = rect.left + Math.min(20, Math.max(8, rect.width / 2))
    const bottom = bottomOf(rect)
    return {
      key: `row-${index}`,
      left: tableRect.left - 40,
      top: bottom - 17,
      commandPoint: { x: safeX, y: rect.top + rect.height / 2 },
      line: { left: tableRect.left, top: bottom - 1, width: tableRect.width, height: 2 },
    }
  })

  return {
    column: {
      kind: 'column',
      select: { left: tableRect.left, top: tableRect.top - 28, width: tableRect.width, height: 28 },
      dots: columnDots,
    },
    row: {
      kind: 'row',
      select: { left: tableRect.left - 28, top: tableRect.top, width: 28, height: tableRect.height },
      dots: rowDots,
    },
  }
}
