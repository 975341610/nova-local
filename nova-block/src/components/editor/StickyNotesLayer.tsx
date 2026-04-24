import { useState, useRef, useCallback, useEffect, useLayoutEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { GripVertical, Palette, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StickyNoteData } from '../../lib/types';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { sanitizeLegacyApiUrlsInHtml } from '../../lib/api';

const MACARON_COLORS = [
  { label: '阳光黄', value: 'rgba(254, 240, 138, 1)' },
  { label: '阳光黄(半透)', value: 'rgba(254, 240, 138, 0.6)' },
  { label: '樱花粉', value: 'rgba(251, 207, 232, 1)' },
  { label: '樱花粉(半透)', value: 'rgba(251, 207, 232, 0.6)' },
  { label: '薄荷绿', value: 'rgba(187, 247, 208, 1)' },
  { label: '薄荷绿(半透)', value: 'rgba(187, 247, 208, 0.6)' },
  { label: '海盐蓝', value: 'rgba(191, 219, 254, 1)' },
  { label: '海盐蓝(半透)', value: 'rgba(191, 219, 254, 0.6)' },
  { label: '香芋紫', value: 'rgba(233, 213, 255, 1)' },
  { label: '香芋紫(半透)', value: 'rgba(233, 213, 255, 0.6)' },
  { label: '蜜桃橙', value: 'rgba(254, 215, 170, 1)' },
  { label: '蜜桃橙(半透)', value: 'rgba(254, 215, 170, 0.6)' },
];

const DEFAULT_NOTE_WIDTH = 260;
const DEFAULT_NOTE_HEIGHT = 220;

type LayerBounds = {
  width: number;
  height: number;
};

type ItemSize = {
  width: number;
  height: number;
};

export function clampStickyNotePosition(
  x: number,
  y: number,
  bounds: LayerBounds,
  itemSize: ItemSize,
) {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x, y };
  }

  const maxX = Math.max(0, bounds.width - itemSize.width);
  const maxY = Math.max(0, bounds.height - itemSize.height);

  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}

