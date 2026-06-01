import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { ExternalLink, Eye, Maximize2, PanelTop, Rows3, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';
import { defaultWebEmbedTitle, normalizeWebEmbedUrl } from '../../lib/webEmbed';

type WebEmbedViewMode = 'card' | 'preview';

const buttonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#467466] transition hover:bg-[#e7eee8] hover:text-[#2f6f62]';

function openUrlInBrowser(url: string) {
  void api.openUrl(url).catch(() => {
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}

export function WebEmbedView({ node, updateAttributes, selected }: NodeViewProps) {
  const rawUrl = String(node.attrs.url || '');
  const url = useMemo(() => normalizeWebEmbedUrl(rawUrl) || rawUrl, [rawUrl]);
  const [floating, setFloating] = useState(false);
  const title = String(node.attrs.title || '') || defaultWebEmbedTitle(url);
  const viewMode = (node.attrs.viewMode === 'preview' ? 'preview' : 'card') as WebEmbedViewMode;

  useEffect(() => {
    if (!url || node.attrs.title) return;
    let cancelled = false;
    api.previewImportUrls([url])
      .then((result) => {
        const nextTitle = result.items?.[0]?.title?.trim();
        if (!cancelled && nextTitle && nextTitle !== node.attrs.title) {
          updateAttributes({ title: nextTitle });
        }
      })
      .catch(() => {
        // Keep the hostname fallback. Title fetching is a convenience, not a blocker.
      });
    return () => {
      cancelled = true;
    };
  }, [node.attrs.title, updateAttributes, url]);

  const setMode = (mode: WebEmbedViewMode) => {
    updateAttributes({ viewMode: mode });
  };

  const renderToolbar = () => (
    <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-[#e2d8ca] bg-white/92 px-1.5 py-1 shadow-sm backdrop-blur">
      <button className={buttonClass} type="button" title="卡片视图" onClick={() => setMode('card')}>
        <Rows3 size={16} />
      </button>
      <button className={buttonClass} type="button" title="内嵌预览" onClick={() => setMode('preview')}>
        <PanelTop size={16} />
      </button>
      <button className={buttonClass} type="button" title="悬浮预览" onClick={() => setFloating(true)}>
        <Maximize2 size={16} />
      </button>
      <button className={buttonClass} type="button" title="在浏览器中打开" onClick={() => openUrlInBrowser(url)}>
        <ExternalLink size={16} />
      </button>
    </div>
  );

  const floatingPreview = floating ? createPortal(
    <div className="fixed inset-0 z-[2147482500] flex items-center justify-center bg-black/20 p-8" contentEditable={false}>
      <div className="flex h-[78vh] w-[min(1120px,86vw)] flex-col overflow-hidden rounded-2xl border border-[#d8c9b5] bg-[#fffdfa] shadow-2xl">
        <div className="flex h-12 items-center justify-between border-b border-[#e7dfd3] px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[#2b2b2b]">{title}</div>
            <div className="truncate text-xs text-[#8b8277]">{url}</div>
          </div>
          <div className="flex items-center gap-1">
            <button className={buttonClass} type="button" title="在浏览器中打开" onClick={() => openUrlInBrowser(url)}>
              <ExternalLink size={16} />
            </button>
            <button className={buttonClass} type="button" title="关闭" onClick={() => setFloating(false)}>
              <X size={16} />
            </button>
          </div>
        </div>
        <iframe
          title={title}
          src={url}
          className="min-h-0 flex-1 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        />
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <NodeViewWrapper
      className={`qz-web-embed group/web relative my-4 block rounded-2xl border border-[#ded6ca] bg-[#fffdfa]/82 shadow-[0_16px_40px_rgba(72,58,45,0.08)] ${
        selected ? 'ring-2 ring-[#80a89c] ring-offset-2' : ''
      }`}
      data-web-embed-wrapper
      contentEditable={false}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end p-2 opacity-0 transition group-hover/web:opacity-100">
        {renderToolbar()}
      </div>

      {viewMode === 'preview' ? (
        <div className="overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-[#e7dfd3] bg-[#fbfaf7]/80 px-5 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[#2b2b2b]">{title}</div>
              <div className="truncate text-xs text-[#8b8277]">{url}</div>
            </div>
            <button
              type="button"
              className="rounded-full border border-[#d8c9b5] px-3 py-1 text-xs text-[#9b7441] hover:bg-[#f6efe4]"
              onClick={() => setMode('card')}
            >
              卡片
            </button>
          </div>
          <iframe
            title={title}
            src={url}
            className="h-[520px] w-full bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
          />
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center gap-4 rounded-2xl p-4 text-left transition hover:bg-[#f8f4ee]"
          onClick={() => setFloating(true)}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#ded6ca] bg-[#f6f3ef] text-[#5f9185] shadow-sm">
            <Eye size={24} strokeWidth={1.6} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-[#2b2b2b]">{title}</div>
            <div className="mt-1 truncate text-xs text-[#8b8277]">{url}</div>
          </div>
        </button>
      )}

      {floatingPreview}
    </NodeViewWrapper>
  );
}
