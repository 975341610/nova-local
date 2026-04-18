import { describe, it, expect } from 'vitest';
import { buildTree, moveNode, isDescendant } from '../../lib/novablock/treeUtils';
import type { TreeNode } from '../../lib/novablock/treeUtils';

describe('Tree Utilities', () => {
  const mockNodes: TreeNode[] = [
    { id: '1', parentId: null, sortKey: 'm', title: 'Node 1' },
    { id: '2', parentId: null, sortKey: 't', title: 'Node 2' },
    { id: '3', parentId: '1', sortKey: 'm', title: 'Child 1.1' },
    { id: '4', parentId: '3', sortKey: 'm', title: 'Grandchild 1.1.1' },
  ];

  it('should detect descendant correctly', () => {
    // 3 is child of 1
    expect(isDescendant(mockNodes, '3', '1')).toBe(true);
    // 4 is grandchild of 1
    expect(isDescendant(mockNodes, '4', '1')).toBe(true);
    // 1 is not descendant of 3
    expect(isDescendant(mockNodes, '1', '3')).toBe(false);
    // 2 is not descendant of 1
    expect(isDescendant(mockNodes, '2', '1')).toBe(false);
    // self is not descendant of self (optional, but good to know)
    expect(isDescendant(mockNodes, '1', '1')).toBe(false);
  });

  it('should prevent moving a parent into its own descendant', () => {
    // Attempting to move Node 1 into Grandchild 1.1.1 (ID: 4)
    const canMove = !isDescendant(mockNodes, '4', '1');
    expect(canMove).toBe(false);
  });

  it('should build a tree from flat nodes', () => {
    const tree = buildTree(mockNodes);
    expect(tree).toHaveLength(2);
    expect(tree[0].id).toBe('1');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].id).toBe('3');
    expect(tree[1].id).toBe('2');
  });

  it('should calculate new properties when moving into a node', () => {
    const result = moveNode(mockNodes, '2', '1', 'into');
    expect(result.parentId).toBe('1');
    // Child 1.1 has sortKey 'm', so moving '2' into '1' should put it after 'm'
    expect(result.sortKey.localeCompare('m')).toBeGreaterThan(0);
  });

  it('should calculate new properties when moving before a node', () => {
    const result = moveNode(mockNodes, '2', '1', 'before');
    expect(result.parentId).toBeNull();
    expect(result.sortKey.localeCompare('m')).toBeLessThan(0);
  });

  it('should calculate new properties when moving after a node', () => {
    const result = moveNode(mockNodes, '1', '2', 'after');
    expect(result.parentId).toBeNull();
    expect(result.sortKey.localeCompare('t')).toBeGreaterThan(0);
  });
});
