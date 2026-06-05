import { describe, expect, it } from 'vitest'
import { buildAdvancedTableEdgeIntent } from '../lib/advancedTableEdges'

describe('advanced table edge intent geometry', () => {
  it('builds stable column and row edge controls from table metrics', () => {
    const intent = buildAdvancedTableEdgeIntent({
      tableRect: { left: 100, top: 80, width: 300, height: 120 },
      columnRects: [
        { left: 100, top: 80, width: 100, height: 30 },
        { left: 200, top: 80, width: 100, height: 30 },
      ],
      rowRects: [
        { left: 100, top: 80, width: 100, height: 30 },
        { left: 100, top: 110, width: 100, height: 40 },
      ],
    })

    expect(intent).not.toBeNull()
    expect(intent?.column.select).toEqual({ left: 100, top: 52, width: 300, height: 28 })
    expect(intent?.row.select).toEqual({ left: 72, top: 80, width: 28, height: 120 })
    expect(intent?.column.dots[0]).toMatchObject({
      key: 'col-0',
      left: 183,
      top: 40,
      commandPoint: { x: 150, y: 95 },
      line: { left: 199, top: 80, width: 2, height: 120 },
    })
    expect(intent?.row.dots[1]).toMatchObject({
      key: 'row-1',
      left: 60,
      top: 133,
      commandPoint: { x: 120, y: 130 },
      line: { left: 100, top: 149, width: 300, height: 2 },
    })
  })

  it('returns null when a table has no measurable rows or columns', () => {
    expect(buildAdvancedTableEdgeIntent({
      tableRect: { left: 0, top: 0, width: 0, height: 0 },
      columnRects: [],
      rowRects: [],
    })).toBeNull()
  })
})
