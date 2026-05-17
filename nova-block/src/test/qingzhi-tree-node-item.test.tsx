// @vitest-environment jsdom

import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TreeNodeItem } from '../components/sidebar/TreeNodeItem'
import type { FlattenedNode } from '../lib/novablock/treeUtils'

const baseNode: FlattenedNode = {
  id: '11',
  title: '清知节点',
  parentId: null,
  sortKey: 'm',
  isFolder: false,
  level: 1,
  isExpanded: false,
  hasChildren: false,
}

function renderNode(overrides: Partial<FlattenedNode> = {}) {
  const node = { ...baseNode, ...overrides }
  const onSelect = vi.fn()
  const onToggle = vi.fn()
  const onMove = vi.fn()

  render(
    <TreeNodeItem
      node={node}
      selectedId={overrides.id ?? baseNode.id}
      onSelect={onSelect}
      onToggle={onToggle}
      onMove={onMove}
    />,
  )

  return { node, onSelect, onToggle, onMove }
}

describe('QingZhi TreeNodeItem', () => {
  afterEach(() => cleanup())

  it('renders QingZhi node chrome for notes with icon, title, depth, and menu affordance', () => {
    const { onSelect } = renderNode()

    const item = screen.getByTestId('qingzhi-tree-node-11')
    expect(item).toBeTruthy()
    expect(item.getAttribute('class') ?? '').toContain('qz-tree-node-item')
    expect(item.getAttribute('data-depth')).toBe('1')
    expect(item.getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId('qingzhi-tree-node-icon-11')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-tree-node-title-11')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-tree-node-menu-11')).toBeTruthy()

    fireEvent.click(item)
    expect(onSelect).toHaveBeenCalledWith('11')
  })

  it('uses QingZhi folder affordance and keeps folder toggle behavior', () => {
    const { onToggle } = renderNode({ id: '22', title: '资料夹', isFolder: true, hasChildren: true, isExpanded: true })

    const item = screen.getByTestId('qingzhi-tree-node-22')
    expect(item.getAttribute('data-folder')).toBe('true')
    expect(item.getAttribute('data-expanded')).toBe('true')
    expect(screen.getByTestId('qingzhi-tree-node-disclosure-22')).toBeTruthy()

    fireEvent.click(item)
    expect(onToggle).toHaveBeenCalledWith('22')
  })
})
