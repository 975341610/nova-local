import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { GripVertical, Lock, LockOpen, Maximize2, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatUrl } from '../lib/api';
import { DocumentAttachmentView } from './document/DocumentAttachmentView';

type MediaKind = 'image' | 'video' | 'audio' | 'embed' | 'file';

type MediaNodeViewProps = NodeViewProps & {
  kind: MediaKind;
};

export function MediaNodeView({ node, updateAttributes, deleteNode, selected, kind }: MediaNodeViewProps) {
  const src = node.attrs.src as string;
  const width = (node.attrs.width as string) || '100%';
  const [isInteractive, setIsInteractive] = useState(false);
  const [fileViewMode, setFileViewMode] = useState<'card' | 'preview'>(
    node.attrs.viewMode === 'preview' ? 'preview' : 'card',
  );
  const [isImageFullscreen, setIsImageFullscreen] = useState(false);
  const absoluteSrc = useMemo(() => formatUrl(src), [src]);

  const content = useMemo(() => {
    if (kind === 'image') {
      return <img src={absoluteSrc} alt="" className="h-auto w-full rounded-lg object-cover" draggable={false} />;
    }
    if (kind === 'video') {
      return <video src={absoluteSrc} controls muted playsInline className="h-auto w-full rounded-lg" />;
    }
    if (kind === 'audio') {
      return <audio src={absoluteSrc} controls className="media-node-audio" />;
    }
    if (kind === 'file') {
      return (
        <DocumentAttachmentView
          src={src}
          name={node.attrs.name}
          size={node.attrs.size}
          type={node.attrs.type}
          viewMode={fileViewMode}
          onViewModeChange={setFileViewMode}
          onDelete={deleteNode}
        />
      );
    }

    let finalSrc = src;
    if (!finalSrc.includes('autoplay=')) {
      finalSrc += (finalSrc.includes('?') ? '&' : '?') + 'autoplay=0';
    }
    if (!finalSrc.includes('muted=') && !finalSrc.includes('mute=')) {
      finalSrc += (finalSrc.includes('?') ? '&' : '?') + 'muted=1';
    }

    return (
      <div className="group/iframe relative overflow-hidden rounded-xl border border-stone-200/80 shadow-sm" style={{ width: '100%', paddingBottom: '56.25%', height: 0 }}>
        {!isInteractive && (
          <div
            className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center bg-black/5 backdrop-blur-[1px] transition-colors hover:bg-black/10"
            title="点击解锁播放器交互"
            onClick={() => setIsInteractive(true)}
          >
            <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white opacity-0 transition-opacity group-hover/iframe:opacity-100">
              <Lock size={12} /> 点击解锁播放
            </div>
          </div>
        )}
        <iframe
          src={finalSrc}
          className="absolute inset-0 h-full w-full"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
    );
  }, [absoluteSrc, deleteNode, fileViewMode, isInteractive, kind, node.attrs, src, updateAttributes]);

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
    <NodeViewWrapper className={`group/media relative my-4 block ${selected ? 'rounded-xl ring-2 ring-blue-500 ring-offset-2' : ''}`} data-media-wrapper style={{ width }}>
      <div
        className={
          kind === 'image' || kind === 'video'
            ? 'relative overflow-hidden rounded-xl transition-transform duration-300 hover:-translate-y-0.5'
            : 'relative'
        }
      >
        {kind !== 'audio' && kind !== 'file' && (
          <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover/media:opacity-100" contentEditable={false}>
            <div className="flex items-center overflow-hidden rounded-lg border border-stone-200/80 bg-white/90 text-stone-500 shadow-sm backdrop-blur-md dark:border-stone-700 dark:bg-stone-800/90">
              <button className="cursor-grab p-1.5 transition-colors hover:bg-stone-100 hover:text-stone-800 active:cursor-grabbing dark:hover:bg-stone-700 dark:hover:text-stone-200" data-drag-handle type="button" title="拖拽">
                <GripVertical size={14} />
              </button>
              {kind === 'embed' && isInteractive && (
                <button
                  className="border-l border-stone-200 p-1.5 text-blue-500 transition-colors hover:bg-blue-50 dark:border-stone-700 dark:hover:bg-blue-900/30"
                  type="button"
                  onClick={() => setIsInteractive(false)}
                  title="锁定交互，方便拖拽排版"
                >
                  <LockOpen size={14} />
                </button>
              )}
              {kind === 'image' && (
                <button
                  className="border-l border-stone-200 p-1.5 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:border-stone-700 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setIsImageFullscreen(true);
                  }}
                  title="全屏观看"
                >
                  <Maximize2 size={14} />
                </button>
              )}
              <button
                className="border-l border-stone-200 p-1.5 transition-colors hover:bg-red-50 hover:text-red-500 dark:border-stone-700 dark:hover:bg-red-900/30"
                type="button"
                onClick={() => deleteNode()}
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}

        {content}

        {kind !== 'file' && (
          <div className="absolute bottom-2 right-2 z-30 opacity-0 transition-opacity duration-200 group-hover/media:opacity-100" contentEditable={false}>
            <button className="flex h-5 w-5 cursor-nwse-resize items-center justify-center text-stone-400 transition-colors hover:text-blue-500" type="button" onMouseDown={startResize} title="调整大小">
              <div className="h-2.5 w-2.5 rounded-[1px] border-b-2 border-r-2 border-current" />
            </button>
          </div>
        )}
      </div>
      {kind === 'image' &&
        isImageFullscreen &&
        createPortal(
          <div
            className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/85 p-6 backdrop-blur-md"
            contentEditable={false}
            data-testid="media-image-fullscreen-viewer"
            onClick={() => setIsImageFullscreen(false)}
          >
            <button
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white shadow-lg backdrop-blur transition-colors hover:bg-white/25"
              type="button"
              title="退出全屏观看"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsImageFullscreen(false);
              }}
            >
              <X size={20} />
            </button>
            <img
              src={absoluteSrc}
              alt=""
              className="max-h-[92vh] max-w-[94vw] rounded-2xl object-contain shadow-2xl"
              draggable={false}
              onClick={(event) => event.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </NodeViewWrapper>
  );
}
