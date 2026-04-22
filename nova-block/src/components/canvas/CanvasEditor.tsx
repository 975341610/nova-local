import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  NodeResizeControl,
  PanOnScrollMode,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type Node,
  type NodeProps,
  type OnSelectionChangeParams,
  type Viewport,
} from '@xyflow/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FileText,
  LayoutGrid,
  Link2,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  X,
  File as FileIcon,
  FolderPlus,
  ExternalLink,
  Globe,
  HardDrive,
  Lock,
  LockOpen,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Palette,
  Unlink
} from 'lucide-react';
import type { Note } from '../../lib/types';
import { BaseNode } from './BaseNode';
import { api, formatUrl } from '../../lib/api';
import { promptCompat } from '../../lib/promptCompat';
import { useNoteStore } from '../../store/useNoteStore';
import {
  GROUP_NODE_TYPE,
  LINK_NODE_TYPE,
  MEDIA_NODE_TYPE,
  REFERENCE_NODE_TYPE,
  TEXT_NODE_TYPE,
  injectRuntimeIntoCanvasNode,
  parseCanvasContent,
  resolveCanvasDragActivity,
  shouldHydrateCanvasFromIncomingNote,
  shouldPersistViewport,
  summarizeNote,
  type RuntimeInjectionContext,
} from './canvasState';

type CanvasTextNodeData = {
  title: string;
  body: string;
  memo?: string;
  // 仅用于运行时注入，序列化时会剥离
  onChange?: (id: string, patch: { title?: string; body?: string; memo?: string }) => void;
  onInfoClick?: (id: string) => void;
};

type CanvasReferenceNodeData = {
  noteId: number;
  title: string;
  icon: string;
  summary: string;
  tags: string[];
  memo?: string;
  onChange?: (id: string, patch: { memo?: string }) => void;
  onInfoClick?: (id: string) => void;
};

type CanvasMediaNodeData = {
  url: string;
  type: 'image' | 'video' | 'file' | 'audio' | 'embed';
  title?: string;
  memo?: string;
  source?: 'local' | 'online';
  onChange?: (id: string, patch: { memo?: string }) => void;
  onInfoClick?: (id: string) => void;
};

type CanvasLinkNodeData = {
  url: string;
  title?: string;
  memo?: string;
  source?: 'local' | 'online';
  onChange?: (id: string, patch: { memo?: string }) => void;
  onInfoClick?: (id: string) => void;
};

type CanvasGroupNodeData = {
  label?: string;
  collapsed?: boolean;
  expandedHeight?: number;
  // 仅用于运行时注入，序列化时会剥离
  onChange?: (id: string, patch: { label?: string; collapsed?: boolean; expandedHeight?: number }) => void;
  onToggleCollapse?: (id: string) => void;
  onUngroup?: (id: string) => void;
};

type CanvasTextNode = Node<CanvasTextNodeData, 'canvas-text-card'>;
type CanvasReferenceNode = Node<CanvasReferenceNodeData, 'canvas-note-reference'>;
type CanvasMediaNode = Node<CanvasMediaNodeData, 'canvas-media-node'>;
type CanvasLinkNode = Node<CanvasLinkNodeData, 'canvas-link-node'>;
type CanvasGroupNode = Node<CanvasGroupNodeData, 'groupNode'>;

type CanvasNode = CanvasTextNode | CanvasReferenceNode | CanvasMediaNode | CanvasLinkNode | CanvasGroupNode;

type CanvasEditorProps = {
  note: Note | null;
  onSave: (payload: Partial<Note>) => Promise<Partial<Note> | void> | void;
  onNotify?: (text: string, tone: 'success' | 'error' | 'info') => void;
};

const isLocalUploadedFile = (url: string | undefined | null, source?: 'local' | 'online') => {
  if (!url) return false;
  if (source === 'local') return true;
  return url.includes('/api/media/static/files/') || url.includes('/media/static/files/');
};

const openUrlSmartly = async (url: string | undefined | null, source?: 'local' | 'online') => {
  if (!url) return;

  if (isLocalUploadedFile(url, source)) {
    try {
      await api.openFile(url);
      return;
    } catch (err) {
      console.warn('[CanvasEditor] api.openFile failed, fallback to window.open', err);
    }
  }

  window.open(formatUrl(url), '_blank');
};

const createTextNode = (id: string, x: number, y: number, parentId?: string): CanvasTextNode => ({
  id,
  type: TEXT_NODE_TYPE,
  position: { x, y },
  parentId,
  extent: parentId ? 'parent' : undefined,
  data: {
    title: '灵感便签',
    body: '',
    onChange: () => undefined,
  },
  dragHandle: '.canvas-card-drag-handle',
  style: { width: 280, height: 260 },
});

const createReferenceNode = (id: string, sourceNote: Note, x: number, y: number, parentId?: string): CanvasReferenceNode => ({
  id,
  type: REFERENCE_NODE_TYPE,
  position: { x, y },
  parentId,
  extent: parentId ? 'parent' : undefined,
  data: {
    noteId: sourceNote.id,
    title: sourceNote.title || '无标题笔记',
    icon: sourceNote.icon || '📝',
    summary: summarizeNote(sourceNote),
    tags: sourceNote.tags || [],
  },
  dragHandle: '.canvas-card-drag-handle',
  style: { width: 320, height: 160 },
});

const createMediaNode = (id: string, url: string, type: 'image' | 'video' | 'file' | 'audio' | 'embed', title: string, x: number, y: number, source: 'local' | 'online' = 'local', parentId?: string): CanvasMediaNode => ({
  id,
  type: MEDIA_NODE_TYPE,
  position: { x, y },
  parentId,
  extent: parentId ? 'parent' : undefined,
  data: { url, type, title, source },
  style: { width: 300, height: 200 },
});

const createLinkNode = (id: string, url: string, title: string, x: number, y: number, source: 'local' | 'online' = 'online', parentId?: string): CanvasLinkNode => ({
  id,
  type: LINK_NODE_TYPE,
  position: { x, y },
  parentId,
  extent: parentId ? 'parent' : undefined,
  data: { url, title, source },
  style: { width: 300, height: 80 },
});


function TextCardNode(props: NodeProps<CanvasTextNode>) {
  const { id, data, selected } = props;
  return (
    <BaseNode {...props} onInfoClick={data.onInfoClick}>
      <div
        className={`group h-full flex flex-col rounded-[28px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(255,248,240,0.92))] shadow-[0_20px_70px_-28px_rgba(244,173,138,0.55),0_10px_24px_-16px_rgba(92,74,58,0.25)] backdrop-blur-xl transition-all duration-300 ${
          selected ? 'ring-2 ring-[#e7b28a]/70 shadow-[0_24px_80px_-26px_rgba(231,178,138,0.7),0_16px_34px_-18px_rgba(109,78,56,0.28)]' : ''
        }`}
      >
        <div className="canvas-card-drag-handle flex items-center justify-between gap-3 rounded-t-[28px] border-b border-[#efd8c5]/80 bg-[linear-gradient(90deg,rgba(255,236,223,0.95),rgba(255,247,240,0.9))] px-4 py-3 cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-2 text-[#8c5b3b]">
            <StickyNote size={15} />
            <span className="text-xs font-semibold tracking-[0.16em] uppercase">文本卡片</span>
          </div>
          <div className="h-2.5 w-2.5 rounded-full bg-[#f4b78f] shadow-[0_0_0_6px_rgba(244,183,143,0.16)]" />
        </div>
        <div className="flex-1 space-y-3 px-4 pb-4 pt-3 overflow-hidden">
          <input
            value={data.title}
            onChange={(event) => data.onChange?.(id, { title: event.target.value })}
            placeholder="写下这张卡片的标题"
            className="w-full rounded-2xl border border-transparent bg-white/70 px-3 py-2 text-sm font-semibold text-[#5f4330] outline-none transition focus:border-[#edc7a9] focus:bg-white"
          />
          <textarea
            value={data.body}
            onChange={(event) => data.onChange?.(id, { body: event.target.value })}
            placeholder="记录零散灵感、任务拆解、会议要点……"
            className="h-[calc(100%-48px)] w-full resize-none rounded-[22px] border border-transparent bg-[#fffdfa]/88 px-3 py-3 text-sm leading-6 text-[#6f5a4d] outline-none transition focus:border-[#edd6c3] focus:bg-white"
          />
        </div>
      </div>
    </BaseNode>
  );
}

