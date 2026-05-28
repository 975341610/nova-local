import DOMPurify from 'dompurify';
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  GripVertical,
  Maximize2,
  MonitorPlay,
  PanelLeft,
  Printer,
  Rows3,
  Trash2,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, formatUrl } from '../../lib/api';
import { formatFileSize } from '../../lib/mediaUtils';

type DocumentPreview = {
  kind: 'pdf' | 'markdown' | 'docx' | 'unsupported';
  title: string;
  extension: string;
  can_preview: boolean;
  page_count: number | null;
  sections: Array<{ title: string; level?: number; page?: number }>;
  html: string;
};

type DocumentViewMode = 'card' | 'preview';

type DocumentAttachmentViewProps = {
  src: string;
  name?: string;
  size?: number;
  type?: string;
  viewMode?: DocumentViewMode;
  onViewModeChange: (viewMode: DocumentViewMode) => void;
  onDelete: () => void;
};

const MAX_DOCUMENT_PREVIEW_SESSION_CACHE = 8;
const MAX_DOCUMENT_PDF_FRAME_CACHE = 8;
const DOCUMENT_PDF_IFRAME_CLASS = 'qz-document-pdf-iframe h-full min-h-[420px] w-full rounded-xl bg-white';

type DocumentPreviewCacheEntry = {
  viewMode: DocumentViewMode;
  preview: DocumentPreview | null;
  promise?: Promise<DocumentPreview>;
};

const documentPreviewSessionCache = new Map<string, DocumentPreviewCacheEntry>();

type DocumentPdfFrameCacheEntry = {
  iframe: HTMLIFrameElement;
  wrapper: HTMLDivElement;
  src: string;
  attached: boolean;
  lastPlacement?: string;
};

const documentPdfFrameCache = new Map<string, DocumentPdfFrameCacheEntry>();

type DocumentPdfFrameTarget = {
  entry: DocumentPdfFrameCacheEntry;
  host: HTMLElement;
  isSuspended: () => boolean;
};

const documentPdfFrameTargets = new Map<string, DocumentPdfFrameTarget>();
let documentPdfFrameRaf = 0;
let documentPdfFrameHeartbeat = 0;

const getDocumentPreviewCacheKey = (src: string, name = '', type = '') => `${src}::${name}::${type}`;

const evictDocumentPreviewCache = () => {
  while (documentPreviewSessionCache.size > MAX_DOCUMENT_PREVIEW_SESSION_CACHE) {
    const oldestKey = documentPreviewSessionCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    documentPreviewSessionCache.delete(oldestKey);
  }
};

const getOrCreateDocumentPreviewCacheEntry = (key: string) => {
  let entry = documentPreviewSessionCache.get(key);
  if (!entry) {
    entry = { viewMode: 'card', preview: null };
    documentPreviewSessionCache.set(key, entry);
    evictDocumentPreviewCache();
  }
  return entry;
};

export const __resetDocumentPreviewSessionCacheForTests = () => {
  documentPreviewSessionCache.clear();
  documentPdfFrameTargets.clear();
  stopDocumentPdfFrameHeartbeatIfIdle();
  documentPdfFrameCache.forEach((entry) => entry.wrapper.remove());
  documentPdfFrameCache.clear();
  document.querySelector('[data-qz-document-pdf-layer]')?.remove();
  delete document.body.dataset.qzDocumentPreviewSuspended;
};

export const __getDocumentPreviewSessionCacheSizeForTests = () => documentPreviewSessionCache.size;

const previewableByName = (name = '', type = '') => {
  const value = `${name} ${type}`.toLowerCase();
  return /\.(pdf|md|markdown|docx)\b/.test(value) || /(pdf|markdown|word)/.test(value);
};

const toolbarButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#467466] transition hover:bg-[#e7eee8] hover:text-[#2f6f62]';

const getDocumentPdfLayer = () => {
  let layer = document.querySelector('[data-qz-document-pdf-layer]') as HTMLDivElement | null;
  if (!layer) {
    layer = document.createElement('div');
    layer.dataset.qzDocumentPdfLayer = 'true';
    layer.style.position = 'fixed';
    layer.style.inset = '0';
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = '12';
    document.body.appendChild(layer);
  }
  return layer;
};

