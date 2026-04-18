import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal } from 'lucide-react';
import type { TreeNode } from '../../lib/novablock/treeUtils';

interface TreeNodeItemProps {
  node: TreeNode;
  level: number;
  onMove: (nodeId: string, targetId: string, position: 'before' | 'after' | 'into') => void;
  onSelect: (nodeId: string) => void;
  selectedId?: string;
  onContextMenu?: (e: React.MouseEvent, node: TreeNode) => void;
  editingId?: string | null;
  onRenameSubmit?: (nodeId: string, newTitle: string) => void;
}

export const TreeNodeItem = ({
  node,
  level,
  onMove,
  onSelect,
  selectedId,
  onContextMenu,
  editingId,
  onRenameSubmit,
}: TreeNodeItemProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [dragOver, setDragOver] = useState<'before' | 'after' | 'into' | null>(null);
  const [editValue, setEditValue] = useState(node.title || '');

  const isEditing = editingId === node.id;

  React.useEffect(() => {
    if (isEditing) {
      setEditValue(node.title || '');
    }
  }, [isEditing, node.title]);

  const hasChildren = node.children && node.children.length > 0;
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
      <motion.div
        layout
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
        onClick={() => {
          if (isEditing) return;
          if (node.isFolder) {
            setIsOpen(!isOpen);
          } else {
            onSelect(node.id);
          }
        }}
        className={`
          group flex items-center gap-2 py-2 px-3 rounded-xl cursor-pointer transition-all duration-300 ease-out
          ${isSelected && !node.isFolder ? 'bg-primary/15 text-primary shadow-sm shadow-primary/5' : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'}
          ${dragOver === 'into' ? 'bg-primary/20 ring-1 ring-primary/30' : ''}
        `}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
      >
        <div 
          onClick={(e) => {
            e.stopPropagation();
            if (!isEditing) setIsOpen(!isOpen);
          }}
          className={`
            p-1 rounded-lg transition-colors
            ${node.isFolder || hasChildren ? 'hover:bg-accent' : 'opacity-0 pointer-events-none'}
          `}
        >
          <ChevronRight 
            size={14} 
            className={`transition-transform duration-300 ${isOpen ? 'rotate-90' : ''} ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} 
          />
        </div>

        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {node.isFolder ? (
            isOpen ? <FolderOpen size={16} className={`shrink-0 ${isSelected ? 'text-primary' : 'text-primary/70'}`} /> : <Folder size={16} className={`shrink-0 ${isSelected ? 'text-primary' : 'text-primary/70'}`} />
          ) : (
            <FileText size={16} className={`shrink-0 ${isSelected ? 'text-primary/80' : 'text-muted-foreground/60'}`} />
          )}
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
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu?.(e, node);
              }}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        )}
      </motion.div>

      {/* Drop Indicators */}
      {dragOver === 'before' && (
        <div className="absolute top-0 left-3 right-3 h-0.5 bg-primary rounded-full z-10 shadow-sm shadow-primary/50" />
      )}
      {dragOver === 'after' && (
        <div className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full z-10 shadow-sm shadow-primary/50" />
      )}

      {/* Children */}
      <AnimatePresence initial={false}>
        {isOpen && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {node.children!.map((child) => (
              <TreeNodeItem
                key={child.id}
                node={child}
                level={level + 1}
                onMove={onMove}
                onSelect={onSelect}
                selectedId={selectedId}
                onContextMenu={onContextMenu}
                editingId={editingId}
                onRenameSubmit={onRenameSubmit}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
