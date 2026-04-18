import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useState, useEffect, useRef } from 'react';
import { Trash2, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function FootnoteComponent({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [content, setContent] = useState(node.attrs.content || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync content from node attributes
  useEffect(() => {
    setContent(node.attrs.content || '');
  }, [node.attrs.content]);

  // Focus textarea when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    updateAttributes({ content });
    setIsEditing(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditing(true);
    setIsHovering(false);
  };

  return (
    <NodeViewWrapper 
      as="span" 
      className={`footnote-wrapper relative inline-flex items-baseline ${selected ? 'ring-2 ring-blue-400/20 rounded-sm' : ''}`}
      onMouseEnter={() => !isEditing && setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* 注脚序号显示 */}
      <span 
        className={`footnote-trigger select-none cursor-pointer transition-all duration-200 
          text-[11px] font-bold leading-none px-1 py-0.5 rounded-md mx-0.5 align-top
          ${isHovering || isEditing 
            ? 'bg-blue-600 text-white shadow-sm scale-110' 
            : 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700'
          }`}
        onDoubleClick={handleDoubleClick}
        contentEditable={false}
      >
        {node.attrs.index}
      </span>

      <AnimatePresence>
        {/* View Mode: Hover Tooltip */}
        {isHovering && !isEditing && (
          <motion.span
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-[110] bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 
              bg-white/90 backdrop-blur-md border border-stone-200/50 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] 
              min-w-[200px] max-w-[320px] pointer-events-none"
            contentEditable={false}
          >
            <span className="block text-[13px] text-stone-700 leading-relaxed font-normal whitespace-pre-wrap">
              {node.attrs.content || <span className="text-stone-400 italic">空注脚内容（双击编辑）</span>}
            </span>
            {/* Tooltip Arrow */}
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-white/90 block" />
          </motion.span>
        )}

        {/* Edit Mode: Popover */}
        {isEditing && (
          <motion.span 
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="absolute z-[120] top-full left-0 mt-2 min-w-[280px] p-4 
              bg-white border border-stone-200 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] 
              flex flex-col gap-3 ring-1 ring-black/5"
            contentEditable={false}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">编辑注脚 #{node.attrs.index}</span>
              <button 
                onClick={() => deleteNode()}
                className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="删除注脚"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <textarea
              ref={textareaRef}
              className="w-full bg-stone-50 border border-stone-100 rounded-xl p-3 text-[13px] text-stone-800 
                focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500/50
                min-h-[100px] resize-none transition-all placeholder:text-stone-300"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSave();
                }
                if (e.key === 'Escape') {
                  setIsEditing(false);
                }
              }}
              placeholder="输入注脚内容... (Cmd+Enter 保存)"
              onMouseDown={(e) => e.stopPropagation()}
            />

            <div className="flex justify-end gap-2 pt-1">
              <button 
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-stone-500 hover:bg-stone-100 rounded-lg transition-all"
              >
                <X size={14} /> 取消
              </button>
              <button 
                onClick={handleSave}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-[0_2px_10px_rgba(37,99,235,0.3)] transition-all active:scale-95"
              >
                <Check size={14} /> 保存
              </button>
            </div>
            
            {/* Popover Arrow */}
            <span className="absolute bottom-full left-4 border-[6px] border-transparent border-b-white block" />
          </motion.span>
        )}
      </AnimatePresence>
    </NodeViewWrapper>
  );
}
