import React, { useState } from 'react';
import { ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal } from 'lucide-react';
import type { TreeNode, FlattenedNode } from '../../lib/novablock/treeUtils';

interface TreeNodeItemProps {
  node: FlattenedNode;
  onMove: (nodeId: string, targetId: string, position: 'before' | 'after' | 'into') => void;
  onSelect: (nodeId: string) => void;
  onToggle: (nodeId: string) => void;
  selectedId?: string;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode) => void;
  editingId?: string | null;
  onRenameSubmit?: (nodeId: string, newTitle: string) => void;
  /** F2b · 多选标记 (data-multi-selected) */
  isMultiSelected?: boolean;
  /** F2b · 父级接管 click (含 Ctrl/Cmd/Shift 判定),返回 true 表示已被父级处理 */
  onItemClick?: (e: React.MouseEvent, node: TreeNode) => boolean | void;
  /** Round 4 · Bug E: 在 mousedown 阶段处理 Ctrl/Cmd toggle,避免 draggable div 吞掉 click 事件 */
  onItemMouseDown?: (e: React.MouseEvent, node: TreeNode) => boolean | void;
}

export const TreeNodeItem = ({
  node,
  onMove,
  onSelect,
  onToggle,
  selectedId,
  onContextMenu,
  editingId,
  onRenameSubmit,
  isMultiSelected,
  onItemClick,
  onItemMouseDown,
}: TreeNodeItemProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [dragOver, setDragOver] = useState<'before' | 'after' | 'into' | null>(null);
  const [editValue, setEditValue] = useState(node.title || '');

  const isEditing = editingId === node.id;
  const isOpen = node.isExpanded;
  const level = node.level;
  const hasChildren = node.hasChildren;
  const isSelected = selectedId === node.id;

  const handleDragStart = (e: React.DragEvent | PointerEvent | TouchEvent | MouseEvent) => {
    if ('dataTransfer' in e && e.dataTransfer) {
      e.dataTransfer.setData('nodeId', node.id);
      // For Canvas Drag and Drop
      if (!node.isFolder) {
        e.dataTransfer.setData('application/x-nova-note-id', node.id);
        e.dataTransfer.effectAllowed = 'copyMove';
      }
    }
    e.stopPropagation();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    if (y < height * 0.25) {
      setDragOver('before');
    } else if (y > height * 0.75) {
      setDragOver('after');
    } else {
      setDragOver('into');
    }
  };

  const handleDragLeave = () => {
    setDragOver(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('nodeId');
    if (draggedId && draggedId !== node.id && dragOver) {
      onMove(draggedId, node.id, dragOver);
    }
    setDragOver(null);
  };

  return (
    <div className="relative select-none">
      <div
        draggable={!isEditing}
        onDragStart={handleDragStart as any}
        onDragOver={handleDragOver as any}
        onDragLeave={handleDragLeave as any}
        onDrop={handleDrop as any}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu?.(e, node);
        }}
        onMouseDown={(e) => {
          if (isEditing) return;
          // Round 4 · Bug E: Ctrl/Cmd+click 在 draggable div 上的 click 事件
          // 在某些 Chromium/Electron 版本会被吞掉(被解释为"准备拖动"的 noop click),
          // 这里在 mousedown 阶段就给父级一次处理机会(toggle 多选)。
          onItemMouseDown?.(e, node);
        }}
        onClick={(e) => {
          if (isEditing) return;
          // F2b: 父级接管 (Ctrl/Cmd/Shift 判定 / 多选清空) — 返回 true 表示父级已处理
          const handled = onItemClick?.(e, node);
          if (handled) return;
          if (node.isFolder) {
            onToggle(node.id);
          } else {
            onSelect(node.id);
          }
        }}
        data-testid={`qingzhi-tree-node-${node.id}`}
        data-tree-node-id={node.id}
        data-depth={level}
        data-selected={isSelected ? 'true' : 'false'}
        data-multi-selected={isMultiSelected ? 'true' : 'false'}
        data-folder={node.isFolder ? 'true' : 'false'}
        data-expanded={isOpen ? 'true' : 'false'}
        className={`
          qz-tree-node-item group flex items-center gap-2 py-2 px-3 rounded-xl cursor-pointer transition-colors duration-200
          ${isSelected && !node.isFolder ? 'bg-primary/15 text-primary shadow-sm shadow-primary/5' : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'}
          ${isMultiSelected ? 'bg-primary/10 ring-1 ring-primary/40' : ''}
          ${dragOver === 'into' ? 'bg-primary/20 ring-1 ring-primary/30' : ''}
        `}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
      >
        <div 
          onClick={(e) => {
            e.stopPropagation();
            if (!isEditing) onToggle(node.id);
          }}
          data-testid={`qingzhi-tree-node-disclosure-${node.id}`}
          className={`
            qz-tree-node-disclosure p-1 rounded-lg transition-colors
            ${node.isFolder || hasChildren ? 'hover:bg-accent' : 'opacity-0 pointer-events-none'}
          `}
        >
          <ChevronRight 
            size={14} 
            className={`transition-transform duration-300 ${isOpen ? 'rotate-90' : ''} ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} 
          />
        </div>

        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span data-testid={`qingzhi-tree-node-icon-${node.id}`} className="qz-tree-node-icon inline-flex shrink-0">
            {node.isFolder ? (
              isOpen ? <FolderOpen size={16} className={`shrink-0 ${isSelected ? 'text-primary' : 'text-primary/70'}`} /> : <Folder size={16} className={`shrink-0 ${isSelected ? 'text-primary' : 'text-primary/70'}`} />
            ) : (
              <FileText size={16} className={`shrink-0 ${isSelected ? 'text-primary/80' : 'text-muted-foreground/60'}`} />
            )}
          </span>
          {isEditing ? (
            <input
              autoFocus
              className="flex-1 bg-transparent border-none outline-none text-sm font-bold text-foreground w-full -ml-1 px-1 rounded-sm ring-1 ring-primary/50"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={() => onRenameSubmit?.(node.id, editValue)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onRenameSubmit?.(node.id, editValue);
                } else if (e.key === 'Escape') {
                  onRenameSubmit?.(node.id, node.title || '');
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              data-testid={`qingzhi-tree-node-title-${node.id}`}
              className={`truncate text-sm tracking-tight ${isSelected ? 'font-bold' : 'font-medium'}`}
              title={node.title || (node.isFolder ? '无标题文件夹' : '无标题笔记')}
            >
              {node.title || (node.isFolder ? '无标题文件夹' : '无标题笔记')}
            </span>
          )}
        </div>

        {!isEditing && (
          <div className={`transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
            <button
              data-testid={`qingzhi-tree-node-menu-${node.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu?.(e, node);
              }}
              className="qz-tree-node-menu p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Drop Indicators */}
      {dragOver === 'before' && (
        <div className="absolute top-0 left-3 right-3 h-0.5 bg-primary rounded-full z-10 shadow-sm shadow-primary/50" />
      )}
      {dragOver === 'after' && (
        <div className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full z-10 shadow-sm shadow-primary/50" />
      )}
    </div>
  );
};
