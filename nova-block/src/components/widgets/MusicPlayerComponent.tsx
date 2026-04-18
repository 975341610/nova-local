import React, { useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Link2, Play, Pause, ChevronDown, ChevronUp, Music, SkipBack, SkipForward, ListMusic } from 'lucide-react';
import { useMusicControls, useMusicProgress } from '../../contexts/MusicContext';
import { api } from '../../lib/api';
import { promptCompat } from '../../lib/promptCompat';

const palette = {
  bg: 'bg-[#F6F3EF]',
  card: 'bg-white/70',
  text: 'text-[#2E2A2A]',
  subtle: 'text-[#6E6868]',
  border: 'border-[#E6DFD8]',
};

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const MusicPlayerComponent: React.FC<any> = (props) => {
  const { editor, selected } = props;
  const isEditable = editor?.isEditable;

  const { currentTrack, isPlaying, toggle, next, prev, refreshPlaylist, playlist, togglePlaylist, playlistPopoverAnchor } = useMusicControls();
  const { progress, duration, setProgress } = useMusicProgress();
  const [isExpanded, setIsExpanded] = useState(false);
  const listButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const showPlaylist = playlistPopoverAnchor !== null && listButtonRef.current !== null && 
    playlistPopoverAnchor.left === listButtonRef.current.getBoundingClientRect().left;

  const displayTitle = currentTrack?.title || '未播放音乐';
  const displayArtist = currentTrack?.artist || '请从右侧列表选择或上传';
  const displayCover = currentTrack?.cover || '';

  const isCurrent = !!currentTrack; 
  const isActive = isCurrent && isPlaying;

  const handleToggle = () => {
    if (isCurrent) {
      toggle();
    } else {
      // 全局没歌时，点击播放按钮直接弹出右侧的 PlaylistPopover 列表让用户选歌
      if (listButtonRef.current) {
        togglePlaylist(listButtonRef.current);
      }
    }
  };

  const currentProgress = isCurrent ? progress : 0;
  const currentDuration = isCurrent ? duration : 0;

  const macaronGradient = 'linear-gradient(45deg, #FF9A9E 0%, #FAD0C4 99%, #FAD0C4 100%)';

  return (
    <NodeViewWrapper
      className={`my-5 rounded-3xl border ${palette.border} ${palette.bg} shadow-soft overflow-hidden ${selected ? 'ring-2 ring-black/10' : ''}`}
      data-drag-handle
    >
      <div className="p-5 md:p-6">
        <div className="flex items-start gap-5">
          {/* Vinyl */}
          <div className="relative w-24 h-24 md:w-28 md:h-28 shrink-0 cursor-pointer" onClick={handleToggle}>
            <div className="absolute inset-0 rounded-full bg-black/80 shadow-[0_12px_30px_rgba(0,0,0,0.2)]" />
            <motion.div
              animate={isActive ? { rotate: 360 } : { rotate: 0 }}
              transition={isActive ? { duration: 3, ease: 'linear', repeat: Infinity } : { duration: 0 }}
              className="absolute inset-2 rounded-full overflow-hidden"
              style={{
                backgroundImage: displayCover ? `url("${displayCover}")` : macaronGradient,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <div className="absolute inset-0 bg-black/20" />
              <div className="absolute inset-0 opacity-30" style={{
                backgroundImage:
                  'repeating-radial-gradient(circle at center, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, rgba(0,0,0,0) 5px, rgba(0,0,0,0) 8px)',
              }} />
            </motion.div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full bg-[#F6F3EF] border border-black/10 flex items-center justify-center">
                 {isActive ? <Pause size={10} className="text-black" /> : <Play size={10} className="ml-0.5 text-black" />}
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className={`text-base md:text-lg font-black tracking-tight ${palette.text} truncate`}>{displayTitle}</div>
              <div className="flex items-center gap-1">
                <button 
                  ref={listButtonRef}
                  onClick={(e) => togglePlaylist(e.currentTarget)}
                  className={`p-1.5 rounded-lg transition-colors ${showPlaylist ? 'bg-pink-100 text-pink-500' : 'hover:bg-black/5 text-black/40'}`}
                >
                  <ListMusic size={18} />
                </button>
                <button 
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 hover:bg-black/5 rounded-lg transition-colors text-black/40"
                >
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            </div>
            <div className={`mt-0.5 text-sm font-semibold ${palette.subtle} truncate flex items-center gap-1.5`}>
              <Music size={12} /> {displayArtist}
            </div>

            {/* Simple Player Controls & Progress */}
            <div className="mt-4 flex items-center gap-4">
               <div className="flex items-center gap-1 shrink-0 bg-black/5 p-1 rounded-full">
                  <button onClick={prev} className="p-1.5 hover:bg-black/10 rounded-full text-black/40 transition-colors">
                    <SkipBack size={14} fill="currentColor" />
                  </button>
                  <button 
                    onClick={handleToggle} 
                    className="p-2.5 bg-black text-white rounded-full hover:scale-105 transition-transform shadow-lg"
                  >
                    {isActive ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
                  </button>
                  <button onClick={next} className="p-1.5 hover:bg-black/10 rounded-full text-black/40 transition-colors">
                    <SkipForward size={14} fill="currentColor" />
                  </button>
               </div>
               
               <div className="flex-1 min-w-0">
                  <div 
                    className={`relative h-1.5 rounded-full bg-black/5 cursor-pointer overflow-hidden`}
                    onClick={(e) => {
                      if (!isCurrent) return;
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const ratio = Math.min(1, Math.max(0, x / rect.width));
                      setProgress(ratio);
                    }}
                  >
                    <motion.div 
                      className="absolute inset-y-0 left-0 bg-black/60" 
                      initial={false}
                      animate={{ width: `${currentProgress * 100}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[10px] font-bold text-black/30 tabular-nums uppercase tracking-wider">
                    <span>{isCurrent ? formatTime(currentProgress * currentDuration) : '0:00'}</span>
                    <span>{isCurrent ? formatTime(currentDuration) : '0:00'}</span>
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* 配置面板 (展开) */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-6 pt-6 border-t border-black/5 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2 text-[10px] font-black text-black/20 tracking-[0.2em] uppercase mb-1">播放器设置</div>
                
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-xl border border-black/5 bg-white/40 hover:bg-white hover:shadow-sm transition-all text-xs font-bold flex items-center gap-2"
                  onClick={async () => {
                    const t = await promptCompat({ title: '歌曲标题', placeholder: '输入歌曲标题' });
                    const u = await promptCompat({ title: '音频直链 URL', placeholder: 'https://example.com/audio.mp3' });
                    const c = await promptCompat({ title: '封面图片 URL（可选）', placeholder: 'https://example.com/cover.jpg' });
                    if (t && u) {
                      await api.saveMusicLink({ title: t, url: u, cover: c || undefined });
                      await refreshPlaylist();
                      alert('已保存到库');
                    }
                  }}
                >
                  <Link2 size={14} className="text-black/40" /> 保存直链到库
                </button>

                <button
                  type="button"
                  className="px-4 py-2.5 rounded-xl border border-black/5 bg-white/40 hover:bg-white hover:shadow-sm transition-all text-xs font-bold flex items-center gap-2"
                  onClick={(e) => {
                    if (playlist.length === 0) {
                      alert('库中暂无歌曲');
                      return;
                    }
                    togglePlaylist(e.currentTarget);
                  }}
                >
                  <Music size={14} className="text-black/40" /> 从库中选择歌曲
                </button>

                {isEditable && (
                  <label className="md:col-span-2 px-4 py-2.5 rounded-xl border border-black/5 bg-white/40 text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-white hover:shadow-sm transition-all">
                    <Upload size={14} className="text-black/40" /> 上传音频到库
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        await api.uploadMusic(f);
                        await refreshPlaylist();
                        alert('上传成功');
                      }}
                    />
                  </label>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </NodeViewWrapper>
  );
};