function ReferenceCardNode(props: NodeProps<CanvasReferenceNode>) {
  const { data, selected } = props;
  return (
    <BaseNode {...props} onInfoClick={data.onInfoClick}>
      <div
        className={`group h-full flex flex-col rounded-[30px] border border-[#dbe9f4] bg-[linear-gradient(145deg,rgba(244,250,255,0.95),rgba(255,255,255,0.92))] shadow-[0_24px_80px_-32px_rgba(136,190,235,0.55),0_12px_26px_-18px_rgba(80,113,141,0.22)] backdrop-blur-xl transition-all duration-300 ${
          selected ? 'ring-2 ring-[#9fc9ea]/70 shadow-[0_28px_90px_-34px_rgba(136,190,235,0.7),0_16px_34px_-18px_rgba(80,113,141,0.26)]' : ''
        }`}
      >
        <div className="canvas-card-drag-handle flex items-center justify-between gap-3 rounded-t-[30px] border-b border-[#d8e8f4] bg-[linear-gradient(90deg,rgba(231,244,255,0.95),rgba(245,250,255,0.92))] px-4 py-3 cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-2 text-[#4a7fa8]">
            <Link2 size={15} />
            <span className="text-xs font-semibold tracking-[0.16em] uppercase">笔记引用</span>
          </div>
          <div className="rounded-full border border-[#cfe4f4] bg-white/80 px-2.5 py-1 text-[11px] font-medium text-[#5a84a4]">#{data.noteId}</div>
        </div>
        <div className="flex-1 space-y-3 px-4 pb-4 pt-3 overflow-hidden">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#fef6ef,#f6fbff)] text-xl shadow-inner">
              {data.icon || '📝'}
            </div>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('nova-select-note', { detail: { noteId: data.noteId } }));
                }}
                title="点击打开笔记"
                className="truncate text-left text-sm font-semibold text-[#35546d] transition hover:text-[#2f6d96] hover:underline"
              >
                {data.title || '无标题笔记'}
              </button>
              <div className="mt-1 text-xs leading-5 text-[#6d8496]">{data.summary}</div>
            </div>
          </div>
          {data.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[#dcebf7] bg-white/80 px-2.5 py-1 text-[11px] font-medium text-[#5d85a6]"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
}

function MediaNode(props: NodeProps<CanvasMediaNode>) {
  const { data, selected } = props;
  const [isInteractive, setIsInteractive] = useState(false);

  return (
    <BaseNode {...props} onInfoClick={data.onInfoClick}>
      <div
        className={`group relative h-full w-full overflow-hidden rounded-3xl border border-white/80 shadow-xl transition-all duration-300 ${
          selected ? 'ring-2 ring-primary/70' : ''
        } ${data.type === 'embed' ? 'bg-black' : 'bg-white/90'}`}
      >
        {data.type === 'image' && (
          <img src={formatUrl(data.url)} alt={data.title} className="h-full w-full object-cover" draggable={false} />
        )}
        {data.type === 'video' && (
          <video src={formatUrl(data.url)} controls muted playsInline className="h-full w-full object-cover" />
        )}
        {data.type === 'audio' && (
          <div className="flex h-full w-full flex-col items-center justify-center p-4">
            <audio src={formatUrl(data.url)} controls className="w-full" />
            <div className="mt-2 text-sm font-medium text-foreground truncate w-full text-center">{data.title || '音频文件'}</div>
          </div>
        )}
        {data.type === 'embed' && (
          <div className="relative h-full w-full">
            {!isInteractive && (
              <div 
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/5 hover:bg-black/10 cursor-pointer transition-colors backdrop-blur-[1px]" 
                title="点击解锁播放器交互" 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsInteractive(true);
                }}
              >
                <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Lock size={12} /> 点击解锁播放
                </div>
              </div>
            )}
            <iframe 
              src={data.url} 
              className="absolute inset-0 w-full h-full" 
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            />
            {isInteractive && (
              <button 
                className="absolute top-3 right-3 z-20 p-1.5 rounded bg-white/90 shadow-sm hover:bg-blue-50 text-blue-500 transition-colors opacity-0 group-hover:opacity-100" 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsInteractive(false);
                }}
                title="锁定交互 (方便拖拽排版)"
              >
                <LockOpen size={14} />
              </button>
            )}
          </div>
        )}
        {data.type === 'file' && (
          <div
            className="flex h-full w-full flex-col items-center justify-center p-4 text-center cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              void openUrlSmartly(data.url, data.source);
            }}
          >
            <FileIcon size={40} className="mb-2 text-primary/60" />
            <div className="text-sm font-medium text-foreground truncate w-full">{data.title || '未知文件'}</div>
            <button
              type="button"
              className="mt-2 text-xs text-primary underline"
              onClick={(e) => {
                e.stopPropagation();
                void openUrlSmartly(data.url, data.source);
              }}
            >
              下载预览
            </button>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-black/40 px-3 py-2 text-xs text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity truncate">
          {data.title || data.url}
        </div>
      </div>
    </BaseNode>
  );
}