const evictDocumentPdfFrameCache = () => {
  while (documentPdfFrameCache.size > MAX_DOCUMENT_PDF_FRAME_CACHE) {
    const hidden = Array.from(documentPdfFrameCache.entries()).find(([, entry]) => {
      return !entry.attached;
    });
    if (!hidden) break;
    hidden[1].wrapper.remove();
    documentPdfFrameCache.delete(hidden[0]);
  }
};

const getOrCreateDocumentPdfFrame = (key: string, src: string, title: string) => {
  let entry = documentPdfFrameCache.get(key);
  if (!entry) {
    const wrapper = document.createElement('div');
    wrapper.dataset.qzDocumentPdfWrapper = 'true';
    wrapper.style.position = 'fixed';
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.overflow = 'hidden';
    wrapper.style.borderRadius = '12px';
    wrapper.style.background = '#fff';
    wrapper.style.pointerEvents = 'auto';
    wrapper.style.visibility = 'hidden';
    wrapper.style.transform = 'translate3d(-10000px, -10000px, 0)';
    wrapper.style.willChange = 'transform, width, height';
    const iframe = document.createElement('iframe');
    entry = { iframe, wrapper, src, attached: false };
    entry.iframe.src = src;
    entry.wrapper.appendChild(entry.iframe);
    getDocumentPdfLayer().appendChild(entry.wrapper);
  } else {
    documentPdfFrameCache.delete(key);
    if (entry.src !== src) {
      entry.src = src;
      entry.iframe.src = src;
    }
  }

  entry.iframe.title = title;
  entry.iframe.className = DOCUMENT_PDF_IFRAME_CLASS;
  entry.iframe.style.border = '0';
  entry.iframe.style.display = 'block';
  entry.iframe.style.margin = '0';
  documentPdfFrameCache.set(key, entry);
  evictDocumentPdfFrameCache();
  return entry;
};

const isRectVisible = (rect: DOMRect) => {
  const viewportWidth = window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
  return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < viewportWidth && rect.top < viewportHeight;
};

const placeDocumentPdfFrame = (entry: DocumentPdfFrameCacheEntry, host: HTMLElement, hidden: boolean) => {
  if (!host.isConnected) {
    entry.wrapper.style.visibility = 'hidden';
    entry.wrapper.style.pointerEvents = 'none';
    return;
  }
  const rect = host.getBoundingClientRect();
  const shouldHide = hidden || !isRectVisible(rect);
  const left = Math.round(rect.left * 100) / 100;
  const top = Math.round(rect.top * 100) / 100;
  const width = Math.max(0, Math.round(rect.width * 100) / 100);
  const height = Math.max(0, Math.round(rect.height * 100) / 100);
  const visibility = shouldHide ? 'hidden' : 'visible';
  const pointerEvents = shouldHide ? 'none' : 'auto';
  const placement = `${left}|${top}|${width}|${height}|${visibility}|${pointerEvents}`;
  if (entry.lastPlacement !== placement) {
    entry.lastPlacement = placement;
    entry.wrapper.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    entry.wrapper.style.width = `${width}px`;
    entry.wrapper.style.height = `${height}px`;
    entry.wrapper.style.visibility = visibility;
    entry.wrapper.style.pointerEvents = pointerEvents;
  }
  entry.iframe.style.width = '100%';
  entry.iframe.style.height = '100%';
};

const syncDocumentPdfFrames = () => {
  documentPdfFrameTargets.forEach(({ entry, host, isSuspended }) => {
    placeDocumentPdfFrame(entry, host, isSuspended());
  });
};

const scheduleDocumentPdfFrameSync = () => {
  if (documentPdfFrameRaf) return;
  documentPdfFrameRaf = window.requestAnimationFrame(() => {
    documentPdfFrameRaf = 0;
    syncDocumentPdfFrames();
  });
};

const stopDocumentPdfFrameHeartbeatIfIdle = () => {
  if (documentPdfFrameTargets.size > 0) return;
  if (documentPdfFrameRaf) {
    window.cancelAnimationFrame(documentPdfFrameRaf);
    documentPdfFrameRaf = 0;
  }
  if (documentPdfFrameHeartbeat) {
    window.clearInterval(documentPdfFrameHeartbeat);
    documentPdfFrameHeartbeat = 0;
  }
};

