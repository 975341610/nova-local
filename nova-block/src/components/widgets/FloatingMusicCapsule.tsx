import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, X, ListMusic } from 'lucide-react';
import { useMusicControls } from '../../contexts/MusicContext';

const EDGE_PEEK_PX = 20;
const DEFAULT_MARGIN_PX = 40;
const SNAP_THRESHOLD_PX = 80;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const FloatingMusicCapsule: React.FC = () => {
  // 仅订阅 controls，避免 progress(timeupdate) 导致拖拽容器掉帧
  const { currentTrack, isPlaying, toggle, next, prev, stop, togglePlaylist, playlistPopoverAnchor } = useMusicControls();

  const capsuleRef = useRef<HTMLDivElement | null>(null);
  const listButtonRef = useRef<HTMLButtonElement | null>(null);

  const showPlaylist = playlistPopoverAnchor !== null && listButtonRef.current !== null && 
    playlistPopoverAnchor.left === listButtonRef.current.getBoundingClientRect().left;
  const [isHovered, setIsHovered] = useState(false);
  const [isSnapped, setIsSnapped] = useState(false);
  const [snapSide, setSnapSide] = useState<'left' | 'right'>('right');

  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setViewport({ w: vw, h: vh });

      const rect = capsuleRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;

      setSize({ w: rect.width, h: rect.height });

      setPos(prev => {
        const maxX = vw - rect.width;
        const maxY = vh - rect.height;

        // 首次出现：默认放在右下角（留出边距）
        if (!isInitialized) {
          return {
            x: Math.max(0, maxX - DEFAULT_MARGIN_PX),
            y: Math.max(0, maxY - DEFAULT_MARGIN_PX),
          };
        }

        // resize 时：保持在屏幕可见区域（吸附状态下保持贴边）
        if (isSnapped) {
          return {
            x: snapSide === 'left' ? 0 : Math.max(0, maxX),
            y: clamp(prev.y, 0, Math.max(0, maxY)),
          };
        }

        return {
          x: clamp(prev.x, 0, Math.max(0, maxX)),
          y: clamp(prev.y, 0, Math.max(0, maxY)),
        };
      });

      setIsInitialized(true);
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isInitialized, isSnapped, snapSide]);

  const isSemiHidden = isSnapped && !isHovered;

  const { dragConstraints, targetX, targetY } = useMemo(() => {
    const maxX = Math.max(0, viewport.w - size.w);
    const maxY = Math.max(0, viewport.h - size.h);

    const constraints = isInitialized
      ? {
          left: -EDGE_PEEK_PX,
          right: maxX + EDGE_PEEK_PX,
          top: 0,
          bottom: maxY,
        }
      : undefined;

    // 吸附时通过“贴边位置 + 小幅负边距(±20px)”实现半掩面，避免把组件甩到屏幕外
    const x = isSnapped
      ? snapSide === 'left'
        ? isSemiHidden
          ? -EDGE_PEEK_PX
          : 0
        : isSemiHidden
          ? viewport.w - (size.w - (size.w - 40) - 20) // vw - (W - W_hidden_controls) = vw - 20? No. 
                                                       // User formula: vw - W + W_hidden_controls
                                                       // Let's use exactly: viewport.w - size.w + (size.w - 40) + 20
          : maxX
      : pos.x;

    return {
      dragConstraints: constraints,
      targetX: x,
      targetY: pos.y,
    };
  }, [isInitialized, viewport.w, viewport.h, size.w, size.h, isSnapped, snapSide, isSemiHidden, pos.x, pos.y]);

  if (!currentTrack) return null;

  const handleDragEnd = () => {
    const rect = capsuleRef.current?.getBoundingClientRect();
    if (!rect) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = rect.width;
    const h = rect.height;

    const centerX = rect.left + w / 2;
    const leftGap = rect.left;
    const rightGap = vw - rect.right;

    const maxX = Math.max(0, vw - w);
    const maxY = Math.max(0, vh - h);

    const nextY = clamp(rect.top, 0, maxY);

    // 优先判断靠近哪一侧，并结合阈值
    if (centerX < vw / 2) {
      if (leftGap < SNAP_THRESHOLD_PX) {
        setIsSnapped(true);
        setSnapSide('left');
        setPos({ x: 0, y: nextY });
        return;
      }
    } else {
      if (rightGap < SNAP_THRESHOLD_PX) {
        setIsSnapped(true);
        setSnapSide('right');
        setPos({ x: maxX, y: nextY });
        return;
      }
    }

    setIsSnapped(false);
    setPos({ x: clamp(rect.left, 0, maxX), y: nextY });
  };

  const macaronGradient = 'linear-gradient(45deg, #FF9A9E 0%, #FAD0C4 99%, #FAD0C4 100%)';

  return (
    <AnimatePresence>
      <motion.div
        ref={capsuleRef}
        drag
        dragConstraints={dragConstraints}
        dragElastic={0.05}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1, x: targetX, y: targetY }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`fixed top-0 left-0 z-[1000] flex items-center gap-2 bg-white/70 backdrop-blur-xl border border-white/40 shadow-2xl rounded-full p-1.5 transition-shadow duration-300 hover:shadow-pink-200/50 transform-gpu will-change-transform ${isSnapped ? '' : 'cursor-move'} ${snapSide === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {/* Vinyl Disc */}
        <div className="relative w-10 h-10 shrink-0">
          <div className="absolute inset-0 rounded-full bg-black/90 shadow-md ring-1 ring-white/20" />
          <motion.div
            animate={{ rotate: isPlaying ? 360 : 0 }}
            transition={{ duration: 4, ease: 'linear', repeat: isPlaying ? Infinity : 0 }}
            className="absolute inset-1 rounded-full overflow-hidden"
            style={{
              backgroundImage: currentTrack.cover
                ? `url("${currentTrack.cover}")`
                : macaronGradient,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="absolute inset-0 bg-black/20" />
          </motion.div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-white/90 border border-black/10" />
          </div>
        </div>

        {/* Info & Controls */}
        <AnimatePresence>
          {!isSemiHidden && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className={`flex items-center gap-3 overflow-hidden whitespace-nowrap ${snapSide === 'right' ? 'pl-2' : 'pr-2'}`}
            >
              <div className="flex flex-col min-w-0 max-w-[120px]">
                <div className="text-[11px] font-bold text-gray-800 truncate">{currentTrack.title}</div>
                <div className="flex items-center gap-0.5 mt-0.5">
                  <button onClick={prev} className="p-1 hover:bg-black/5 rounded-full transition-colors text-gray-600">
                    <SkipBack size={12} fill="currentColor" />
                  </button>
                  <button onClick={toggle} className="p-1 bg-black text-white rounded-full hover:scale-110 transition-transform">
                    {isPlaying ? <Pause size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
                  </button>
                  <button onClick={next} className="p-1 hover:bg-black/5 rounded-full transition-colors text-gray-600">
                    <SkipForward size={12} fill="currentColor" />
                  </button>
                </div>
              </div>

              <div className={`flex items-center gap-1 border-black/5 ${snapSide === 'right' ? 'border-r pr-2' : 'border-l pl-2'}`}>
                <button
                  ref={listButtonRef}
                  onClick={(e) => togglePlaylist(e.currentTarget)}
                  className={`p-1.5 rounded-full transition-colors ${showPlaylist ? 'bg-pink-100 text-pink-500' : 'hover:bg-black/5 text-gray-500'}`}
                >
                  <ListMusic size={14} />
                </button>
                <button onClick={stop} className="p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {/* PlaylistPopover removed - now global in App.tsx */}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};
