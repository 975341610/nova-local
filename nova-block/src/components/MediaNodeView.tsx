import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { GripVertical, Trash2, FileIcon, Download, LockOpen, Lock, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatFileSize } from '../lib/mediaUtils';
import { api, formatUrl } from '../lib/api';

type MediaKind = 'image' | 'video' | 'audio' | 'embed' | 'file';

type MediaNodeViewProps = NodeViewProps & {
  kind: MediaKind;
};

export function MediaNodeView({ node, updateAttributes, deleteNode, selected, kind }: MediaNodeViewProps) {
  const src = node.attrs.src as string;
  const width = (node.attrs.width as string) || '100%';
  const height = (node.attrs.height as number) || 420;

  // 交互锁定状态 (仅对 iframe 有效)
  const [isInteractive, setIsInteractive] = useState(false);

  const content = useMemo(() => {
    // If it's a relative URL from our backend, prefix it with the API base
    // (use formatUrl so it also works under strato-https-proxy / different origin)
    const absoluteSrc = formatUrl(src);

    if (kind === 'image') return <img src={absoluteSrc} alt="" className="w-full h-auto object-cover rounded-lg" draggable={false} />;
    if (kind === 'video') return <video src={absoluteSrc} controls muted playsInline className="w-full h-auto rounded-lg" />;
    if (kind === 'audio') return <audio src={absoluteSrc} controls className="media-node-audio" />;
    if (kind === 'file') {
      const { name, size, type } = node.attrs;
      
      const handleOpenFile = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // 如果是本地路径（如 /api/media/files/...），后端 open-file 接口会自动处理
        api.openFile(absoluteSrc);
      };

      return (
        <div 
          className="flex items-center gap-4 p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl hover:shadow-md hover:border-stone-300 dark:hover:border-stone-700 transition-all duration-200 cursor-pointer group/file"
          onClick={handleOpenFile}
        >
          <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-lg text-stone-400 group-hover/file:text-blue-500 group-hover/file:bg-blue-50 dark:group-hover/file:bg-blue-900/20 transition-all shadow-sm">
            <FileIcon size={24} strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="text-[15px] font-semibold text-stone-800 dark:text-stone-200 truncate mb-1 group-hover/file:text-blue-600 dark:group-hover/file:text-blue-400 transition-colors">
              {name || '未命名文件'}
            </div>
            <div className="text-[12px] text-stone-400 dark:text-stone-500 flex items-center gap-3">
              {size ? <span className="flex items-center gap-1"><Download size={12} />{formatFileSize(size)}</span> : null}
              {type ? <span className="uppercase text-[10px] font-bold tracking-wider bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full border border-stone-200 dark:border-stone-700">{type.split('/').pop()}</span> : null}
            </div>
          </div>
          <div className="opacity-0 group-hover/file:opacity-100 transition-all translate-x-1 group-hover/file:translate-x-0">
            <div className="p-2 rounded-full bg-stone-50 dark:bg-stone-800 text-stone-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all shadow-sm">
              <ExternalLink size={16} />
            </div>
          </div>
        </div>
      );
    }
    
    // For iframes (kind === 'embed')
    let finalSrc = src;
    if (!finalSrc.includes('autoplay=')) {
      finalSrc += (finalSrc.includes('?') ? '&' : '?') + 'autoplay=0';
    }
    if (!finalSrc.includes('muted=') && !finalSrc.includes('mute=')) {
      finalSrc += (finalSrc.includes('?') ? '&' : '?') + 'muted=1';
    }

    return (
      <div className="relative group/iframe overflow-hidden rounded-xl border border-stone-200/80 shadow-sm" style={{ width: '100%', paddingBottom: '56.25%', height: 0 }}>
        {/* 编辑器内 iframe 上方覆盖一层透明遮罩，防止 iframe 拦截所有的鼠标拖拽、点击事件 */}
        {!isInteractive && (
          <div 
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/5 hover:bg-black/10 cursor-pointer transition-colors backdrop-blur-[1px]" 
            title="点击解锁播放器交互" 
            onClick={() => setIsInteractive(true)}
          >
            <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 opacity-0 group-hover/iframe:opacity-100 transition-opacity">
              <Lock size={12} /> 点击解锁播放
            </div>
          </div>
        )}
        <iframe 
          src={finalSrc} 
          className="absolute inset-0 w-full h-full" 
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
    );
  }, [height, kind, node.attrs, src, isInteractive]);

  const startResize = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const wrapper = (event.currentTarget.closest('[data-media-wrapper]') as HTMLElement | null)?.parentElement;
    if (!wrapper) return;
    const baseWidth = wrapper.clientWidth || 1;

    const onMove = (moveEvent: MouseEvent) => {
      const rect = wrapper.getBoundingClientRect();
      const nextWidth = Math.max(30, Math.min(100, ((moveEvent.clientX - rect.left) / baseWidth) * 100));
      updateAttributes({ width: `${Math.round(nextWidth)}%` });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <NodeViewWrapper className={`group/media relative block my-4 ${selected ? 'ring-2 ring-blue-500 ring-offset-2 rounded-xl' : ''}`} data-media-wrapper style={{ width }}>
      {/* Outer Polaroid Container */}
      <div 
        className={
          kind === 'image' || kind === 'video'
            ? "bg-white dark:bg-stone-800 p-2 pb-8 rounded-xl shadow-sm border border-stone-200/60 dark:border-stone-700 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group-hover/media:border-stone-300 dark:group-hover/media:border-stone-600 relative overflow-hidden"
            : "relative"
        }
      >
        {/* Floating Toolbar (Hover to show) */}
        {kind !== 'audio' && (
          <div 
            className="absolute top-3 right-3 z-30 flex items-center gap-1.5 opacity-0 group-hover/media:opacity-100 transition-opacity duration-200" 
            contentEditable={false}
          >
            <div className="flex items-center bg-white/90 dark:bg-stone-800/90 backdrop-blur-md border border-stone-200/80 dark:border-stone-700 rounded-lg shadow-sm overflow-hidden text-stone-500">
              <button 
                className="p-1.5 hover:bg-stone-100 dark:hover:bg-stone-700 hover:text-stone-800 dark:hover:text-stone-200 cursor-grab active:cursor-grabbing transition-colors" 
                data-drag-handle 
                type="button"
                title="拖拽"
              >
                <GripVertical size={14} />
              </button>

              {kind === 'embed' && isInteractive && (
                <button 
                  className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-500 transition-colors border-l border-stone-200 dark:border-stone-700" 
                  type="button" 
                  onClick={() => setIsInteractive(false)}
                  title="锁定交互 (方便拖拽排版)"
                >
                  <LockOpen size={14} />
                </button>
              )}

              <button 
                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 transition-colors border-l border-stone-200 dark:border-stone-700" 
                type="button" 
                onClick={() => deleteNode()}
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {content}
        
        {/* Resize Handle (Hover to show) */}
        <div 
          className="absolute bottom-2 right-2 z-30 opacity-0 group-hover/media:opacity-100 transition-opacity duration-200" 
          contentEditable={false}
        >
          <button 
            className="w-5 h-5 flex items-center justify-center cursor-nwse-resize text-stone-400 hover:text-blue-500 transition-colors" 
            type="button" 
            onMouseDown={startResize}
            title="调整大小"
          >
            <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-current rounded-[1px]" />
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