export function StickyNoteItem({
  note,
  bounds,
  updateNote,
  removeNote,
}: {
  note: StickyNoteData,
  bounds: LayerBounds,
  updateNote: (id: string, data: Partial<StickyNoteData>) => void,
  removeNote: (id: string) => void
}) {
  const [showPalette, setShowPalette] = useState(false);
  const [localPosition, setLocalPosition] = useState({ x: note.x, y: note.y });
  const localPositionRef = useRef(localPosition);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const latestContentRef = useRef(sanitizeLegacyApiUrlsInHtml(note.content) || '<p></p>');
  const latestUpdateNoteRef = useRef(updateNote);
  const latestNoteIdRef = useRef(note.id);
  const contentUpdateTimerRef = useRef<number | null>(null);
  const noteElementRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const pendingComposedHtmlRef = useRef<string | null>(null);

  useEffect(() => {
    latestUpdateNoteRef.current = updateNote;
  }, [updateNote]);

  useEffect(() => {
    latestNoteIdRef.current = note.id;
  }, [note.id]);

  useEffect(() => {
    localPositionRef.current = localPosition;
  }, [localPosition]);

  const getItemSize = useCallback((): ItemSize => {
    const width = noteElementRef.current?.offsetWidth || DEFAULT_NOTE_WIDTH;
    const height = noteElementRef.current?.offsetHeight || DEFAULT_NOTE_HEIGHT;
    return { width, height };
  }, []);

  const clampToBounds = useCallback((x: number, y: number) => {
    return clampStickyNotePosition(x, y, bounds, getItemSize());
  }, [bounds, getItemSize]);

  const queueContentUpdate = useCallback((html: string) => {
    if (contentUpdateTimerRef.current !== null) {
      window.clearTimeout(contentUpdateTimerRef.current);
    }
    contentUpdateTimerRef.current = window.setTimeout(() => {
      latestUpdateNoteRef.current(latestNoteIdRef.current, { content: html });
      contentUpdateTimerRef.current = null;
    }, 120);
  }, []);

  const flushComposedHtml = useCallback(() => {
    if (isComposingRef.current) {
      return;
    }
    const pendingHtml = pendingComposedHtmlRef.current;
    if (!pendingHtml || pendingHtml === latestContentRef.current) {
      return;
    }
    pendingComposedHtmlRef.current = null;
    latestContentRef.current = pendingHtml;
    queueContentUpdate(pendingHtml);
  }, [queueContentUpdate]);

  useEffect(() => {
    if (dragRef.current) {
      return;
    }
    const clamped = clampToBounds(note.x, note.y);
    setLocalPosition(clamped);
    if (clamped.x !== note.x || clamped.y !== note.y) {
      latestUpdateNoteRef.current(latestNoteIdRef.current, clamped);
    }
  }, [clampToBounds, note.x, note.y]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: latestContentRef.current,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (html === latestContentRef.current) {
        return;
      }
      if (isComposingRef.current) {
        pendingComposedHtmlRef.current = html;
        return;
      }
      latestContentRef.current = html;
      queueContentUpdate(html);
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[100px] font-handwriting',
      },
      handleDOMEvents: {
        keydown: (_view, event) => {
          event.stopPropagation();
          return false;
        },
        keyup: (_view, event) => {
          event.stopPropagation();
          return false;
        },
        keypress: (_view, event) => {
          event.stopPropagation();
          return false;
        },
        beforeinput: (_view, event) => {
          event.stopPropagation();
          return false;
        },
        input: (_view, event) => {
          event.stopPropagation();
          return false;
        },
        mousedown: (_view, event) => {
          event.stopPropagation();
          return false;
        },
        wheel: (_view, event) => {
          event.stopPropagation();
          return false;
        },
        compositionstart: (_view, event) => {
          event.stopPropagation();
          isComposingRef.current = true;
          return false;
        },
        compositionend: (_view, event) => {
          event.stopPropagation();
          isComposingRef.current = false;
          window.setTimeout(() => {
            flushComposedHtml();
          }, 0);
          return false;
        },
        blur: (_view) => {
          window.setTimeout(() => {
            flushComposedHtml();
          }, 0);
          return false;
        },
      },
      handleScrollToSelection: (view) => {
        const dom = view.dom as HTMLElement | null;
        const container = dom?.closest('[data-sticky-editor-scroll="true"]') as HTMLElement | null;
        if (!dom || !container) {
          return true;
        }

        const root = view.root as Document | ShadowRoot;
        const selection = (
          root instanceof Document
            ? root.getSelection()
            : root.ownerDocument?.getSelection()
        ) || window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          return true;
        }

        const rect = selection.getRangeAt(0).getBoundingClientRect();
        if (!rect || (rect.top === 0 && rect.bottom === 0)) {
          return true;
        }

        const containerRect = container.getBoundingClientRect();
        const margin = 12;
        if (rect.bottom > containerRect.bottom - margin) {
          container.scrollTop += rect.bottom - (containerRect.bottom - margin);
        } else if (rect.top < containerRect.top + margin) {
          container.scrollTop -= (containerRect.top + margin) - rect.top;
        }

        // Prevent default ProseMirror behavior from scrolling the parent editor area.
        return true;
      },
    },
  });

  useEffect(() => {
    return () => {
      if (contentUpdateTimerRef.current !== null) {
        window.clearTimeout(contentUpdateTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    const normalized = sanitizeLegacyApiUrlsInHtml(note.content) || '<p></p>';
    if (normalized === latestContentRef.current) {
      return;
    }

    if (isComposingRef.current || editor.isFocused) {
      return;
    }

    latestContentRef.current = normalized;
    if (editor.getHTML() !== normalized) {
      editor.commands.setContent(normalized, { emitUpdate: false });
    }
  }, [editor, note.content]);

  useLayoutEffect(() => {
    if (dragRef.current) {
      return;
    }

    const current = localPositionRef.current;
    const clamped = clampToBounds(current.x, current.y);
    if (clamped.x === current.x && clamped.y === current.y) {
      return;
    }

    setLocalPosition(clamped);
    latestUpdateNoteRef.current(latestNoteIdRef.current, clamped);
  }, [bounds.height, bounds.width, clampToBounds]);

  const handleMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: localPositionRef.current.x,
      initialY: localPositionRef.current.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = moveEvent.clientX - dragRef.current.startX;
      const dy = moveEvent.clientY - dragRef.current.startY;
      const clamped = clampToBounds(
        dragRef.current.initialX + dx,
        dragRef.current.initialY + dy,
      );
      setLocalPosition(clamped);
    };

    const handleMouseUp = () => {
      if (dragRef.current) {
        const finalX = localPositionRef.current.x;
        const finalY = localPositionRef.current.y;
        if (finalX !== note.x || finalY !== note.y) {
          updateNote(note.id, { x: finalX, y: finalY });
        }
      }
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className="absolute z-40 group/sticky"
      ref={noteElementRef}
      style={{
        left: `${localPosition.x}px`,
        top: `${localPosition.y}px`,
        transform: `rotate(${note.rotation || 0}deg)`,
        width: '260px',
      }}
    >
      <div
        className="p-5 shadow-lg hover:shadow-xl rounded-sm transition-shadow backdrop-blur-md border border-black/5"
        style={{ backgroundColor: note.color || 'rgba(254, 240, 138, 1)' }}
      >
        <div className="absolute top-1 right-1 flex items-center opacity-0 group-hover/sticky:opacity-100 transition-opacity duration-300 z-20">
          <button
            onClick={() => removeNote(note.id)}
            className="p-1.5 text-black/30 hover:text-red-500 hover:bg-black/5 rounded-md cursor-pointer transition-colors"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setShowPalette(!showPalette)}
            className="p-1.5 text-black/30 hover:text-black/60 hover:bg-black/5 rounded-md cursor-pointer transition-colors"
            title="改变颜色"
          >
            <Palette size={14} />
          </button>
          <div
            className="drag-handle p-1.5 text-black/30 hover:text-black/60 hover:bg-black/5 rounded-md cursor-grab active:cursor-grabbing transition-colors"
            onMouseDown={handleMouseDown}
            title="拖拽移动"
          >
            <GripVertical size={14} />
          </div>
        </div>

        <AnimatePresence>
          {showPalette && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -5 }}
              className="absolute top-8 right-2 w-[120px] bg-white/95 backdrop-blur-xl border border-stone-200/50 shadow-lg rounded-xl p-2 z-30 grid grid-cols-2 gap-1.5"
            >
              {MACARON_COLORS.map((c, i) => (
                <button
                  key={i}
                  onClick={() => {
                    updateNote(note.id, { color: c.value });
                    setShowPalette(false);
                  }}
                  className={`w-full h-6 rounded-md shadow-sm border border-black/5 hover:scale-105 transition-all ${note.color === c.value ? 'ring-2 ring-blue-400' : ''}`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-7 bg-white/40 backdrop-blur-sm rotate-2 shadow-sm pointer-events-none" />

        <div
          data-sticky-editor-scroll="true"
          className="prose prose-sm focus:outline-none min-h-[100px] max-h-[260px] overflow-y-auto custom-scrollbar pr-1 mt-3 text-stone-800 [overscroll-behavior:contain] [overflow-anchor:none]"
          onWheelCapture={(event) => event.stopPropagation()}
          onMouseDownCapture={(event) => event.stopPropagation()}
          onKeyDownCapture={(event) => event.stopPropagation()}
          onKeyUpCapture={(event) => event.stopPropagation()}
          style={{
            fontFamily: "'Caveat', 'Kalam', 'Shadows Into Light', 'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', 'KaiTi', 'STKaiti', cursive",
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

export function StickyNotesLayer({
  notes,
  onChange,
}: {
  notes: StickyNoteData[],
  onChange: (notes: StickyNoteData[]) => void
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [bounds, setBounds] = useState<LayerBounds>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) {
      return;
    }

    const updateBounds = () => {
      const nextWidth = layer.clientWidth;
      const nextHeight = layer.clientHeight;
      setBounds((prev) => (
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      ));
    };

    updateBounds();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateBounds);
      return () => window.removeEventListener('resize', updateBounds);
    }

    const observer = new ResizeObserver(updateBounds);
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  const updateNote = useCallback((id: string, data: Partial<StickyNoteData>) => {
    let changed = false;
    const nextNotes = notes.map((n) => {
      if (n.id !== id) {
        return n;
      }
      const merged = { ...n, ...data };
      const isSame =
        merged.x === n.x
        && merged.y === n.y
        && merged.color === n.color
        && merged.rotation === n.rotation
        && merged.content === n.content;
      if (isSame) {
        return n;
      }
      changed = true;
      return merged;
    });

    if (changed) {
      onChange(nextNotes);
    }
  }, [notes, onChange]);

  const removeNote = useCallback((id: string) => {
    const nextNotes = notes.filter((n) => n.id !== id);
    if (nextNotes.length !== notes.length) {
      onChange(nextNotes);
    }
  }, [notes, onChange]);

  return (
    <div ref={layerRef} className="absolute inset-0 pointer-events-none z-40 overflow-visible [overflow-anchor:none]">
      {notes.map(note => (
        <div key={note.id} className="pointer-events-auto absolute" style={{ width: 0, height: 0 }}>
          <StickyNoteItem
            note={note}
            bounds={bounds}
            updateNote={updateNote}
            removeNote={removeNote}
          />
        </div>
      ))}
    </div>
  );
}