const ensureDocumentPdfFrameHeartbeat = () => {
  if (documentPdfFrameHeartbeat) return;
  documentPdfFrameHeartbeat = window.setInterval(() => {
    if (document.hidden || documentPdfFrameTargets.size === 0) return;
    scheduleDocumentPdfFrameSync();
  }, 80);
};

const registerDocumentPdfFrameTarget = (key: string, target: DocumentPdfFrameTarget) => {
  documentPdfFrameTargets.set(key, target);
  ensureDocumentPdfFrameHeartbeat();
  scheduleDocumentPdfFrameSync();
  return () => {
    if (documentPdfFrameTargets.get(key) === target) {
      documentPdfFrameTargets.delete(key);
    }
    stopDocumentPdfFrameHeartbeatIfIdle();
  };
};

function DocumentPdfFrame({
  cacheKey,
  src,
  title,
  page,
  zoom,
  suspended,
}: {
  cacheKey: string;
  src: string;
  title: string;
  page: number;
  zoom: number;
  suspended?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const entryRef = useRef<DocumentPdfFrameCacheEntry | null>(null);
  const suspendedRef = useRef(Boolean(suspended));
  suspendedRef.current = Boolean(suspended);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const entry = getOrCreateDocumentPdfFrame(cacheKey, src, title);
    entryRef.current = entry;
    entry.attached = true;
    placeDocumentPdfFrame(entry, host, suspendedRef.current);
    const unregisterTarget = registerDocumentPdfFrameTarget(cacheKey, {
      entry,
      host,
      isSuspended: () => suspendedRef.current,
    });
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleDocumentPdfFrameSync) : null;
    resizeObserver?.observe(host);
    window.addEventListener('resize', scheduleDocumentPdfFrameSync);
    window.addEventListener('scroll', scheduleDocumentPdfFrameSync, true);
    window.visualViewport?.addEventListener('resize', scheduleDocumentPdfFrameSync);
    window.visualViewport?.addEventListener('scroll', scheduleDocumentPdfFrameSync);
    return () => {
      unregisterTarget();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleDocumentPdfFrameSync);
      window.removeEventListener('scroll', scheduleDocumentPdfFrameSync, true);
      window.visualViewport?.removeEventListener('resize', scheduleDocumentPdfFrameSync);
      window.visualViewport?.removeEventListener('scroll', scheduleDocumentPdfFrameSync);
      entry.attached = false;
      entry.wrapper.style.visibility = 'hidden';
      entry.wrapper.style.pointerEvents = 'none';
      if (entryRef.current === entry) {
        entryRef.current = null;
      }
    };
  }, [cacheKey, src, title]);

  useLayoutEffect(() => {
    const entry = entryRef.current;
    const host = hostRef.current;
    if (!entry || !host) return;
    placeDocumentPdfFrame(entry, host, Boolean(suspended));
  }, [suspended]);

  return (
    <div
      ref={hostRef}
      className="h-full min-h-[420px] w-full overflow-hidden rounded-xl bg-white"
      data-testid="document-pdf-frame"
      data-page={String(page)}
      data-zoom={String(zoom)}
    >
      {suspended ? (
        <div
          className="flex h-full min-h-[420px] w-full items-center justify-center rounded-xl bg-white/70 text-sm text-[#8b8277]"
          data-testid="document-preview-suspended"
        >
          文档预览已暂隐
        </div>
      ) : null}
    </div>
  );
}

