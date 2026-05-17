import { describe, expect, it } from 'vitest'

import { qingzhiDragHandleNestedOptions } from '../../components/novablock/dragHandleTargeting'

function node(name: string, extra: Record<string, unknown> = {}) {
  return {
    type: { name },
    isInline: false,
    isText: false,
    ...extra,
  } as never
}

function evaluate(nodeName: string, parentName: string | null = null, extra: Record<string, unknown> = {}) {
  const rule = qingzhiDragHandleNestedOptions.rules?.[0]
  if (!rule) {
    throw new Error('Missing QingZhi drag-handle targeting rule')
  }

  return rule.evaluate({
    node: node(nodeName, extra),
    parent: parentName ? node(parentName) : null,
    pos: 1,
    depth: parentName ? 2 : 1,
    index: 0,
    isFirst: true,
    isLast: true,
    $pos: {} as never,
    view: {} as never,
  })
}

describe('QingZhi drag handle targeting', () => {
  it('keeps lists selectable as one block instead of selecting each list item', () => {
    expect(qingzhiDragHandleNestedOptions.defaultRules).toBe(false)
    expect(evaluate('orderedList')).toBe(0)
    expect(evaluate('bulletList')).toBe(0)
    expect(evaluate('taskList')).toBe(0)
    expect(evaluate('listItem', 'orderedList')).toBeGreaterThanOrEqual(1000)
    expect(evaluate('taskItem', 'taskList')).toBeGreaterThanOrEqual(1000)
    expect(evaluate('paragraph', 'listItem')).toBeGreaterThanOrEqual(1000)
  })

  it('keeps rich widgets and atoms selectable as whole top-level blocks', () => {
    for (const nodeName of [
      'codeBlock',
      'mathBlock',
      'horizontalRule',
      'image',
      'audioNode',
      'videoNode',
      'embedNode',
      'fileNode',
      'slider',
      'freehand',
      'washiTape',
      'countdown',
      'musicPlayer',
      'miniCalendar',
      'kanban',
      'habitTracker',
      'todoWidget',
      'timeline',
    ]) {
      expect(evaluate(nodeName)).toBe(0)
    }
  })

  it('selects compound blocks instead of their inner structural children', () => {
    expect(evaluate('timelineItem', 'timeline')).toBeGreaterThanOrEqual(1000)
    expect(evaluate('paragraph', 'blockquote')).toBeGreaterThanOrEqual(1000)
    expect(evaluate('paragraph', 'callout')).toBeGreaterThanOrEqual(1000)
    expect(evaluate('tableRow', 'table')).toBeGreaterThanOrEqual(1000)
    expect(evaluate('tableCell', 'tableRow')).toBeGreaterThanOrEqual(1000)
    expect(evaluate('paragraph', 'tableCell')).toBeGreaterThanOrEqual(1000)
  })

  it('uses a wide left-edge band so the handle stays on the outer block lane', () => {
    expect(qingzhiDragHandleNestedOptions.edgeDetection).toEqual({
      edges: ['left'],
      threshold: 72,
      strength: 700,
    })
  })
})
