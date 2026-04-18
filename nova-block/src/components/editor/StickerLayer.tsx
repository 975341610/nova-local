import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GripVertical, Trash2, Maximize2, RotateCcw, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StickerData } from '../../lib/types';
import { getApiBase } from '../../lib/api';

interface StickerItemProps {
  sticker: StickerData;
  isEditable: boolean;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, data: Partial<StickerData>) => void;
  onRemove: (id: string) => void;
}

export const StickerItem: React.FC<StickerItemProps> = ({
  sticker,
  isEditable,
  isSelected,
  onSelect,
  onUpdate,
  onRemove
}) => {
  const [activeAction, setActiveAction] = useState<'move' | 'scale' | 'rotate' | 'opacity' | null>(null);
  
  // 使用局部 state 实时更新位置，避免 mousemove 期间频繁触发父组件重渲染
  const [localSticker, setLocalSticker] = useState<StickerData>(sticker);

  // 记录上一次同步进来的 sticker 数据，用于判断是否真的需要同步
  const lastSyncedStickerRef = useRef<string>(JSON.stringify(sticker));

  // 当外部 sticker 发生实质变化（比如来自其他人的同步）时同步 localSticker
  useEffect(() => {
    // 如果正在操作中，绝对不要被外部同步打断
    if (activeAction) return;

    const stickerStr = JSON.stringify(sticker);
    if (stickerStr !== lastSyncedStickerRef.current) {
      setLocalSticker(sticker);
      lastSyncedStickerRef.current = stickerStr;
    }
  }, [sticker, activeAction]);
  
  const dragRef = useRef<{ 
    startX: number; 
    startY: number; 
    initialX: number; 
    initialY: number;
    initialScale: number;
    initialRotation: number;
    initialOpacity: number;
    // 追踪当前计算出的最新值，避免 handleMouseUp 闭包陷阱
    currentX: number;
    currentY: number;
    currentScale: number;
    currentRotation: number;
    currentOpacity: number;
  } | null>(null);

  // 使用 transform 替代 left/top，减少重排，并使用 localSticker 以获得极速响应
  const transform = `translate3d(${localSticker.x}px, ${localSticker.y}px, 0) rotate(${localSticker.rotation || 0}deg) scale(${localSticker.scale || 1})`;

  const handleMouseDown = (e: React.MouseEvent, action: 'move' | 'scale' | 'rotate' | 'opacity') => {
    if (!isEditable) return;
    e.preventDefault();
    e.stopPropagation();

    const initialX = localSticker.x;
    const initialY = localSticker.y;
    const initialScale = localSticker.scale || 1;
    const initialRotation = localSticker.rotation || 0;
    const initialOpacity = localSticker.opacity !== undefined ? localSticker.opacity : 1;

    setActiveAction(action);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX,
      initialY,
      initialScale,
      initialRotation,
      initialOpacity,
      currentX: initialX,
      currentY: initialY,
      currentScale: initialScale,
      currentRotation: initialRotation,
      currentOpacity: initialOpacity,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentDrag = dragRef.current;
      if (!currentDrag) return;
      const dx = moveEvent.clientX - currentDrag.startX;
      const dy = moveEvent.clientY - currentDrag.startY;

      setLocalSticker(prev => {
        const next = { ...prev };
        if (action === 'move') {
          next.x = currentDrag.initialX + dx;
          next.y = currentDrag.initialY + dy;
        } else if (action === 'scale') {
          const factor = 1 + dx / 200;
          next.scale = Math.max(0.1, Math.min(5, currentDrag.initialScale * factor));
        } else if (action === 'rotate') {
          next.rotation = currentDrag.initialRotation + dx;
        } else if (action === 'opacity') {
          const factor = dx / 100;
          next.opacity = Math.max(0.1, Math.min(1, currentDrag.initialOpacity + factor));
        }
        
        // 同步到 ref，确保 handleMouseUp 能拿到最新值
        currentDrag.currentX = next.x;
        currentDrag.currentY = next.y;
        currentDrag.currentScale = next.scale;
        currentDrag.currentRotation = next.rotation;
        currentDrag.currentOpacity = next.opacity;
        
        return next;
      });
    };

    const handleMouseUp = () => {
      const currentDrag = dragRef.current;
      if (currentDrag) {
        // ✅ 修正：直接从 Ref 读取最新计算的值，不依赖被闭包捕获的 localSticker state
        const updates = {
          x: currentDrag.currentX,
          y: currentDrag.currentY,
          scale: currentDrag.currentScale,
          rotation: currentDrag.currentRotation,
          opacity: currentDrag.currentOpacity
        };
        
        // 在上报更新前，先把我们已经知道的“最新状态”通过 ref 记录
        // 这样在 activeAction 变为 null 的下一轮渲染，由于我们的 sticker 是旧的，
        // 但我们要确保不要被旧数据同步回来。
        // 但更好的做法是：在外部数据还没变更回来之前，如果我们刚刚做完操作，
        // 既然 activeAction 已经 null，useEffect 就会运行。
        // 所以我们更新 lastSyncedStickerRef 为最新的预期状态。
        lastSyncedStickerRef.current = JSON.stringify({ ...sticker, ...updates });
        
        onUpdate(sticker.id, updates);
      }
      dragRef.current = null;
      setActiveAction(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseup', handleMouseUp);
  };

  const imageUrl = sticker.url.startsWith('http') || sticker.url.startsWith('data:') 
    ? sticker.url 
    : sticker.url.startsWith('/') 
      ? `${getApiBase()}${sticker.url.replace('/api', '')}`
      : `${getApiBase()}/${sticker.url}`;

  return (
    <motion.div
      className="absolute top-0 left-0 will-change-transform"
      style={{
        transform,
        zIndex: (isSelected && isEditable) || activeAction ? 100 : 30,
        pointerEvents: isEditable ? 'auto' : 'none',
      }}
      onClick={(e) => {
        if (isEditable) {
          e.stopPropagation();
          onSelect(sticker.id);
        }
      }}
    >
      <div
        className={`relative transition-shadow duration-300 ${isEditable && isSelected ? 'ring-2 ring-blue-400/50 rounded-lg shadow-2xl bg-white/5 backdrop-blur-sm' : ''}`}
      >
        <img 
          src={imageUrl} 
          alt="sticker" 
          className="max-w-[200px] h-auto select-none pointer-events-none"
          loading="lazy"
          draggable={false}
          style={{
            // 确保渲染性能
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            opacity: localSticker.opacity !== undefined ? localSticker.opacity : 1,
          }}
        />

        {/* 仅在编辑模式且选中时显示的控制手柄 */}
        <AnimatePresence>
          {isEditable && isSelected && !activeAction && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/95 backdrop-blur-xl p-1.5 rounded-2xl shadow-soft border border-stone-200/50 z-[60]"
            >
              <div
                onMouseDown={(e) => handleMouseDown(e, 'move')}
                className="p-2 hover:bg-stone-100 rounded-xl cursor-move text-stone-500 transition-colors"
                title="移动"
              >
                <GripVertical size={14} />
              </div>
              <div
                onMouseDown={(e) => handleMouseDown(e, 'scale')}
                className="p-2 hover:bg-stone-100 rounded-xl cursor-nwse-resize text-stone-500 transition-colors"
                title="缩放"
              >
                <Maximize2 size={14} />
              </div>
              <div
                onMouseDown={(e) => handleMouseDown(e, 'rotate')}
                className="p-2 hover:bg-stone-100 rounded-xl cursor-alias text-stone-500 transition-colors"
                title="旋转"
              >
                <RotateCcw size={14} />
              </div>
              <div
                onMouseDown={(e) => handleMouseDown(e, 'opacity')}
                className="p-2 hover:bg-stone-100 rounded-xl cursor-ew-resize text-stone-500 transition-colors"
                title="透明度"
              >
                <Layers size={14} />
              </div>
              <div className="w-px h-4 bg-stone-200/50 mx-1" />
              <button
                onClick={() => onRemove(sticker.id)}
                className="p-2 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-xl transition-colors"
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export const StickerLayer: React.FC<{
  stickers: StickerData[];
  isEditable: boolean;
  onChange: (stickers: StickerData[]) => void;
}> = ({ stickers, isEditable, onChange }) => {
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);

  // 点击空白处取消选中
  useEffect(() => {
    if (!isEditable) {
      setSelectedStickerId(null);
      return;
    }

    const handleClickOutside = () => setSelectedStickerId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [isEditable]);

  // 使用 useCallback 确保回调稳定性，避免不必要的子组件重渲染
  const handleUpdate = useCallback((id: string, data: Partial<StickerData>) => {
    onChange(stickers.map(s => s.id === id ? { ...s, ...data } : s));
  }, [stickers, onChange]);

  const handleRemove = useCallback((id: string) => {
    onChange(stickers.filter(s => s.id !== id));
  }, [stickers, onChange]);

  return (
    <div 
      className={`absolute inset-0 pointer-events-none overflow-visible transition-opacity duration-300 ${isEditable ? 'z-40' : 'z-20'}`}
      style={{ opacity: isEditable ? 1 : 0.8 }}
    >
      {stickers.map(sticker => (
        <StickerItem
          key={sticker.id}
          sticker={sticker}
          isEditable={isEditable}
          isSelected={selectedStickerId === sticker.id}
          onSelect={setSelectedStickerId}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
        />
      ))}
    </div>
  );
};