export function DocumentAttachmentView({
  src,
  name = '未命名文件',
  size = 0,
  type = '',
  viewMode = 'card',
  onViewModeChange,
  onDelete,
}: DocumentAttachmentViewProps) {
  const absoluteSrc = useMemo(() => formatUrl(src), [src]);
  const cacheKey = useMemo(() => getDocumentPreviewCacheKey(absoluteSrc), [absoluteSrc]);
  const [sessionViewMode, setSessionViewMode] = useState<DocumentViewMode>(() => {
    return documentPreviewSessionCache.get(cacheKey)?.viewMode || viewMode;
  });
  const [preview, setPreview] = useState<DocumentPreview | null>(() => {
    return documentPreviewSessionCache.get(cacheKey)?.preview || null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [showPages, setShowPages] = useState(true);
  const [previewSuspended, setPreviewSuspended] = useState(
    () => document.body.dataset.qzDocumentPreviewSuspended === 'true',
  );
  const pdfFrameRef = useRef<HTMLIFrameElement | null>(null);

  const canAttemptPreview = previewableByName(name, type);
  const pageCount = Math.max(1, preview?.page_count || 1);
  const isPdf = preview?.kind === 'pdf' || /\.pdf(\?|#|$)/i.test(name || src);

  useEffect(() => {
    const cached = documentPreviewSessionCache.get(cacheKey);
    setSessionViewMode(cached?.viewMode || viewMode);
    setPreview(cached?.preview || null);
    setError('');
    setLoading(false);
  }, [cacheKey, viewMode]);

  useEffect(() => {
    const refreshSuspended = () => {
      setPreviewSuspended(document.body.dataset.qzDocumentPreviewSuspended === 'true');
    };
    const suspendPreview = () => {
      document.body.dataset.qzDocumentPreviewSuspended = 'true';
      setPreviewSuspended(true);
    };
    const resumePreview = () => {
      if (document.body.dataset.qzDocumentPreviewSuspended === 'true') {
        delete document.body.dataset.qzDocumentPreviewSuspended;
      }
      setPreviewSuspended(false);
    };
    const observer = new MutationObserver(refreshSuspended);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-qz-document-preview-suspended'] });
    window.addEventListener('qz:document-preview-suspend', suspendPreview);
    window.addEventListener('qz:document-preview-resume', resumePreview);
    refreshSuspended();
    return () => {
      observer.disconnect();
      window.removeEventListener('qz:document-preview-suspend', suspendPreview);
      window.removeEventListener('qz:document-preview-resume', resumePreview);
    };
  }, []);

  const setCachedViewMode = (nextViewMode: DocumentViewMode) => {
    const entry = getOrCreateDocumentPreviewCacheEntry(cacheKey);
    entry.viewMode = nextViewMode;
    setSessionViewMode(nextViewMode);
    onViewModeChange(nextViewMode);
  };

  useEffect(() => {
    if (sessionViewMode !== 'preview' && !fullscreen) return;
    if (!canAttemptPreview || preview) return;

    let cancelled = false;
    const entry = getOrCreateDocumentPreviewCacheEntry(cacheKey);
    const previewPromise = entry.promise || api.previewDocument({ src, name });
    entry.promise = previewPromise;

    setLoading(true);
    setError('');
    previewPromise
      .then((result) => {
        const latestEntry = getOrCreateDocumentPreviewCacheEntry(cacheKey);
        latestEntry.preview = result;
        if (latestEntry.promise === previewPromise) {
          latestEntry.promise = undefined;
        }
        if (cancelled) return;
        setPreview(result);
        if (!result.can_preview) {
          setError('当前文件类型暂不支持内嵌预览');
        }
      })
      .catch((err) => {
        const latestEntry = documentPreviewSessionCache.get(cacheKey);
        if (latestEntry?.promise === previewPromise) {
          latestEntry.promise = undefined;
        }
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, canAttemptPreview, fullscreen, name, preview, sessionViewMode, src]);

  const sanitizedHtml = useMemo(() => {
    return DOMPurify.sanitize(preview?.html || '', {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tbody', 'tr', 'td', 'th'],
      ALLOWED_ATTR: [],
    });
  }, [preview?.html]);

  useEffect(() => {
    if (!fullscreen || !isPdf || !pdfFrameRef.current) return;
    try {
      const frameWindow = pdfFrameRef.current.contentWindow;
      if (frameWindow) {
        frameWindow.location.hash = `page=${page}&toolbar=0&navpanes=0`;
      }
    } catch {
      // Native PDF viewers can block scripted hash updates. Keep the iframe
      // mounted so zoom remains smooth and avoid falling back to a reload loop.
    }
  }, [fullscreen, isPdf, page]);

  const setNextPage = (next: number) => setPage(Math.max(1, Math.min(pageCount, next)));
  const download = () => window.open(absoluteSrc, '_blank', 'noopener,noreferrer');
  const print = () => window.open(absoluteSrc, '_blank', 'noopener,noreferrer');

  const renderPreviewContent = (fullscreenMode = false) => {
    if (loading) {
      return <div className="flex min-h-[220px] items-center justify-center text-sm text-[#8b8277]">正在读取文档...</div>;
    }
    if (error) {
      return <div className="flex min-h-[220px] items-center justify-center px-6 text-center text-sm text-[#a15a50]">{error}</div>;
    }
    if (!preview) {
      return <div className="flex min-h-[220px] items-center justify-center text-sm text-[#8b8277]">点击预览后读取文档内容</div>;
    }
    if (isPdf) {
      const hash = '#toolbar=0&navpanes=0';
      if (!fullscreenMode) {
        return (
          <DocumentPdfFrame
            cacheKey={cacheKey}
            src={`${absoluteSrc}${hash}`}
            title={name}
            page={page}
            zoom={zoom}
            suspended={previewSuspended}
          />
        );
      }
      const scale = fullscreenMode ? zoom / 100 : 1;
      const frameStyle = fullscreenMode
        ? {
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            width: `${100 / scale}%`,
            height: `${100 / scale}%`,
          }
        : undefined;
      return (
        <div
          className="h-full min-h-[420px] w-full overflow-auto rounded-xl bg-white"
          data-testid="document-pdf-frame"
          data-page={String(page)}
          data-zoom={String(zoom)}
        >
          <iframe
            ref={fullscreenMode ? pdfFrameRef : undefined}
            key="document-pdf-frame"
            title={name}
            src={`${absoluteSrc}${hash}`}
            className="qz-document-pdf-iframe h-full min-h-[420px] w-full rounded-xl bg-white"
            style={{ border: 0, display: 'block', margin: 0, ...frameStyle }}
          />
        </div>
      );
    }
    return (
      <div
        className="qingzhi-document-html max-h-[520px] overflow-auto px-7 py-6 text-[#2b2b2b]"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml || '<p>文档中没有可预览的文字内容。</p>' }}
      />
    );
  };

  const renderFullscreen = () => {
    if (!fullscreen) return null;
    const pages = isPdf
      ? Array.from({ length: pageCount }, (_, index) => ({ title: `第 ${index + 1} 页`, page: index + 1 }))
      : preview?.sections?.length
        ? preview.sections
        : [{ title: name, page: 1 }];

    return createPortal(
      <div
        className="fixed inset-0 z-[2147483000] flex bg-[#f6f3ef] text-[#2b2b2b]"
        contentEditable={false}
        data-testid="document-fullscreen-viewer"
      >
        {showPages && (
          <aside className="w-56 shrink-0 border-r border-[#ded6ca] bg-[#fbfaf7]/95 p-4">
            <div className="mb-3 text-xs font-semibold tracking-[0.22em] text-[#c8a873]">PAGES</div>
            <div className="space-y-2 overflow-auto pr-1" style={{ maxHeight: 'calc(100vh - 96px)' }}>
              {pages.map((item, index) => (
                <button
                  key={`${item.title}-${index}`}
                  type="button"
                  onClick={() => setNextPage(item.page || index + 1)}
                  className={`block w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                    page === (item.page || index + 1)
                      ? 'border-[#80a89c] bg-[#e8f0ea] text-[#2f6f62]'
                      : 'border-[#e7dfd3] bg-white/75 text-[#655d54] hover:border-[#c8a873]'
                  }`}
                >
                  <span className="block text-xs text-[#c8a873]">{isPdf ? `Page ${item.page || index + 1}` : `Section ${index + 1}`}</span>
                  <span className="line-clamp-2">{item.title}</span>
                </button>
              ))}
            </div>
          </aside>
        )}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 items-center justify-between border-b border-[#e4dace] bg-[#f6f3ef] px-5">
            <div className="min-w-0">
              <div className="truncate font-serif text-lg font-semibold">{name}</div>
              <div className="text-xs text-[#8b8277]">{preview?.extension?.toUpperCase() || type || 'DOCUMENT'}</div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e0d5c5] bg-white/85 text-[#467466] shadow-sm transition hover:bg-[#f2e8dc] hover:text-[#9b7441]"
              onClick={() => setFullscreen(false)}
              title="退出全屏"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-6">{renderPreviewContent(true)}</div>
          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[#ded6ca] bg-white/90 px-2 py-1.5 shadow-lg backdrop-blur">
            <button type="button" className={toolbarButton} onClick={() => setShowPages(!showPages)} title="页面预览">
              <PanelLeft size={17} />
            </button>
            <button type="button" className={toolbarButton} onClick={() => setNextPage(page - 1)} title="上一页">
              <ChevronUp size={17} />
            </button>
            <span className="min-w-[72px] text-center text-sm font-medium text-[#4f4740]">{page}/{pageCount}</span>
            <button type="button" className={toolbarButton} onClick={() => setNextPage(page + 1)} title="下一页">
              <ChevronDown size={17} />
            </button>
            <button type="button" className={toolbarButton} onClick={() => setZoom(Math.max(50, zoom - 10))} title="缩小">
              <ZoomOut size={17} />
            </button>
            <button type="button" className={toolbarButton} onClick={() => setZoom(Math.min(200, zoom + 10))} title="放大">
              <ZoomIn size={17} />
            </button>
            <button type="button" className={toolbarButton} onClick={print} title="打印">
              <Printer size={17} />
            </button>
            <button type="button" className={toolbarButton} title="演示视图">
              <MonitorPlay size={17} />
            </button>
            <button type="button" className={toolbarButton} onClick={download} title="下载">
              <Download size={17} />
            </button>
          </div>
        </main>
      </div>,
      document.body,
    );
  };

  return (
    <div className="group/document relative rounded-2xl border border-[#ded6ca] bg-[#fffdfa]/82 shadow-[0_16px_40px_rgba(72,58,45,0.08)]" contentEditable={false}>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end p-2 opacity-0 transition group-hover/document:opacity-100">
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-[#e2d8ca] bg-white/92 px-1.5 py-1 shadow-sm backdrop-blur">
          <button className={`${toolbarButton} cursor-grab active:cursor-grabbing`} data-drag-handle type="button" title="拖拽">
            <GripVertical size={16} />
          </button>
          <button className={toolbarButton} type="button" onClick={() => setFullscreen(true)} title="全屏浏览">
            <Maximize2 size={16} />
          </button>
          <button className={toolbarButton} type="button" onClick={download} title="下载">
            <Download size={16} />
          </button>
          <button className={toolbarButton} type="button" onClick={() => setCachedViewMode('card')} title="卡片视图">
            <Rows3 size={16} />
          </button>
          <button className={toolbarButton} type="button" onClick={() => setCachedViewMode('preview')} title="预览视图">
            <FileText size={16} />
          </button>
          <button className={`${toolbarButton} hover:bg-[#f9e8e3] hover:text-[#a15a50]`} type="button" onClick={onDelete} title="删除">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {sessionViewMode === 'preview' && canAttemptPreview ? (
        <div className="overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-[#e7dfd3] bg-[#fbfaf7]/80 px-5 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[#2b2b2b]">{name}</div>
              <div className="text-xs text-[#8b8277]">{size ? formatFileSize(size) : type || '文档预览'}</div>
            </div>
            <button type="button" className="rounded-full border border-[#d8c9b5] px-3 py-1 text-xs text-[#9b7441] hover:bg-[#f6efe4]" onClick={() => setCachedViewMode('card')}>
              卡片
            </button>
          </div>
          <div className="h-[520px] bg-white/70">{renderPreviewContent(false)}</div>
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center gap-4 rounded-2xl p-4 text-left transition hover:bg-[#f8f4ee]"
          onClick={() => (canAttemptPreview ? setCachedViewMode('preview') : api.openFile(absoluteSrc))}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#ded6ca] bg-[#f6f3ef] text-[#5f9185] shadow-sm">
            <FileText size={24} strokeWidth={1.6} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-[#2b2b2b]">{name}</div>
            <div className="mt-1 flex items-center gap-3 text-xs text-[#8b8277]">
              {size ? <span>{formatFileSize(size)}</span> : null}
              <span className="rounded-full bg-[#f1ebe2] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8b8277]">
                {type?.split('/').pop() || name.split('.').pop() || 'file'}
              </span>
              {canAttemptPreview ? <span className="text-[#5f9185]">点击预览</span> : <span>点击打开</span>}
            </div>
          </div>
        </button>
      )}
      {renderFullscreen()}
    </div>
  );
}