function LinkNode(props: NodeProps<CanvasLinkNode>) {
  const { data, selected } = props;
  return (
    <BaseNode {...props} onInfoClick={data.onInfoClick}>
      <a 
        href={data.url} 
        target="_blank" 
        rel="noreferrer"
        className={`group flex h-full items-center gap-3 rounded-2xl border border-white/80 bg-white/90 px-4 shadow-lg transition-all duration-300 hover:bg-white ${
          selected ? 'ring-2 ring-primary/70' : ''
        }`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Link2 size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{data.title || data.url}</div>
          <div className="truncate text-[10px] text-muted-foreground">{data.url}</div>
        </div>
      </a>
    </BaseNode>
  );
}

function GroupNode(props: NodeProps<CanvasGroupNode>) {
  const { id, data, selected } = props;
  const isCollapsed = !!data.collapsed;
  const [draftLabel, setDraftLabel] = useState(data.label ?? '');

  useEffect(() => {
    setDraftLabel(data.label ?? '');
  }, [data.label]);

  const commitLabel = useCallback(() => {
    const next = (draftLabel || '').trim() || '新分组';
    if (next !== (data.label ?? '')) {
      data.onChange?.(id, { label: next });
    }
  }, [data.label, data.onChange, draftLabel, id]);

  return (
    <div
      className={`group canvas-group-drag-handle h-full w-full rounded-[32px] border-2 border-dashed transition-all duration-300 ${
        selected ? 'border-[#d7a685] bg-[#d7a685]/5 shadow-lg' : 'border-[#d7a685]/30 bg-[#d7a685]/2'
      }`}
    >
      {/* Resizing handles for group */}
      <NodeResizeControl
        minWidth={200}
        minHeight={isCollapsed ? 40 : 100}
        position={'bottom-right' as any}
        className="!border-none !bg-transparent !p-2 !w-6 !h-6 !flex !items-end !justify-end -bottom-2 -right-2 z-50 cursor-se-resize"
      >
        <div className={`h-3 w-3 rounded-full border-2 border-[#d7a685] bg-white transition-opacity ${selected ? 'opacity-100' : 'opacity-0'}`} />
      </NodeResizeControl>

      <div className="absolute -top-4 left-4 right-4 flex items-center justify-between pointer-events-auto z-[60]">
        <div className="canvas-group-drag-handle flex items-center gap-1.5 rounded-full bg-[#d7a685] pl-2 pr-3 py-1 shadow-md transition-all hover:scale-[1.02] border border-white/20 cursor-grab active:cursor-grabbing">
          <div
            className="mr-0.5 flex h-5 w-5 items-center justify-center text-white/90"
            title="分组"
          >
            <LayoutGrid size={14} />
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleCollapse?.(id);
            }}
            className="nodrag text-white/90 hover:text-white transition-colors"
            title={isCollapsed ? '展开分组' : '收纳分组'}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>

          <input
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onBlur={() => commitLabel()}
            placeholder="新分组"
            className="nodrag w-32 bg-transparent text-[11px] font-bold text-white outline-none placeholder:text-white/60"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitLabel();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onUngroup?.(id);
          }}
          className={`nodrag flex h-7 w-7 items-center justify-center rounded-full border border-white/50 bg-white text-[#d7a685] shadow-md transition-all hover:bg-red-50 hover:text-red-500 ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          title="解散分组 (保留内容)"
        >
          <Unlink size={14} />
        </button>
      </div>
    </div>
  );
}

function NotePickerModal({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (note: Note) => void;
}) {
  const notes = useNoteStore(state => state.notes);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredNotes = useMemo(() => {
    const available = notes.filter((item) => !item.is_folder);
    if (!query.trim()) return available.slice(0, 12);

    const q = query.toLowerCase();
    return available
      .filter((item) => item.title.toLowerCase().includes(q) || summarizeNote(item).toLowerCase().includes(q) || (item.tags || []).some((tag) => tag.toLowerCase().includes(q)))
      .slice(0, 12);
  }, [notes, query]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(filteredNotes.length, 1));
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + Math.max(filteredNotes.length, 1)) % Math.max(filteredNotes.length, 1));
      }

      if (event.key === 'Enter' && filteredNotes[selectedIndex]) {
        event.preventDefault();
        onSelect(filteredNotes[selectedIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredNotes, isOpen, onClose, onSelect, selectedIndex]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-start justify-center bg-[#fff9f4]/55 px-4 pt-[12vh] backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-2xl overflow-hidden rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,248,244,0.93))] shadow-[0_30px_120px_-36px_rgba(240,170,140,0.55)]"
          >
            <div className="flex items-center gap-3 border-b border-[#f2dfcf] px-5 py-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#fff1e6,#eff8ff)] text-[#c17e55] shadow-inner">
                <Search size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[#6e4b35]">添加笔记引用</div>
                <div className="text-xs text-[#9f826f]">搜索标题、摘要或标签，选中后立即落点到画布</div>
              </div>
              <button
                onClick={onClose}
                className="rounded-2xl border border-[#f0dfd4] bg-white/80 p-2 text-[#9a7a66] transition hover:border-[#ebc9b1] hover:text-[#7a5238]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="border-b border-[#f4e5da] px-5 py-4">
              <div className="flex items-center gap-3 rounded-[24px] border border-[#f0dfd4] bg-white/85 px-4 py-3 shadow-[0_10px_26px_-22px_rgba(213,155,117,0.5)]">
                <Search size={16} className="text-[#c28b65]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelectedIndex(0);
                  }}
                  placeholder="搜索想嵌入到画布里的笔记..."
                  className="w-full bg-transparent text-sm text-[#5b4333] outline-none placeholder:text-[#b09280]"
                />
              </div>
            </div>

            <div className="max-h-[48vh] overflow-y-auto px-3 py-3">
              {filteredNotes.length > 0 ? (
                <div className="space-y-2">
                  {filteredNotes.map((item, index) => (
                    <button
                      key={item.id}
                      onClick={() => onSelect(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full rounded-[24px] border px-4 py-3 text-left transition-all ${
                        index === selectedIndex
                          ? 'border-[#edd0b7] bg-[linear-gradient(135deg,rgba(255,242,233,0.96),rgba(239,248,255,0.96))] shadow-[0_16px_34px_-28px_rgba(215,160,120,0.65)]'
                          : 'border-transparent bg-white/70 hover:border-[#f0dfd4] hover:bg-white/90'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#fff6ef,#eef8ff)] text-lg shadow-inner">
                          {item.icon || '📝'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-[#5a4232]">{item.title || '无标题笔记'}</div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-[#8f7768]">{summarizeNote(item)}</div>
                          {item.tags?.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.tags.slice(0, 4).map((tag) => (
                                <span key={tag} className="rounded-full bg-[#f7efe7] px-2 py-1 text-[10px] font-medium text-[#9c775e]">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center text-[#9e846f]">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(145deg,#fff1e8,#f2f8ff)] text-[#cb8d65] shadow-inner">
                    <FileText size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[#6e4e3a]">没有找到匹配的笔记</div>
                    <div className="mt-1 text-xs">可以换个关键词，或者先在侧边栏创建一篇新笔记。</div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function MemoDrawer({ nodeId, nodes, onClose, onChange }: { 
  nodeId: string | null; 
  nodes: CanvasNode[]; 
  onClose: () => void; 
  onChange: (id: string, patch: any) => void 
}) {
  const node = useMemo(() => nodes.find(n => n.id === nodeId), [nodeId, nodes]);
  if (!node) return null;

  return (
    <AnimatePresence>
      {nodeId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[120] bg-black/10 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 z-[130] h-full w-80 border-l border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,244,0.96))] p-6 shadow-[-20px_0_50px_rgba(0,0,0,0.05)] backdrop-blur-xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#6e4b35]">
                <Sparkles size={18} />
                <h3 className="text-sm font-semibold">节点备注</h3>
              </div>
              <button onClick={onClose} className="rounded-full p-1 hover:bg-black/5 text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">关联内容</label>
                <div className="rounded-xl bg-black/2 p-3 text-xs text-[#5a4232]">
                  {(node.data as any).title || '无标题节点'}
                </div>
              </div>

              {/* URL and Source Section */}
              {((node.data as any).url) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">资源信息</label>
                    <div className="flex items-center gap-1.5 rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-semibold text-[#8a5d3f]">
                      {(node.data as any).source === 'online' ? (
                        <><Globe size={10} /> 在线</>
                      ) : (
                        <><HardDrive size={10} /> 本地</>
                      )}
                    </div>
                  </div>
                  
                  <div className="group relative overflow-hidden rounded-xl bg-white/50 border border-[#f0dfd4]">
                    <div className="truncate px-3 py-2.5 text-[11px] text-[#7a5a42]">
                      {(node.data as any).url}
                    </div>
                  </div>

                  <button
                    onClick={() => void openUrlSmartly((node.data as any).url, (node.data as any).source)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#fff3ea] px-4 py-2.5 text-xs font-semibold text-[#c17e55] transition-colors hover:bg-[#ffe6d3]"
                  >
                    <ExternalLink size={14} />
                    一键打开 / 跳转
                  </button>
                </div>
              )}

              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">备注 (Data.memo)</label>
                <textarea
                  value={(node.data as any).memo || ''}
                  onChange={(e) => onChange(node.id, { memo: e.target.value })}
                  placeholder="在此输入对该节点的详细补充说明，支持自动保存..."
                  className="min-h-[200px] w-full resize-none rounded-2xl border border-[#f0dfd4] bg-white/50 p-4 text-sm leading-relaxed text-[#5a4232] outline-none focus:border-primary/50 focus:bg-white transition-all"
                />
              </div>
            </div>
            
            <div className="absolute bottom-10 left-6 right-6 text-center text-[10px] text-muted-foreground">
              修改后将实时同步至画布数据模型
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SelectionToolbar({ selectedNodes, onGroup, onRemove }: { selectedNodes: Node[]; onGroup: () => void; onRemove: () => void }) {
  if (selectedNodes.length < 2) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.75),rgba(17,24,39,0.45))] p-1.5 shadow-[0_18px_60px_-22px_rgba(0,0,0,0.55)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold text-slate-200/70 uppercase tracking-[0.14em]">
        <span className="opacity-70">Selected</span>
        <span className="flex h-4 min-w-[16px] items-center justify-center rounded bg-white/10 px-1 text-[10px] text-slate-100">
          {selectedNodes.length}
        </span>
      </div>

      <div className="mx-1 h-4 w-px bg-white/10" />

      <div className="flex items-center gap-1">
        <button
          onClick={onGroup}
          title="编组 (Group)"
          aria-label="编组 (Group)"
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-slate-100 transition-all duration-200 hover:bg-emerald-400/15 hover:text-emerald-200 hover:scale-105 active:scale-95"
        >
          <FolderPlus size={16} strokeWidth={2.5} />
        </button>
        <button
          onClick={onRemove}
          title="批量删除选中项"
          aria-label="批量删除选中项"
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-rose-300 transition-all duration-200 hover:bg-rose-500/20 hover:text-rose-200 hover:scale-105 active:scale-95"
        >
          <Trash2 size={16} strokeWidth={2.5} />
        </button>
      </div>
    </motion.div>
  );
}

function CanvasBoard({ note, onSave, onNotify }: CanvasEditorProps) {
  const notes = useNoteStore(state => state.notes);
  const noteLookup = useMemo(() => new Map(notes.map((item) => [item.id, item] as const)), [notes]);
  const parsedContent = useMemo(() => parseCanvasContent(note?.content), [note?.content]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(parsedContent.nodes as CanvasNode[]);
  const [persistedNodes, setPersistedNodes] = useState<CanvasNode[]>(parsedContent.nodes as CanvasNode[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(parsedContent.edges);
  const [viewport, setViewport] = useState<Viewport>(parsedContent.viewport ?? { x: 0, y: 0, zoom: 1 });
  const [backgroundUrl, setBackgroundUrl] = useState<string | undefined>(parsedContent.backgroundUrl);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [pickerMode, setPickerMode] = useState<'toolbar' | 'context' | null>(null);
  const [contextMenu, setContextMenu] = useState<{ 
    x: number; 
    y: number; 
    flowX: number; 
    flowY: number; 
    groupId: string | null;
    clickedNodeId?: string | null;
  } | null>(null);
  const [selection, setSelection] = useState<OnSelectionChangeParams<CanvasNode>>({ nodes: [], edges: [] });
  const [memoOpenId, setMemoOpenId] = useState<string | null>(null);

  const handleSelectionChange = useCallback(
    (params: OnSelectionChangeParams<CanvasNode>) => {
      setSelection(params);
    },
    [setSelection],
  );

  const handleNodesChange = useCallback(
    (changes: any[]) => {
      const dragActivity = resolveCanvasDragActivity(changes);
      if (typeof dragActivity === 'boolean') {
        isNodeDragActiveRef.current = dragActivity;
      }
      onNodesChange(changes);
    },
    [onNodesChange],
  );
  const [isDraggingNoteFromSidebar, setIsDraggingNoteFromSidebar] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const reactFlow = useReactFlow();
  const saveTimerRef = useRef<number | null>(null);
  const idRef = useRef(0);
  const pendingDropPositionRef = useRef<{ x: number; y: number } | null>(null);
  const pendingDropGroupIdRef = useRef<string | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const lastLoadedNoteIdRef = useRef<number | null>(null);
  const lastLoadedNoteContentRef = useRef<string | null>(null);
  const isNodeDragActiveRef = useRef(false);

  const handleInfoClick = useCallback((id: string) => {
    setMemoOpenId(id);
  }, []);

  const updateNodeData = useCallback((id: string, patch: any) => {
    setNodes((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          data: {
            ...item.data,
            ...patch,
          },
        };
      }),
    );
  }, [setNodes]);

  const COLLAPSED_GROUP_HEIGHT = 40;

  const handleUngroup = useCallback((groupId: string) => {
    setNodes((nds) => {
      const nodeMap = new Map(nds.map((n) => [n.id, n] as const));
      const absCache = new Map<string, { x: number; y: number }>();

      const getAbsPos = (node: any): { x: number; y: number } => {
        const cached = absCache.get(node.id);
        if (cached) return cached;

        const direct = node.positionAbsolute;
        if (direct && Number.isFinite(direct.x) && Number.isFinite(direct.y)) {
          const pos = { x: direct.x, y: direct.y };
          absCache.set(node.id, pos);
          return pos;
        }

        let x = node.position?.x ?? 0;
        let y = node.position?.y ?? 0;

        if (node.parentId) {
          const parent: any = nodeMap.get(node.parentId);
          if (parent) {
            const pAbs = getAbsPos(parent);
            x += pAbs.x;
            y += pAbs.y;
          }
        }

        const pos = { x, y };
        absCache.set(node.id, pos);
        return pos;
      };

      const groupNode: any = nodeMap.get(groupId);
      if (!groupNode) return nds;

      return nds
        .filter((n) => n.id !== groupId)
        .map((n: any) => {
          if (n.parentId === groupId) {
            const abs = getAbsPos(n);
            return {
              ...n,
              parentId: undefined,
              extent: undefined,
              hidden: false,
              position: abs,
            };
          }
          return n;
        });
    });
    onNotify?.('已解散分组', 'info');
  }, [setNodes, onNotify]);

  const handleToggleCollapse = useCallback((id: string) => {
    setNodes((nds) => {
      const group = nds.find((n) => n.id === id && n.type === GROUP_NODE_TYPE) as CanvasGroupNode | undefined;
      if (!group) return nds;

      const nextCollapsed = !group.data.collapsed;
      const currentHeight = (group.measured?.height ?? (group.style as any)?.height ?? 200) as number;
      const expandedHeight = nextCollapsed ? currentHeight : (group.data.expandedHeight ?? currentHeight);
      const nextHeight = nextCollapsed ? COLLAPSED_GROUP_HEIGHT : expandedHeight;

      return nds.map((n: any) => {
        if (n.id === id) {
          return {
            ...n,
            // xyflow 对节点尺寸有多套来源（height/style/measured），这里同时更新 height + style.height，确保虚线框真实收纳。
            height: nextHeight,
            data: {
              ...n.data,
              collapsed: nextCollapsed,
              expandedHeight,
            },
            style: {
              ...n.style,
              height: nextHeight,
              minHeight: nextCollapsed ? COLLAPSED_GROUP_HEIGHT : undefined,
            },
          };
        }

        if (n.parentId === id) {
          return {
            ...n,
            hidden: nextCollapsed,
          };
        }

        return n;
      });
    });
  }, [setNodes]);

  const injectRuntimeNode = useCallback(
    (node: CanvasNode) =>
      injectRuntimeIntoCanvasNode(node as Node<Record<string, unknown>, string>, {
        linkedNotesById: noteLookup,
        onChange: updateNodeData as RuntimeInjectionContext['onChange'],
        onInfoClick: handleInfoClick,
        onUngroup: handleUngroup,
        onToggleCollapse: handleToggleCollapse,
      }) as CanvasNode,
    [noteLookup, updateNodeData, handleInfoClick, handleUngroup, handleToggleCollapse],
  );

  const handleRemoveFromGroup = useCallback((nodeId: string) => {
    setNodes((prev) => {
      const nodeMap = new Map(prev.map((n) => [n.id, n] as const));
      const absCache = new Map<string, { x: number; y: number }>();

      const getAbsPos = (node: any): { x: number; y: number } => {
        const cached = absCache.get(node.id);
        if (cached) return cached;

        const direct = node.positionAbsolute;
        if (direct && Number.isFinite(direct.x) && Number.isFinite(direct.y)) {
          const pos = { x: direct.x, y: direct.y };
          absCache.set(node.id, pos);
          return pos;
        }

        let x = node.position?.x ?? 0;
        let y = node.position?.y ?? 0;

        if (node.parentId) {
          const parent: any = nodeMap.get(node.parentId);
          if (parent) {
            const pAbs = getAbsPos(parent);
            x += pAbs.x;
            y += pAbs.y;
          }
        }

        const pos = { x, y };
        absCache.set(node.id, pos);
        return pos;
      };

      const node: any = nodeMap.get(nodeId);
      if (!node || !node.parentId) return prev;

      const abs = getAbsPos(node);
      return prev.map((n: any) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          parentId: undefined,
          extent: undefined,
          hidden: false,
          position: abs,
        };
      });
    });

    setContextMenu(null);
    onNotify?.('已移出分组', 'info');
  }, [setNodes, setContextMenu, onNotify]);

  const handleMoveIntoGroup = useCallback((nodeId: string, groupId: string) => {
    setNodes((prev) => {
      const nodeMap = new Map(prev.map((n) => [n.id, n] as const));
      const absCache = new Map<string, { x: number; y: number }>();

      const getAbsPos = (node: any): { x: number; y: number } => {
        const cached = absCache.get(node.id);
        if (cached) return cached;

        const direct = node.positionAbsolute;
        if (direct && Number.isFinite(direct.x) && Number.isFinite(direct.y)) {
          const pos = { x: direct.x, y: direct.y };
          absCache.set(node.id, pos);
          return pos;
        }

        let x = node.position?.x ?? 0;
        let y = node.position?.y ?? 0;

        if (node.parentId) {
          const parent: any = nodeMap.get(node.parentId);
          if (parent) {
            const pAbs = getAbsPos(parent);
            x += pAbs.x;
            y += pAbs.y;
          }
        }

        const pos = { x, y };
        absCache.set(node.id, pos);
        return pos;
      };

      const node: any = nodeMap.get(nodeId);
      const group: any = nodeMap.get(groupId);
      if (!node || !group || group.type !== GROUP_NODE_TYPE) return prev;

      const nodeAbs = getAbsPos(node);
      const groupAbs = getAbsPos(group);
      const shouldHide = !!group.data?.collapsed;

      return prev.map((n: any) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          parentId: groupId,
          extent: 'parent' as const,
          hidden: shouldHide,
          position: {
            x: nodeAbs.x - groupAbs.x,
            y: nodeAbs.y - groupAbs.y,
          },
        };
      });
    });

    setContextMenu(null);
    onNotify?.('已移入分组', 'success');
  }, [setNodes, setContextMenu, onNotify]);

  const onNodeDragStop = useCallback((_: any, node: Node) => {
    isNodeDragActiveRef.current = false;
    if (node.type === GROUP_NODE_TYPE) return;

    setNodes((nds) => {
      const nodeMap = new Map(nds.map((n) => [n.id, n] as const));
      const absCache = new Map<string, { x: number; y: number }>();

      const toNumber = (value: unknown, fallback = 0) => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        }
        return fallback;
      };

      const getNodeSize = (n: any) => {
        const width = toNumber(n.measured?.width ?? n.width ?? (n.style as any)?.width, 0);
        const height = toNumber(n.measured?.height ?? n.height ?? (n.style as any)?.height, 0);
        return { width, height };
      };

      const getAbsPos = (n: any): { x: number; y: number } => {
        const cached = absCache.get(n.id);
        if (cached) return cached;

        const direct = n.positionAbsolute;
        if (direct && Number.isFinite(direct.x) && Number.isFinite(direct.y)) {
          const pos = { x: direct.x, y: direct.y };
          absCache.set(n.id, pos);
          return pos;
        }

        let x = n.position?.x ?? 0;
        let y = n.position?.y ?? 0;

        if (n.parentId) {
          const parent: any = nodeMap.get(n.parentId);
          if (parent) {
            const pAbs = getAbsPos(parent);
            x += pAbs.x;
            y += pAbs.y;
          }
        }

        const pos = { x, y };
        absCache.set(n.id, pos);
        return pos;
      };

      const dragged: any = node;
      const draggedAbs = getAbsPos(dragged);
      const draggedSize = getNodeSize(nodeMap.get(node.id) ?? node);
      const center = {
        x: draggedAbs.x + draggedSize.width / 2,
        y: draggedAbs.y + draggedSize.height / 2,
      };

      const groupCandidates = nds
        .filter((n) => n.type === GROUP_NODE_TYPE && n.id !== node.id)
        .map((g: any) => {
          const abs = getAbsPos(g);
          const size = getNodeSize(g);
          const inside = center.x >= abs.x && center.x <= abs.x + size.width && center.y >= abs.y && center.y <= abs.y + size.height;
          return { g, abs, size, inside, area: size.width * size.height };
        })
        .filter((c) => c.inside && c.size.width > 0 && c.size.height > 0)
        .sort((a, b) => a.area - b.area);

      const target = groupCandidates[0]?.g as any | undefined;

      if (target) {
        if (dragged.parentId === target.id) return nds;

        const targetAbs = groupCandidates[0].abs;
        const shouldHide = !!target.data?.collapsed;

        return nds.map((n: any) => {
          if (n.id !== node.id) return n;
          return {
            ...n,
            parentId: target.id,
            extent: 'parent' as const,
            hidden: shouldHide,
            position: {
              x: draggedAbs.x - targetAbs.x,
              y: draggedAbs.y - targetAbs.y,
            },
          };
        });
      }

      if (dragged.parentId) {
        return nds.map((n: any) => {
          if (n.id !== node.id) return n;
          return {
            ...n,
            parentId: undefined,
            extent: undefined,
            hidden: false,
            position: draggedAbs,
          };
        });
      }

      return nds;
    });
  }, [setNodes]);

  useEffect(() => {
    if (!note) return;
    if (!shouldHydrateCanvasFromIncomingNote({
      lastLoadedNoteId: lastLoadedNoteIdRef.current,
      lastLoadedNoteContent: lastLoadedNoteContentRef.current,
      noteId: note.id,
      noteContent: note.content,
    })) {
      return;
    }

    const incomingCanvas = parseCanvasContent(note.content);
    const hydratedNodesFromNote = incomingCanvas.nodes.map((item) => injectRuntimeNode(item as CanvasNode));
    const nextViewport = incomingCanvas.viewport ?? { x: 0, y: 0, zoom: 1 };

    lastLoadedNoteIdRef.current = note.id;
    lastLoadedNoteContentRef.current = note.content ?? '';
    idRef.current = Math.max(0, ...incomingCanvas.nodes.map((item) => Number(String(item.id).replace(/[^0-9]/g, '')) || 0));
    setNodes(hydratedNodesFromNote);
    setPersistedNodes(hydratedNodesFromNote);
    setEdges(incomingCanvas.edges);
    setViewport(nextViewport);
    void reactFlow.setViewport(nextViewport, { duration: 0 });
    setBackgroundUrl(incomingCanvas.backgroundUrl);
  }, [note, reactFlow, injectRuntimeNode, setEdges, setNodes]);

  useEffect(() => {
    setNodes((prev) => {
      let didChange = false;
      const next = prev.map((item) => {
        if (item.type !== REFERENCE_NODE_TYPE) {
          return item;
        }

        const patched = injectRuntimeNode(item);
        if (patched !== item) {
          didChange = true;
        }
        return patched;
      });

      return didChange ? next : prev;
    });
  }, [injectRuntimeNode, setNodes]);

  const nextId = useCallback((prefix: string) => {
    idRef.current += 1;
    return `${prefix}-${idRef.current}`;
  }, []);

  const getCanvasCenter = useCallback(() => {
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    if (rect) {
      return reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
    return reactFlow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  }, [reactFlow]);

  const hydratedNodes = nodes;

  useEffect(() => {
    if (isNodeDragActiveRef.current) {
      return;
    }

    setPersistedNodes(nodes);
  }, [nodes]);

  const nodeTypes = useMemo(
    () => ({
      [TEXT_NODE_TYPE]: TextCardNode,
      [REFERENCE_NODE_TYPE]: ReferenceCardNode,
      [MEDIA_NODE_TYPE]: MediaNode,
      [LINK_NODE_TYPE]: LinkNode,
      [GROUP_NODE_TYPE]: GroupNode,
    }),
    [],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const selectedNodes = new Set(hydratedNodes.filter((n) => n.selected).map((n) => n.id));
      const filtered = changes.filter((c) => {
        if (c.type === 'select' && !c.selected) {
          const edge = edges.find((e) => e.id === c.id);
          if (edge && selectedNodes.has(edge.source) && selectedNodes.has(edge.target)) {
            return false; // Prevent deselection if both connected nodes are selected
          }
        }
        return true;
      });
      if (filtered.length > 0) {
        onEdgesChange(filtered);
      }
    },
    [hydratedNodes, edges, onEdgesChange]
  );

  const edgesWithSelection = useMemo(() => {
    const selectedNodes = new Set(selection.nodes.map((n) => n.id));
    return edges.map((e) => {
      if (selectedNodes.has(e.source) && selectedNodes.has(e.target)) {
        return { ...e, selected: true };
      }
      return e;
    });
  }, [edges, selection.nodes]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      // BaseNode 在同一位置同时渲染了 source / target 两类 handle。
      // 在某些情况下（尤其是 handle 视觉上重叠时），xyflow 可能会把“从 A 拖到 B”的连线
      // 以相反的 source/target 传入，从而导致 markerEnd（箭头）指回起点。
      // 这里根据 handleId 后缀做一次归一化：如果 sourceHandle 实际上是 *-target，且 targetHandle 是 *-source，
      // 则交换 source/target，保证箭头永远指向落点卡片。
      const sourceHandle = connection.sourceHandle ?? '';
      const targetHandle = connection.targetHandle ?? '';

      const shouldSwap = sourceHandle.endsWith('-target') && targetHandle.endsWith('-source');
      const normalized = shouldSwap
        ? {
            ...connection,
            source: connection.target,
            target: connection.source,
            sourceHandle: connection.targetHandle,
            targetHandle: connection.sourceHandle,
          }
        : connection;

      setEdges((prev) =>
        addEdge(
          {
            ...normalized,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#d7a685' },
            style: { stroke: '#d7a685', strokeWidth: 2 },
            className: 'custom-edge',
          },
          prev,
        ),
      );
    },
    [setEdges],
  );

  const handleAddTextCard = useCallback(() => {
    const center = getCanvasCenter();
    setNodes((prev) => [...prev, injectRuntimeNode(createTextNode(nextId('text'), center.x - 140, center.y - 90))]);
    onNotify?.('已添加文本卡片', 'success');
  }, [getCanvasCenter, injectRuntimeNode, nextId, onNotify, setNodes]);

  const canvasBackgroundStyle = useMemo(() => {
    if (!backgroundUrl) return undefined;
    return {
      backgroundImage: `url(${formatUrl(backgroundUrl)})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    } as React.CSSProperties;
  }, [backgroundUrl]);

  const handleBackgroundUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
        const results = await api.upload([file], note?.id);
        const url = results?.[0]?.url;
        if (!url) {
          throw new Error('upload returned empty url');
        }
        setBackgroundUrl(url);
        onNotify?.('背景已更新', 'success');
      } catch (err) {
        console.warn('[CanvasEditor] background upload failed', err);
        onNotify?.('背景上传失败，请稍后重试', 'error');
      } finally {
        setIsUploading(false);
        if (backgroundInputRef.current) backgroundInputRef.current.value = '';
      }
    },
    [note?.id, onNotify],
  );

  const handleClearBackground = useCallback(() => {
    setBackgroundUrl(undefined);
    onNotify?.('已清除背景图片', 'info');
  }, [onNotify]);

  const openNotePicker = useCallback((mode: 'toolbar' | 'context', position?: { x: number; y: number }, groupId?: string | null) => {
    pendingDropPositionRef.current = position ?? null;
    pendingDropGroupIdRef.current = groupId ?? null;
    setPickerMode(mode);
    setContextMenu(null);
  }, []);

  const insertReferenceNode = useCallback(
    (sourceNote: Note, position?: { x: number; y: number }) => {
      const fallback = getCanvasCenter();
      const targetPosition = position ?? pendingDropPositionRef.current ?? { x: fallback.x + 80, y: fallback.y - 120 };
      const groupId = pendingDropGroupIdRef.current;

      setNodes((prev) => {
        const group = groupId ? prev.find((n) => n.id === groupId && n.type === GROUP_NODE_TYPE) : null;
        if (!group) {
          return [...prev, injectRuntimeNode(createReferenceNode(nextId('ref'), sourceNote, targetPosition.x, targetPosition.y))];
        }

        const shouldHide = !!(group.data as any)?.collapsed;
        return [
          ...prev,
          {
            ...injectRuntimeNode(createReferenceNode(nextId('ref'), sourceNote, targetPosition.x - group.position.x, targetPosition.y - group.position.y, group.id)),
            hidden: shouldHide,
          },
        ];
      });

      setPickerMode(null);
      pendingDropPositionRef.current = null;
      pendingDropGroupIdRef.current = null;
      onNotify?.(`已将《${sourceNote.title || '无标题笔记'}》放入画布`, 'success');
    },
    [getCanvasCenter, injectRuntimeNode, nextId, onNotify, setNodes],
  );

  const removeSelection = useCallback(() => {
    const selectedNodeIds = new Set(nodes.filter((item) => item.selected).map((item) => item.id));
    const selectedEdgeIds = new Set(edges.filter((item) => item.selected).map((item) => item.id));
    if (!selectedNodeIds.size && !selectedEdgeIds.size) return;

    setNodes((prev) => prev.filter((item) => !selectedNodeIds.has(item.id)));
    setEdges((prev) => prev.filter((item) => !selectedEdgeIds.has(item.id) && !selectedNodeIds.has(item.source) && !selectedNodeIds.has(item.target)));
    onNotify?.('已移除选中元素', 'info');
  }, [edges, nodes, onNotify, setEdges, setNodes]);

  const serializeCanvasContent = useCallback(
    (nextBackgroundUrl: string | undefined) => {
      const serializedNodes = persistedNodes.map((item) => {
        // 核心性能优化：仅保留持久化所需的最小字段，剔除 selected, dragging, measured 等高频变动的运行时状态
        const { id, type, position, data, style, parentId, extent, width, height } = item;
        
        const cleanData = { ...data };
        // 剔除 runtime inject 的函数
        delete (cleanData as any).onChange;
        delete (cleanData as any).onInfoClick;
        delete (cleanData as any).onToggleCollapse;
        delete (cleanData as any).onUngroup;

        return {
          id,
          type,
          position,
          data: cleanData,
          style,
          parentId,
          extent,
          width,
          height,
        };
      });

      const serializedEdges = edges.map(edge => {
        const { id, source, target, type, label, data, style, animated, markerEnd } = edge;
        return { id, source, target, type, label, data, style, animated, markerEnd };
      });

      return JSON.stringify({
        version: 'v1',
        nodes: serializedNodes,
        edges: serializedEdges,
        viewport,
        backgroundUrl: nextBackgroundUrl,
      });
    },
    [edges, persistedNodes, viewport],
  );

  const saveSnapshot = useMemo(() => serializeCanvasContent(backgroundUrl), [backgroundUrl, serializeCanvasContent]);

  useEffect(() => {
    if (!note) return;
    if (saveSnapshot === (note.content || '')) return;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      onSave({
        id: note.id,
        file_path: note.file_path,
        content: saveSnapshot,
      });
    }, 1000);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [note, onSave, saveSnapshot]);

  useEffect(() => {
    const flushPendingSave = async () => {
      if (!note) return;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (saveSnapshot !== (note.content || '')) {
        await onSave({
          id: note.id,
          file_path: note.file_path,
          content: saveSnapshot,
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushPendingSave();
      }
    };

    const handleBeforeUnload = () => {
      void flushPendingSave();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const unsubscribeBeforeClose = window.electron?.onBeforeAppClose?.(async () => {
      try {
        await flushPendingSave();
      } finally {
        window.electron?.finishBeforeAppClose?.();
      }
    });

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribeBeforeClose?.();
    };
  }, [note, onSave, saveSnapshot]);

  useEffect(() => {
    const handleDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      removeSelection();
    };

    window.addEventListener('keydown', handleDelete);
    return () => window.removeEventListener('keydown', handleDelete);
  }, [removeSelection]);

  const handleCanvasContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      // 统一入口：第一时间阻止浏览器原生右键菜单（必须在任何逻辑前执行）
      event.preventDefault();

      const paneBounds = canvasWrapperRef.current?.getBoundingClientRect();
      if (!paneBounds) return;

      const target = event.target as HTMLElement | null;
      const nodeEl = target?.closest('.react-flow__node') as HTMLElement | null;
      const clickedNodeId =
        nodeEl?.getAttribute('data-id') ??
        nodeEl?.getAttribute('data-nodeid') ??
        nodeEl?.getAttribute('data-node-id') ??
        null;

      const flowPosition = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const toNumber = (value: unknown, fallback = 0) => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        }
        return fallback;
      };

      // Check if clicking inside a group
      const targetGroup = nodes.find((n) => {
        if (n.type !== GROUP_NODE_TYPE) return false;
        const gx = n.position.x;
        const gy = n.position.y;
        const gw = toNumber(n.measured?.width ?? n.width ?? (n.style as any)?.width, 0);
        const gh = toNumber(n.measured?.height ?? n.height ?? (n.style as any)?.height, 0);
        return flowPosition.x >= gx && flowPosition.x <= gx + gw && flowPosition.y >= gy && flowPosition.y <= gy + gh;
      });

      // Calculate position relative to the container for absolute positioning
      const x = event.clientX - paneBounds.left;
      const y = event.clientY - paneBounds.top;

      setContextMenu({
        x: Math.min(x, paneBounds.width - 200),
        y: Math.min(y, paneBounds.height - 320),
        flowX: flowPosition.x,
        flowY: flowPosition.y,
        groupId: targetGroup?.id ?? null,
        clickedNodeId,
      });
    },
    [reactFlow, nodes],
  );

  const handleGroupSelection = useCallback(() => {
    const selectedIds = selection.nodes.map((n) => n.id);
    if (selectedIds.length < 2) return;

    const selectedIdSet = new Set(selectedIds);
    const groupId = nextId('group');
    const padding = 40;

    const toNumber = (value: unknown, fallback = 0) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      }
      return fallback;
    };

    setNodes((nds) => {
      const nodeMap = new Map(nds.map((n) => [n.id, n] as const));
      const absCache = new Map<string, { x: number; y: number }>();

      const getAbsPos = (node: any): { x: number; y: number } => {
        const cached = absCache.get(node.id);
        if (cached) return cached;

        const direct = node.positionAbsolute;
        if (direct && Number.isFinite(direct.x) && Number.isFinite(direct.y)) {
          const pos = { x: direct.x, y: direct.y };
          absCache.set(node.id, pos);
          return pos;
        }

        let x = node.position?.x ?? 0;
        let y = node.position?.y ?? 0;

        if (node.parentId) {
          const parent: any = nodeMap.get(node.parentId);
          if (parent) {
            const pAbs = getAbsPos(parent);
            x += pAbs.x;
            y += pAbs.y;
          }
        }

        const pos = { x, y };
        absCache.set(node.id, pos);
        return pos;
      };

      const selectedNodes = nds.filter((n) => selectedIdSet.has(n.id));
      const boxes = selectedNodes.map((n: any) => {
        const pos = getAbsPos(n);
        const width = toNumber(n.measured?.width ?? n.width ?? (n.style as any)?.width, 0);
        const height = toNumber(n.measured?.height ?? n.height ?? (n.style as any)?.height, 0);
        return {
          x: pos.x,
          y: pos.y,
          width,
          height,
          right: pos.x + Math.max(0, width),
          bottom: pos.y + Math.max(0, height),
        };
      });

      const minX = Math.min(...boxes.map((b) => b.x));
      const minY = Math.min(...boxes.map((b) => b.y));
      const maxX = Math.max(...boxes.map((b) => b.right));
      const maxY = Math.max(...boxes.map((b) => b.bottom));

      const groupX = minX - padding;
      const groupY = minY - padding;
      const groupW = Math.max(260, maxX - minX + padding * 2);
      const groupH = Math.max(180, maxY - minY + padding * 2);

      const groupNode: CanvasGroupNode = {
        id: groupId,
        type: GROUP_NODE_TYPE,
        position: { x: groupX, y: groupY },
        dragHandle: '.canvas-group-drag-handle',
        data: {
          label: '新分组',
          collapsed: false,
          expandedHeight: groupH,
          onChange: updateNodeData,
          onUngroup: handleUngroup,
          onToggleCollapse: handleToggleCollapse,
        },
        style: { width: groupW, height: groupH },
      };

      const updated = nds.map((node: any) => {
        if (!selectedIdSet.has(node.id)) return node;
        const abs = getAbsPos(node);
        return {
          ...node,
          parentId: groupId,
          extent: 'parent' as const,
          position: {
            x: abs.x - groupX,
            y: abs.y - groupY,
          },
        };
      });

      // group 节点放在数组前方，默认作为底层背景框
      return [groupNode, ...updated];
    });

    onNotify?.('已成功创建节点分组', 'success');
  }, [selection.nodes, nextId, setNodes, onNotify, updateNodeData, handleUngroup, handleToggleCollapse]);

  const handleCanvasDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDraggingNoteFromSidebar(false);
      
      const flowPosition = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });

      // 1. Handle sidebar note drag
      const noteId = event.dataTransfer.getData('application/x-nova-note-id');
      if (noteId) {
        const matched = notes.find((item) => item.id === Number(noteId) && !item.is_folder);
        if (matched) {
          insertReferenceNode(matched, flowPosition);
        }
        return;
      }

      // 2. Handle local files drag
      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        setIsUploading(true);
        try {
          const files = Array.from(event.dataTransfer.files);
          const uploadResults = await api.upload(files, note?.id);
          
          const newNodes: CanvasNode[] = uploadResults.map((res: any, idx: number) => {
            const file = files[idx];
            const mime = file.type;
            let type: 'image' | 'video' | 'file' | 'audio' | 'embed' = 'file';
            if (mime.startsWith('image/')) type = 'image';
            else if (mime.startsWith('video/')) type = 'video';
            else if (mime.startsWith('audio/')) type = 'audio';
            
            return injectRuntimeNode(
              createMediaNode(
                nextId('media'),
                res.url,
                type,
                file.name,
                flowPosition.x + idx * 20,
                flowPosition.y + idx * 20,
              ),
            );
          });
          
          setNodes((prev) => [...prev, ...newNodes]);
          onNotify?.(`成功上传并插入 ${newNodes.length} 个媒体文件`, 'success');
        } catch {
          onNotify?.('文件上传失败，请稍后重试', 'error');
        } finally {
          setIsUploading(false);
        }
        return;
      }

      // 3. Handle plain text URLs
      const text = event.dataTransfer.getData('text/plain');
      if (text) {
        try {
          const url = new URL(text);
          setNodes((prev) => [...prev, injectRuntimeNode(createLinkNode(nextId('link'), url.href, url.hostname, flowPosition.x, flowPosition.y))]);
          onNotify?.('已成功从链接创建节点', 'success');
        } catch {
          // Not a URL, maybe just text - could create a text card if wanted
        }
      }
    },
    [insertReferenceNode, injectRuntimeNode, note?.id, notes, reactFlow, nextId, setNodes, onNotify],
  );

  const handleCanvasDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes('application/x-nova-note-id') || event.dataTransfer.types.includes('Files')) {
      event.dataTransfer.dropEffect = 'copy';
      setIsDraggingNoteFromSidebar(true);
    }
  }, []);

  const handleCanvasDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!(event.currentTarget as HTMLDivElement).contains(event.relatedTarget as HTMLElement | null)) {
      setIsDraggingNoteFromSidebar(false);
    }
  }, []);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !contextMenu) return;

    setIsUploading(true);
    try {
      const fileList = Array.from(files);
      const uploadResults = await api.upload(fileList);
      
      setNodes((prev) => {
        const group = contextMenu.groupId ? prev.find((n) => n.id === contextMenu.groupId && n.type === GROUP_NODE_TYPE) : null;
        const shouldHide = !!(group?.data as any)?.collapsed;

        const newNodes: CanvasNode[] = uploadResults.map((res: any, idx: number) => {
          const file = fileList[idx];
          const mime = file.type;
          let type: 'image' | 'video' | 'file' | 'audio' | 'embed' = 'file';
          if (mime.startsWith('image/')) type = 'image';
          else if (mime.startsWith('video/')) type = 'video';
          else if (mime.startsWith('audio/')) type = 'audio';

          const x = group ? contextMenu.flowX - group.position.x + idx * 20 : contextMenu.flowX + idx * 20;
          const y = group ? contextMenu.flowY - group.position.y + idx * 20 : contextMenu.flowY + idx * 20;

          return {
            ...injectRuntimeNode(createMediaNode(nextId('media'), res.url, type, file.name, x, y, 'local', group?.id)),
            hidden: group ? shouldHide : undefined,
          } as CanvasNode;
        });

        return [...prev, ...newNodes];
      });
      onNotify?.(`成功上传并插入 ${uploadResults.length} 个媒体文件`, 'success');
    } catch {
      onNotify?.('文件上传失败，请稍后重试', 'error');
    } finally {
      setIsUploading(false);
      setContextMenu(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [contextMenu, injectRuntimeNode, nextId, onNotify, setNodes]);

  const handleInsertLink = useCallback(async () => {
    if (!contextMenu) return;
    const urlStr = await promptCompat({ title: '插入网页链接', defaultValue: 'https://', placeholder: 'https://example.com' });
    if (!urlStr) return;

    try {
      // 允许用户直接粘贴带或不带协议的链接，我们统一加上 https
      const safeUrlStr = /^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`;
      const url = new URL(safeUrlStr);
      
      let isMedia = false;
      let mediaType: 'image' | 'video' | 'audio' | 'embed' | 'file' = 'file';
      let mediaSrc = url.href;

      // Check Bilibili
      // 支持 B站多类链接：短链 b23.tv，带查询参数的视频页
      const biliMatch = safeUrlStr.match(/(?:https?:\/\/)?(?:www\.)?(?:bilibili\.com\/video\/|b23\.tv\/)(BV[\w]+)/i);
      if (biliMatch) {
        isMedia = true;
        mediaType = 'embed';
        mediaSrc = `https://player.bilibili.com/player.html?bvid=${biliMatch[1]}&high_quality=1&danmaku=0&autoplay=0`;
      }
      
      // Check YouTube
      const ytMatch = safeUrlStr.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
      if (ytMatch && !isMedia) {
        isMedia = true;
        mediaType = 'embed';
        mediaSrc = `https://www.youtube.com/embed/${ytMatch[1]}`;
      }

      if (!isMedia) {
        // 去除查询参数和 hash
        const cleanPath = url.pathname.split('?')[0].split('#')[0];
        // 取最后一个后缀名，暂时不需要也可以不用，直接用下面的正则匹配即可
        // const ext = cleanPath.split('.').pop()?.toLowerCase();
        
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'jfif', 'pjpeg', 'pjp'];
        const videoExts = ['mp4', 'mov', 'webm', 'ogg', 'mkv', 'avi'];
        const audioExts = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg'];
        
        // 更稳妥的匹配后缀，不依赖是否有扩展名
        const extMatch = cleanPath.match(/\.([^.]+)$/);
        const actualExt = extMatch ? extMatch[1].toLowerCase() : '';
        
        if (imageExts.includes(actualExt)) { isMedia = true; mediaType = 'image'; }
        else if (videoExts.includes(actualExt)) { isMedia = true; mediaType = 'video'; }
        else if (audioExts.includes(actualExt)) { isMedia = true; mediaType = 'audio'; }

        // 如果没有明确后缀，通过一些常见图床或者 URL 参数来猜测
        if (!isMedia && (safeUrlStr.includes('image') || safeUrlStr.includes('img') || safeUrlStr.includes('picture') || safeUrlStr.includes('webp'))) {
            // 这里我们大胆一点，只要看起来像图片链接，就试探性作为图片渲染，总比干瘪的文字链接好
            isMedia = true;
            mediaType = 'image';
        }
      }

      if (isMedia) {
        setNodes((prev) => {
          const group = contextMenu.groupId ? prev.find((n) => n.id === contextMenu.groupId && n.type === GROUP_NODE_TYPE) : null;
          const shouldHide = !!(group?.data as any)?.collapsed;
          const x = group ? contextMenu.flowX - group.position.x : contextMenu.flowX;
          const y = group ? contextMenu.flowY - group.position.y : contextMenu.flowY;

          return [
            ...prev,
            {
              ...injectRuntimeNode(createMediaNode(nextId('media'), mediaSrc, mediaType, url.hostname || 'link', x, y, 'online', group?.id)),
              hidden: group ? shouldHide : undefined,
            } as CanvasNode,
          ];
        });
        onNotify?.('已成功插入媒体资源', 'success');
      } else {
        setNodes((prev) => {
          const group = contextMenu.groupId ? prev.find((n) => n.id === contextMenu.groupId && n.type === GROUP_NODE_TYPE) : null;
          const shouldHide = !!(group?.data as any)?.collapsed;
          const x = group ? contextMenu.flowX - group.position.x : contextMenu.flowX;
          const y = group ? contextMenu.flowY - group.position.y : contextMenu.flowY;

          return [
            ...prev,
            {
              ...injectRuntimeNode(createLinkNode(nextId('link'), url.href, url.hostname || 'link', x, y, 'online', group?.id)),
              hidden: group ? shouldHide : undefined,
            } as CanvasNode,
          ];
        });
        onNotify?.('已成功创建链接节点', 'success');
      }
    } catch {
      onNotify?.('无效的 URL 地址', 'error');
    }
    setContextMenu(null);
  }, [contextMenu, injectRuntimeNode, nextId, onNotify, setNodes]);

  useEffect(() => {
    const hideMenus = () => setContextMenu(null);
    window.addEventListener('click', hideMenus);
    return () => window.removeEventListener('click', hideMenus);
  }, []);

  const clickedNode = useMemo(
    () => (contextMenu?.clickedNodeId ? nodes.find((n) => n.id === contextMenu.clickedNodeId) : null),
    [contextMenu?.clickedNodeId, nodes],
  );

  const availableGroups = useMemo(
    () => nodes.filter((n) => n.type === GROUP_NODE_TYPE && n.id !== contextMenu?.clickedNodeId),
    [nodes, contextMenu?.clickedNodeId],
  );

  if (!note) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">请选择一张画布开始创作</div>;
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0f16]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(99,102,241,0.20),transparent_38%),radial-gradient(circle_at_86%_22%,rgba(14,165,233,0.16),transparent_40%),radial-gradient(circle_at_50%_110%,rgba(236,72,153,0.10),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:56px_56px]" />

      <div
        ref={canvasWrapperRef}
        className="relative z-10 h-full w-full"
        style={canvasBackgroundStyle}
        onContextMenu={(event) => {
          // 兜底（冒泡阶段）：阻止画布区域出现浏览器原生右键菜单
          event.preventDefault();
        }}
        onDrop={handleCanvasDrop}
        onDragOver={handleCanvasDragOver}
        onDragLeave={handleCanvasDragLeave}
      >
        <ReactFlow
          nodes={hydratedNodes}
          edges={edgesWithSelection}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onNodeDragStop={onNodeDragStop}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onMoveEnd={(_, currentViewport) => {
            setViewport((previousViewport) => (
              shouldPersistViewport(previousViewport, currentViewport)
                ? currentViewport
                : previousViewport
            ));
          }}
          onSelectionChange={handleSelectionChange}
          fitView={hydratedNodes.length === 0}
          minZoom={0.25}
          maxZoom={2}
          selectionOnDrag
          panOnDrag={[1]} // 仅允许中键平移（禁用右键拖动，避免与右键菜单冲突）
          panActivationKeyCode="Space"
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          zoomOnScroll={false}
          selectionMode={SelectionMode.Partial}
          elevateNodesOnSelect
          elementsSelectable={true}
          edgesFocusable={true}
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#d7a685' },
            style: { stroke: '#d7a685', strokeWidth: 2 },
            className: 'custom-edge',
          }}
          className="canvas-flow"
          onPaneContextMenu={(event) => handleCanvasContextMenu(event)}
          onNodeContextMenu={(event, _node) => handleCanvasContextMenu(event)}
          onEdgeContextMenu={(event, _edge) => {
            event.preventDefault();
            setContextMenu(null);
          }}
        >
          <Background id="dots" variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.08)" gap={24} size={1.2} />
          <MiniMap
            pannable
            zoomable
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 24,
              boxShadow: '0 20px 50px -28px rgba(0, 0, 0, 0.5)',
            }}
            nodeBorderRadius={18}
            nodeColor={(node) => (node.type === REFERENCE_NODE_TYPE ? 'rgba(99, 102, 241, 0.6)' : 'rgba(245, 158, 11, 0.6)')}
            maskColor="rgba(0, 0, 0, 0.3)"
          />
          <Controls
            position="bottom-left"
            showInteractive={false}
            className="!overflow-hidden !rounded-[22px] !border !border-white/80 !bg-white/86 !shadow-[0_18px_48px_-26px_rgba(210,155,120,0.5)] !backdrop-blur-xl"
          />

          <Panel position="top-left">
            <div className={`rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 shadow-2xl backdrop-blur-xl transition-all ${isToolbarCollapsed ? 'opacity-40 hover:opacity-100' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 text-sky-400 shadow-inner">
                  <LayoutGrid size={16} />
                </div>
                {!isToolbarCollapsed && (
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="truncate text-xs font-bold tracking-wide text-slate-200 uppercase">{note.title || '无标题画布'}</div>
                    <div className="truncate text-[10px] text-slate-400 mt-0.5">无界画布 · 自由创作空间</div>
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <Panel position="top-center" className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 p-1.5 shadow-2xl backdrop-blur-xl">
              <button
                onClick={() => setIsToolbarCollapsed(!isToolbarCollapsed)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
                title={isToolbarCollapsed ? "展开工具栏" : "收起工具栏"}
              >
                {isToolbarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>

              <AnimatePresence>
                {!isToolbarCollapsed && (
                  <motion.div 
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 'auto', opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    className="flex items-center gap-1.5 overflow-hidden"
                  >
                    <div className="h-4 w-px bg-white/10 mx-1" />
                    
                    <button
                      onClick={handleAddTextCard}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-amber-400 transition hover:bg-amber-400/10"
                      title="添加文本卡片"
                    >
                      <Plus size={18} />
                    </button>

                    <button
                      onClick={() => openNotePicker('toolbar', getCanvasCenter())}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-sky-400 transition hover:bg-sky-400/10"
                      title="引用已有笔记"
                    >
                      <Search size={18} />
                    </button>

                    <div className="group flex items-center">
                      <button
                        onClick={() => backgroundInputRef.current?.click()}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-400 transition hover:bg-emerald-400/10"
                        title="更换画布背景"
                      >
                        <Palette size={18} />
                      </button>
                      
                      {backgroundUrl && (
                        <div className="flex w-0 items-center overflow-hidden transition-all duration-300 ease-out group-hover:w-8 group-hover:ml-1">
                          <button
                            onClick={handleClearBackground}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 transition hover:bg-rose-500/20"
                            title="清除背景图片"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    <input
                      type="file"
                      ref={backgroundInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleBackgroundUpload}
                    />

                    <div className="h-4 w-px bg-white/10 mx-1" />
                    
                    <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium text-slate-400">
                      <Sparkles size={12} className="text-indigo-400" />
                      支持拖拽文件
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <SelectionToolbar 
              selectedNodes={selection.nodes} 
              onGroup={handleGroupSelection} 
              onRemove={removeSelection} 
            />
          </Panel>

          <Panel position="bottom-center">
            <div className="rounded-full border border-white/5 bg-black/20 px-4 py-1.5 text-[10px] text-slate-500 backdrop-blur-sm">
              按 Delete / Backspace 快速删除 · 空格键配合鼠标平移
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {isDraggingNoteFromSidebar && (
        <div className="pointer-events-none absolute inset-6 z-20 rounded-[34px] border-2 border-dashed border-[#d7ab87] bg-[radial-gradient(circle_at_center,rgba(255,243,233,0.52),rgba(247,251,255,0.42))] shadow-[0_0_0_1px_rgba(255,255,255,0.6),0_28px_90px_-44px_rgba(219,162,128,0.55)] backdrop-blur-sm" />
      )}

      {contextMenu && (
        <div
          className="absolute z-[110] min-w-[200px] overflow-visible rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,248,243,0.94))] py-2 shadow-[0_30px_100px_-34px_rgba(220,162,126,0.52)] backdrop-blur-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#a1806d]/60">新增节点</div>
          <button
            onClick={() => {
              setNodes((prev) => {
                const group = contextMenu.groupId ? prev.find((n) => n.id === contextMenu.groupId && n.type === GROUP_NODE_TYPE) : null;
                if (!group) {
                  return [...prev, injectRuntimeNode(createTextNode(nextId('text'), contextMenu.flowX, contextMenu.flowY))];
                }

                const shouldHide = !!(group.data as any)?.collapsed;
                return [
                  ...prev,
                  {
                    ...injectRuntimeNode(createTextNode(nextId('text'), contextMenu.flowX - group.position.x, contextMenu.flowY - group.position.y, group.id)),
                    hidden: shouldHide,
                  },
                ];
              });
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[#6a4a36] transition hover:bg-[#fff3ea]"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fff3ea] text-[#cb885d]">
              <StickyNote size={14} />
            </div>
            添加文本卡片
          </button>
          <button
            onClick={() => openNotePicker('context', { x: contextMenu.flowX, y: contextMenu.flowY }, contextMenu.groupId)}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[#5b7d99] transition hover:bg-[#eef7ff]"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#eef7ff] text-[#6fa1c7]">
              <FileText size={14} />
            </div>
            引用已有笔记
          </button>
          
          <div className="my-1.5 mx-2 border-t border-[#f0dfd4]/50" />
          <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#a1806d]/60">外部资源</div>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[#6a4a36] transition hover:bg-[#fff3ea]"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fff3ea] text-[#cb885d]">
              <Plus size={14} />
            </div>
            插入本地文件
          </button>
          <button
            onClick={handleInsertLink}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[#5b7d99] transition hover:bg-[#eef7ff]"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#eef7ff] text-[#6fa1c7]">
              <Link2 size={14} />
            </div>
            插入网页链接
          </button>

          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
          />

          {clickedNode && clickedNode.type !== GROUP_NODE_TYPE && (
            <>
              <div className="my-1.5 mx-2 border-t border-[#f0dfd4]/50" />
              <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#a1806d]/60">编排操作</div>
              
              {clickedNode.parentId ? (
                <button
                  onClick={() => handleRemoveFromGroup(clickedNode.id)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-red-500 transition hover:bg-red-50"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-500">
                    <Unlink size={14} />
                  </div>
                  移出分组
                </button>
              ) : availableGroups.length > 0 ? (
                <div className="group relative">
                  <button className="flex w-full items-center justify-between gap-3 px-4 py-2 text-sm text-[#6a4a36] transition hover:bg-[#fff3ea]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fff3ea] text-[#cb885d]">
                        <LayoutGrid size={14} />
                      </div>
                      移入分组
                    </div>
                    <ChevronRight size={14} className="text-[#a1806d]/40" />
                  </button>
                  
                  <div className="invisible absolute left-full top-0 ml-1 min-w-[160px] rounded-2xl border border-white/80 bg-white/95 py-2 opacity-0 shadow-xl backdrop-blur-md transition-all group-hover:visible group-hover:opacity-100">
                    {availableGroups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => handleMoveIntoGroup(clickedNode.id, g.id)}
                        className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[#6a4a36] transition hover:bg-[#fff3ea]"
                      >
                        {(g.data as any)?.label || '未命名分组'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      <NotePickerModal
        isOpen={pickerMode !== null}
        notes={notes}
        onClose={() => {
          setPickerMode(null);
          pendingDropPositionRef.current = null;
          pendingDropGroupIdRef.current = null;
        }}
        onSelect={(selectedNote) => insertReferenceNode(selectedNote)}
      />

      <MemoDrawer
        nodeId={memoOpenId}
        nodes={nodes}
        onClose={() => setMemoOpenId(null)}
        onChange={updateNodeData}
      />

      {isUploading && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-white p-8 shadow-2xl">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <div className="text-sm font-semibold text-primary">正在处理并上传媒体文件...</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CanvasEditor(props: CanvasEditorProps) {
  return (
    <ReactFlowProvider>
      <CanvasBoard {...props} />
    </ReactFlowProvider>
  );
}
