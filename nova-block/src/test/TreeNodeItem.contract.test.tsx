/**
 * @vitest-environment jsdom
 *
 * F2-T0 · TreeNodeItem 必须暴露 `data-tree-node-id={node.id}`,
 * 给 F2a 空白菜单的 closest('[data-tree-node-id]') 命中规则使用。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { TreeNodeItem } from '../components/sidebar/TreeNodeItem'
import type { FlattenedNode } from '../lib/novablock/treeUtils'

const node: FlattenedNode = {
  id: 'note-42',
  parentId: null,
  sortKey: 'm',
  title: '清知测试',
  isFolder: false,
  level: 0,
  isExpanded: false,
  hasChildren: false,
}

afterEach(() => cleanup())

describe('TreeNodeItem · data-tree-node-id (F2-T0)', () => {
  it('renders an element carrying data-tree-node-id matching node.id', () => {
    const { container } = render(
      <TreeNodeItem
        node={node}
        onMove={() => {}}
        onSelect={() => {}}
        onToggle={() => {}}
      />,
    )
    const el = container.querySelector('[data-tree-node-id]') as HTMLElement | null
    expect(el).not.toBeNull()
    expect(el!.getAttribute('data-tree-node-id')).toBe('note-42')
  })
})
