import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { computeFootnotePopoverStyle } from './footnotePositioning';

const decodeHtml = (value: string) => {
  if (typeof document === 'undefined') return value;
  const element = document.createElement('textarea');
  let text = value;
  for (let i = 0; i < 3; i += 1) {
    element.innerHTML = text;
    const decoded = element.value;
    if (decoded === text) break;
    text = decoded;
  }
  return text;
};

const cleanFootnoteDisplayText = (value: string) => {
  let text = decodeHtml(value || '');
  for (let i = 0; i < 3; i += 1) {
    const next = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/?[^>]+>/g, ' ');
    if (next === text) break;
    text = next;
  }
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export function FootnoteComponent({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [content, setContent] = useState(node.attrs.content || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    setContent(node.attrs.content || '');
  }, [node.attrs.content]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const updatePopoverPosition = (editing = isEditing) => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return false;

    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const viewportOffsetLeft = window.visualViewport?.offsetLeft ?? 0;
    const viewportOffsetTop = window.visualViewport?.offsetTop ?? 0;
    setPopoverStyle(computeFootnotePopoverStyle({
      triggerRect: trigger.getBoundingClientRect(),
      viewportWidth,
      viewportHeight,
      viewportOffsetLeft,
      viewportOffsetTop,
      editing,
    }));

    return true;
  };

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    const shouldShowPopover = (isHovering && !isEditing) || isEditing;
    if (!shouldShowPopover || !trigger || !popover) return;

    let isActive = true;
    const update = () => {
      void computePosition(trigger, popover, {
        strategy: 'fixed',
        placement: isEditing ? 'bottom' : 'top',
        middleware: [
          offset(10),
          flip({ padding: 12 }),
          shift({ padding: 12 }),
        ],
      }).then(({ x, y }) => {
        if (!isActive) return;
        setPopoverStyle((current) => current
          ? { ...current, left: Math.round(x), top: Math.round(y) }
          : current);
      });
    };

    const cleanup = autoUpdate(trigger, popover, update);
    update();
    return () => {
      isActive = false;
      cleanup();
    };
  }, [isEditing, isHovering, popoverStyle?.width]);

  const handleSave = () => {
    updateAttributes({ content });
    setIsEditing(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updatePopoverPosition(true);
    setIsEditing(true);
    setIsHovering(false);
  };

  const displayedContent = cleanFootnoteDisplayText(node.attrs.content || '');
  const popover = (
    <AnimatePresence>
      {isHovering && !isEditing && popoverStyle && (
        <motion.span
          ref={popoverRef}
          initial={{ opacity: 0, y: 5, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 5, scale: 0.98 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={popoverStyle}
          className="p-3 bg-white/90 backdrop-blur-md border border-stone-200/50 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] pointer-events-none"
          contentEditable={false}
        >
          <span className="block max-h-[240px] overflow-y-auto text-[13px] text-stone-700 leading-relaxed font-normal whitespace-pre-wrap break-words">
            {displayedContent || <span className="text-stone-400 italic">空注脚内容</span>}
          </span>
        </motion.span>
      )}

      {isEditing && popoverStyle && (
        <motion.span
          ref={popoverRef}
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          style={popoverStyle}
          className="p-4 bg-white border border-stone-200 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex flex-col gap-3 ring-1 ring-black/5"
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
            className="w-full bg-stone-50 border border-stone-100 rounded-xl p-3 text-[13px] text-stone-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500/50 min-h-[100px] resize-none transition-all placeholder:text-stone-300"
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
        </motion.span>
      )}
    </AnimatePresence>
  );

  return (
    <NodeViewWrapper
      as="span"
      className={`footnote-wrapper relative inline-flex items-baseline ${selected ? 'ring-2 ring-blue-400/20 rounded-sm' : ''}`}
      onMouseEnter={() => {
        if (!isEditing && updatePopoverPosition(false)) {
          setIsHovering(true);
        }
      }}
      onMouseLeave={() => {
        setIsHovering(false);
        if (!isEditing) {
          setPopoverStyle(null);
        }
      }}
    >
      <span
        ref={triggerRef}
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

      {typeof document !== 'undefined' ? createPortal(popover, document.body) : null}
    </NodeViewWrapper>
  );
}
