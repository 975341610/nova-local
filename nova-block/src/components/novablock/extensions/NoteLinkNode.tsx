import React, { useEffect, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

export const NoteLinkNode: React.FC<NodeViewProps> = ({ node, selected }) => {
  const { id, label } = node.attrs;
  const [realLabel, setRealLabel] = useState(label || '未命名笔记');

  useEffect(() => {
    const updateLabel = () => {
      if (typeof window !== 'undefined' && (window as any).novaNotes) {
        const targetNote = (window as any).novaNotes.find((n: any) => String(n.id) === String(id));
        if (targetNote && targetNote.title) {
          setRealLabel(targetNote.title);
          return;
        }
      }
      setRealLabel(label || '未命名笔记');
    };
    
    updateLabel();
    window.addEventListener('nova-notes-updated', updateLabel);
    return () => {
      window.removeEventListener('nova-notes-updated', updateLabel);
    };
  }, [id, label]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (id) {
      // 通过自定义事件解耦跳转逻辑
      // 外部 App (无论在 nova-block 预览还是在主应用 frontend) 监听此事件即可执行切换
      window.dispatchEvent(new CustomEvent('nova-select-note', { 
        detail: { noteId: id } 
      }));
    }
  };

  return (
    <NodeViewWrapper className="note-link-node-wrapper" style={{ display: 'inline' }}>
      <span
        className={`note-link-capsule ${selected ? 'selected' : ''}`}
        onClick={handleClick}
        title={`点击跳转至: ${realLabel}`}
      >
        <span style={{ marginRight: '4px' }}>📝</span>
        {realLabel}
      </span>
    </NodeViewWrapper>
  );
};
