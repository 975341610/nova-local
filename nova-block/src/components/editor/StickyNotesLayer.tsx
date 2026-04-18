import { useState, useRef } from 'react';
import { GripVertical, Palette, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StickyNoteData } from '../../lib/types';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

const MACARON_COLORS = [
  { label: '阳光黄', value: 'rgba(254, 240, 138, 1)' },
  { label: '阳光黄 (透)', value: 'rgba(254, 240, 138, 0.6)' },
  { label: '樱花粉', value: 'rgba(251, 207, 232, 1)' },
  { label: '樱花粉 (透)', value: 'rgba(251, 207, 232, 0.6)' },
  { label: '薄荷绿', value: 'rgba(187, 247, 208, 1)' },
  { label: '薄荷绿 (透)', value: 'rgba(187, 247, 208, 0.6)' },
  { label: '海冻蓝', value: 'rgba(191, 219, 254, 1)' },
  { label: '海冻蓝 (透)', value: 'rgba(191, 219, 254, 0.6)' },
  { label: '香芋紫', value: 'rgba(233, 213, 255, 1)' },
  { label: '香芋紫 (透)', value: 'rgba(233, 213, 255, 0.6)' },
  { label: '蜜桃橘', value: 'rgba(254, 215, 170, 1)' },
  { label: '蜜桃橘 (透)', value: 'rgba(254, 215, 170, 0.6)' },
];

export function StickyNoteItem({ 
  note, 
  updateNote, 
  removeNote 
}: { 
  note: StickyNoteData, 
  updateNote: (id: string, data: Partial<StickyNoteData>) => void,
  removeNote: (id: string) => void
}) {
  const [showPalette, setShowPalette] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: note.content || '<p></p>',
    onUpdate: ({ editor }) => {
      updateNote(note.id, { content: editor.getHTML() });
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[100px] font-handwriting',
      },
    },
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: note.x,
      initialY: note.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = moveEvent.clientX - dragRef.current.startX;
      const dy = moveEvent.clientY - dragRef.current.startY;
      
      updateNote(note.id, {
        x: dragRef.current.initialX + dx,
        y: dragRef.current.initialY + dy,
      });
    };

    const handleMouseUp = () => {
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
      style={{
        left: `${note.x}px`,
        top: `${note.y}px`,
        transform: `rotate(${note.rotation || 0}deg)`,
        width: '260px',
      }}
    >
      <div 
        className="p-5 shadow-lg hover:shadow-xl rounded-sm transition-shadow backdrop-blur-md border border-black/5"
        style={{ backgroundColor: note.color || 'rgba(254, 240, 138, 1)' }}
      >
        {/* 顶部控制栏 */}
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

        {/* 调色板 */}
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

        {/* 装饰性胶带效果 */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-7 bg-white/40 backdrop-blur-sm rotate-2 shadow-sm pointer-events-none" />
        
        {/* 内容编辑器 */}
        <div 
          className="prose prose-sm focus:outline-none min-h-[100px] max-h-[260px] overflow-y-auto custom-scrollbar pr-1 mt-3 text-stone-800"
          style={{ 
            fontFamily: "'Caveat', 'Kalam', 'Shadows Into Light', 'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', 'KaiTi', 'STKaiti', cursive" 
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
  onChange 
}: { 
  notes: StickyNoteData[], 
  onChange: (notes: StickyNoteData[]) => void 
}) {
  const updateNote = (id: string, data: Partial<StickyNoteData>) => {
    onChange(notes.map(n => n.id === id ? { ...n, ...data } : n));
  };

  const removeNote = (id: string) => {
    onChange(notes.filter(n => n.id !== id));
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-40 overflow-visible">
      {notes.map(note => (
        <div key={note.id} className="pointer-events-auto absolute" style={{ width: 0, height: 0 }}>
          <StickyNoteItem 
            note={note} 
            updateNote={updateNote} 
            removeNote={removeNote} 
          />
        </div>
      ))}
    </div>
  );
}
