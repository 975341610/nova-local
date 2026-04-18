export interface TreeNode {
  id: string;
  parentId: string | null;
  sortKey: string;
  title: string;
  isFolder?: boolean;
  children?: TreeNode[];
}

/**
 * 核心 Fractional Indexing 算法：生成两个字符串之间的中值
 * 简单版 LexoRank，支持无限层级排序
 */
export function generateMidpoint(prev: string | null, next: string | null): string {
  // const BASE = 256; // 使用所有 ASCII 字符
  
  if (!prev && !next) return 'm'; // 默认中值 (ASCII 109)
  
  if (!prev) {
    // 在最前面插入，将 next 的首字母减半
    const firstChar = next!.charCodeAt(0);
    if (firstChar > 32) {
      return String.fromCharCode(Math.floor((32 + firstChar) / 2));
    }
    return String.fromCharCode(32) + 'm';
  }
  
  if (!next) {
    // 在最后面插入，将 prev 的最后一位加到 'z' (122)
    const lastChar = prev.charCodeAt(prev.length - 1);
    if (lastChar < 126) {
      return prev.slice(0, -1) + String.fromCharCode(Math.floor((lastChar + 126) / 2));
    }
    return prev + 'm';
  }

  // 计算中间值
  let i = 0;
  while (true) {
    const prevChar = prev.charCodeAt(i) || 32;
    const nextChar = next.charCodeAt(i) || 126;

    if (prevChar === nextChar) {
      i++;
      continue;
    }

    if (nextChar - prevChar > 1) {
      // 找到间隙，取中值
      return prev.slice(0, i) + String.fromCharCode(Math.floor((prevChar + nextChar) / 2));
    } else {
      // 相邻，递归下一位
      return prev.slice(0, i + 1) + generateMidpoint(prev.slice(i + 1), next.slice(i + 1) || null);
    }
  }
}

/**
 * 检查 nodeB 是否是 nodeA 的子孙节点
 */
export function isDescendant(allNodes: TreeNode[], nodeAId: string, nodeBId: string): boolean {
  if (nodeAId === nodeBId) return false;

  let current = allNodes.find(n => n.id === nodeAId);
  while (current && current.parentId) {
    if (current.parentId === nodeBId) return true;
    current = allNodes.find(n => n.id === current!.parentId);
  }
  return false;
}

/**
 * 将扁平数组构建为树形结构，并按 sortKey 排序
 */
export function buildTree(nodes: TreeNode[]): TreeNode[] {
  const sortedNodes = [...nodes].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const nodeMap = new Map<string, TreeNode>();
  const rootNodes: TreeNode[] = [];

  // 初始化 Map，克隆节点避免副作用
  sortedNodes.forEach(node => {
    nodeMap.set(node.id, { ...node, children: [] });
  });

  sortedNodes.forEach(node => {
    const current = nodeMap.get(node.id)!;
    if (node.parentId === null) {
      rootNodes.push(current);
    } else {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(current);
      }
      // 如果 parent 丢失，则该节点不显示
    }
  });

  return rootNodes;
}

/**
 * 计算节点移动后的属性 (parentId, sortKey)
 */
export function moveNode(
  allNodes: TreeNode[],
  _nodeId: string,
  targetId: string,
  position: 'before' | 'after' | 'into'
): { parentId: string | null; sortKey: string } {
  const targetNode = allNodes.find(n => n.id === targetId);
  if (!targetNode) throw new Error('Target node not found');

  if (position === 'into') {
    const children = allNodes
      .filter(n => n.parentId === targetId)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    
    const lastChild = children[children.length - 1];
    return {
      parentId: targetId,
      sortKey: generateMidpoint(lastChild?.sortKey || null, null)
    };
  }

  const siblings = allNodes
    .filter(n => n.parentId === targetNode.parentId)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  
  const targetIndex = siblings.findIndex(n => n.id === targetId);

  if (position === 'before') {
    const prevNode = siblings[targetIndex - 1];
    return {
      parentId: targetNode.parentId,
      sortKey: generateMidpoint(prevNode?.sortKey || null, targetNode.sortKey)
    };
  } else {
    const nextNode = siblings[targetIndex + 1];
    return {
      parentId: targetNode.parentId,
      sortKey: generateMidpoint(targetNode.sortKey, nextNode?.sortKey || null)
    };
  }
}
