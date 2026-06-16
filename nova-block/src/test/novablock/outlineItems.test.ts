import { describe, expect, it } from 'vitest'

import { collectOutlineItems, shouldReuseOutlineItems } from '../../lib/novablock/outlineItems'

type FakeNode = {
  type: { name: string }
  attrs: Record<string, any>
  textContent: string
  isBlock?: boolean
}

function createDoc(entries: Array<{ node: FakeNode; pos: number }>) {
  return {
    descendants(callback: (node: FakeNode, pos: number) => boolean | void) {
      for (const entry of entries) {
        callback(entry.node, entry.pos)
      }
    },
  }
}

const heading = (level: number, text: string, attrs: Record<string, any> = {}): FakeNode => ({
  type: { name: 'heading' },
  attrs: { level, ...attrs },
  textContent: text,
  isBlock: true,
})

const paragraph = (text: string): FakeNode => ({
  type: { name: 'paragraph' },
  attrs: {},
  textContent: text,
  isBlock: true,
})

describe('outline item collection', () => {
  it('collects heading outline items with fallback titles and stable keys', () => {
    const doc = createDoc([
      { node: paragraph('intro'), pos: 0 },
      { node: heading(1, 'Design', { id: 'h-design' }), pos: 1 },
      { node: heading(2, '   '), pos: 10 },
    ])

    expect(collectOutlineItems(doc)).toEqual([
      { id: 'h-design', key: 'h-design-1-1', text: 'Design', level: 1 },
      { id: 'h-pending-10', key: 'h-pending-10-10-2', text: '无标题', level: 2 },
    ])
  })

  it('omits headings hidden by a collapsed parent until the fold boundary ends', () => {
    const doc = createDoc([
      { node: heading(1, 'Parent', { id: 'parent', collapsed: true }), pos: 1 },
      { node: heading(2, 'Hidden child', { id: 'child' }), pos: 5 },
      { node: heading(1, 'Sibling', { id: 'sibling' }), pos: 9 },
    ])

    expect(collectOutlineItems(doc).map((item) => item.text)).toEqual(['Parent', 'Sibling'])
  })

  it('reuses existing outline arrays only when stable non-pending data is unchanged', () => {
    const previous = [{ id: 'h-a', key: 'h-a-1-1', text: 'A', level: 1 }]
    const same = [{ id: 'h-a', key: 'h-a-1-1', text: 'A', level: 1 }]
    const pending = [{ id: 'h-pending-1', key: 'h-pending-1-1-1', text: 'A', level: 1 }]

    expect(shouldReuseOutlineItems(previous, same)).toBe(true)
    expect(shouldReuseOutlineItems(previous, [{ ...same[0], text: 'B' }])).toBe(false)
    expect(shouldReuseOutlineItems(previous, pending)).toBe(false)
    expect(shouldReuseOutlineItems(pending, same)).toBe(false)
  })
})
