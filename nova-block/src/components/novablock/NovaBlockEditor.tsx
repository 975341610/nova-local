import { formatUrl } from "../../lib/api";
import React, { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { EditorContent, useEditor, Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import type { ChainedCommands } from '@tiptap/core';
import { Node, mergeAttributes } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/react/menus';
import DragHandle from '@tiptap/extension-drag-handle-react';
import StarterKit from '@tiptap/starter-kit';
import Dropcursor from '@tiptap/extension-dropcursor';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import UnderlineExtension from '@tiptap/extension-underline';
import { Table as TiptapTable } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { BackgroundPaper } from '../editor/BackgroundPaper';
import { StickerLayer } from '../editor/StickerLayer';
import { StickyNotesLayer } from '../editor/StickyNotesLayer';
import { StickerPanel } from '../editor/StickerPanel';
import type { StickerData, StickyNoteData, BackgroundPaperType } from '../../lib/types';
import { 
    GripVertical, Bold, Italic, 
    Underline, Eraser, Cpu, Strikethrough, Timer,
    Type, Heading1, Heading2, Heading3, CheckSquare, Table as TableIcon, Code, Quote, Sparkles, Zap, Waves,
    Link as LinkIcon, Highlighter, Trash2, Copy, Replace, ListPlus, Minus,
    Trash, Columns, Rows, Film, Music, FileText, MonitorPlay, StickyNote as StickyNoteIcon,
    List, ListOrdered, ArrowUpToLine, ArrowDownToLine, CopyPlus, StickyNote, Smile, X,
    Layout, Bot
} from 'lucide-react';

import pixelMaidUrl from '../../assets/pixel-maid.webp';

import { 
    AudioNode, CalloutNode, DatabaseTableCell, DatabaseTableHeader, 
    EmbedNode, ResizableImage, TaskItem, TaskList, VideoNode, WikiLink,
    SlashCommands, FileNode, Heading, MathInline, MathBlock, Footnote, 
    ColumnGroup, Column, HighlightBlock,
    WashiTape, JournalStamp, Blockquote, CodeBlock, FilePlaceholder, FileUpload,
    CountdownNode, MusicPlayerNode, MiniCalendarNode, KanbanNode, HabitTrackerNode, TodoNode,
    Emoticon, SliderExtension, NoteLink, TextEffect, AISpellcheck, spellcheckPluginKey
   } from '../../lib/tiptapExtensions';
const AILoadingNode = Node.create({
  name: "aiLoadingPlaceholder",
  inline: true,
  group: "inline",
  atom: true,
  parseHTML() { return [{ tag: "img[data-ai-loading]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { src: pixelMaidUrl, "data-ai-loading": "true", alt: "AI Thinking...", width: 40, height: 40, style: "display:inline-block; vertical-align:middle; margin:0 4px;" })];
  }
});

import type { Note } from '../../lib/types';

import { EditorHeader } from '../editor/EditorHeader';
import { PropertyPanel } from '../editor/PropertyPanel';
import { getSuggestionConfig } from '../notion/SlashMenuConfig';
import { getNoteLinkSuggestionConfig } from './extensions/NoteLinkConfig';
import { promptCompat } from '../../lib/promptCompat';
import { useAI } from '../../contexts/AIContext';
import { TableOfContents } from './components/TableOfContents';
import { EmoticonPanel } from '../editor/EmoticonPanel';
import { SpellcheckSuggestionCard } from './components/SpellcheckSuggestionCard';
import { isSpellcheckDetailForNote } from './extensions/spellcheckHelpers';
import { findSpellcheckMarkerFromTarget, parseSpellcheckErrorFromTarget } from './extensions/AISpellcheck';
import {
  dragHandleComputePositionConfig,
  getDragHandleElement,
  getDragHandleReferenceRect,
  getDragHandleVirtualReference,
  repositionDragHandleAtNode,
} from './dragHandlePositioning';

const NOVA_BLOCK_SLASH_ITEMS = [
  {
    label: 'AI 写作',
    description: '向本地模型提问并插入结果',
    group: 'AI 助手',
    icon: <Bot size={18} className="text-purple-500" />,
    keywords: ['ai', 'write', 'bot', 'gemma'],
    requiresAI: true,
    action: (chain: ChainedCommands) => {
      void promptCompat({
        title: '告诉 AI 你想写什么？',
        placeholder: '输入你想让 AI 帮你写的内容',
        multiline: true,
        submitLabel: '开始生成',
      }).then((prompt) => {
        if (!prompt?.trim()) return;
        window.dispatchEvent(new CustomEvent("ai-write", { detail: { prompt: prompt.trim() } }));
      });
      return chain;
    },
  },
  {
    label: '加粗',
    description: '切换粗体',
    group: '文本格式',
    icon: <Bold size={18} />,
    keywords: ['bold', 'b'],
    action: (chain: ChainedCommands) => chain.toggleBold(),
  },
  {
    label: '斜体',
    description: '切换斜体',
    group: '文本格式',
    icon: <Italic size={18} />,
    keywords: ['italic', 'i'],
    action: (chain: ChainedCommands) => chain.toggleItalic(),
  },
  {
    label: '删除线',
    description: '切换删除线',
    group: '文本格式',
    icon: <Strikethrough size={18} />,
    keywords: ['strike', 's'],
    action: (chain: ChainedCommands) => chain.toggleStrike(),
  },
  {
    label: '高亮',
    description: '切换文本高亮',
    group: '文本格式',
    icon: <Highlighter size={18} />,
    keywords: ['highlight'],
    action: (chain: ChainedCommands) => chain.toggleHighlight(),
  },
  {
    label: '行内代码',
    description: '切换行内代码样式',
    group: '文本格式',
    icon: <Code size={18} />,
    keywords: ['code', 'inline'],
    action: (chain: ChainedCommands) => chain.toggleCode(),
  },
  {
    label: '数学公式',
    description: '插入行内 LaTeX 公式',
    group: '文本格式',
    icon: <Sparkles size={18} />,
    keywords: ['math', 'latex'],
    action: (chain: ChainedCommands) => chain.setMark('mathInline', { latex: 'E=mc^2' }),
  },
  {
    label: '清除格式',
    description: '移除所有标记样式',
    group: '文本格式',
    icon: <Eraser size={18} />,
    keywords: ['clear'],
    action: (chain: ChainedCommands) => chain.unsetAllMarks(),
  },
  {
    label: '正文',
    description: '切换为普通段落',
    group: '段落设置',
    icon: <Type size={18} />,
    keywords: ['p', 'text'],
    action: (chain: ChainedCommands) => chain.setNode('paragraph'),
  },
  {
    label: '一级标题',
    description: '切换为 H1',
    group: '段落设置',
    icon: <Heading1 size={18} />,
    keywords: ['h1'],
    action: (chain: ChainedCommands) => chain.setNode('heading', { level: 1 }),
  },
  {
    label: '二级标题',
    description: '切换为 H2',
    group: '段落设置',
    icon: <Heading2 size={18} />,
    keywords: ['h2'],
    action: (chain: ChainedCommands) => chain.setNode('heading', { level: 2 }),
  },
  {
    label: '三级标题',
    description: '切换为 H3',
    group: '段落设置',
    icon: <Heading3 size={18} />,
    keywords: ['h3'],
    action: (chain: ChainedCommands) => chain.setNode('heading', { level: 3 }),
  },
  {
    label: '四级标题',
    description: '切换为 H4',
    group: '段落设置',
    icon: <Heading2 size={14} />,
    keywords: ['h4'],
    action: (chain: ChainedCommands) => chain.setNode('heading', { level: 4 }),
  },
  {
    label: '五级标题',
    description: '切换为 H5',
    group: '段落设置',
    icon: <Heading1 size={12} />,
    keywords: ['h5'],
    action: (chain: ChainedCommands) => chain.setNode('heading', { level: 5 }),
  },
  {
    label: '六级标题',
    description: '切换为 H6',
    group: '段落设置',
    icon: <Heading2 size={12} />,
    keywords: ['h6'],
    action: (chain: ChainedCommands) => chain.setNode('heading', { level: 6 }),
  },
  {
    label: '有序列表',
    description: '插入数字编号列表',
    group: '段落设置',
    icon: <ListPlus size={18} className="rotate-180" />,
    keywords: ['ol', 'ordered'],
    action: (chain: ChainedCommands) => chain.toggleOrderedList(),
  },
  {
    label: '无序列表',
    description: '插入项目符号列表',
    group: '段落设置',
    icon: <ListPlus size={18} />,
    keywords: ['ul', 'bullet'],
    action: (chain: ChainedCommands) => chain.toggleBulletList(),
  },
  {
    label: '任务列表',
    description: '插入待办清单',
    group: '段落设置',
    icon: <CheckSquare size={18} />,
    keywords: ['todo', 'task'],
    action: (chain: ChainedCommands) => chain.toggleTaskList(),
  },
  {
    label: '表情',
    description: '打开表情面板',
    group: '段落设置',
    icon: <Smile size={18} />,
    keywords: ['emoji', 'emoticon', 'bqb'],
    action: (chain: ChainedCommands) => {
      window.dispatchEvent(new CustomEvent('open-emoticon-panel'));
      return chain;
    },
  },
  {
    label: '引用',
    description: '切换为引用块',
    group: '段落设置',
    icon: <Quote size={18} />,
    keywords: ['quote', 'blockquote'],
    action: (chain: ChainedCommands) => chain.toggleBlockquote(),
  },
  {
    label: '表格',
    description: '插入 3x3 表格',
    group: '插入',
    icon: <TableIcon size={18} />,
    keywords: ['table'],
    action: (chain: ChainedCommands) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  },
  {
    label: '代码块',
    description: '插入代码块',
    group: '插入',
    icon: <Cpu size={18} />,
    keywords: ['codeblock'],
    action: (chain: ChainedCommands) => chain.setCodeBlock(),
  },
  {
    label: '数学块',
    description: '插入块级 LaTeX 公式',
    group: '插入',
    icon: <Sparkles size={18} />,
    keywords: ['mathblock'],
    action: (chain: ChainedCommands) =>
      chain.insertContent({ type: 'mathBlock', attrs: { latex: '\\sum_{i=1}^n i = \\frac{n(n+1)}{2}' } }),
  },
  {
    label: '高亮块',
    description: '插入高亮提示块',
    group: '插入',
    icon: <Highlighter size={18} />,
    keywords: ['callout', 'highlightblock'],
    action: (chain: ChainedCommands) => chain.insertContent({ type: 'highlightBlock', content: [{ type: 'paragraph' }] }),
  },
  {
    label: '分栏',
    description: '创建双栏布局',
    group: '插入',
    icon: <Columns size={18} />,
    keywords: ['column', 'layout'],
    action: (chain: ChainedCommands) =>
      chain.insertContent({
        type: 'columnGroup',
        content: [
          { type: 'column', content: [{ type: 'paragraph' }] },
          { type: 'column', content: [{ type: 'paragraph' }] },
        ],
      }),
  },
  {
    label: '脚注',
    description: '插入脚注',
    group: '插入',
    icon: <Quote size={14} />,
    keywords: ['footnote'],
    action: (chain: ChainedCommands) => chain.insertContent({ type: 'footnote' }),
  },
  {
    label: '分割线',
    description: '插入水平分割线',
    group: '插入',
    icon: <Minus size={18} />,
    keywords: ['divider', 'hr'],
    action: (chain: ChainedCommands) => chain.setHorizontalRule(),
  },
  {
    label: '图片',
    description: '通过 URL 插入图片',
    group: '插入',
    icon: <Replace size={18} />,
    keywords: ['image', 'picture'],
    action: (chain: ChainedCommands) => {
      void promptCompat({ title: '插入图片', placeholder: 'https://example.com/image.png' }).then((url) => {
        if (url?.trim()) {
          chain.setImage({ src: url.trim() });
        }
      });
      return chain;
    },
  },
  {
    label: '视频',
    description: '通过 URL 插入视频',
    group: '插入',
    icon: <Film size={18} />,
    keywords: ['video', 'mp4'],
    action: (chain: ChainedCommands) => {
      void promptCompat({ title: '插入视频', placeholder: 'https://example.com/video.mp4' }).then((url) => {
        if (url?.trim()) {
          chain.insertContent({ type: 'videoNode', attrs: { src: url.trim() } });
        }
      });
      return chain;
    },
  },
  {
    label: '音频',
    description: '通过 URL 插入音频',
    group: '插入',
    icon: <Music size={18} />,
    keywords: ['audio', 'mp3'],
    action: (chain: ChainedCommands) => {
      void promptCompat({ title: '插入音频', placeholder: 'https://example.com/audio.mp3' }).then((url) => {
        if (url?.trim()) {
          chain.insertContent({ type: 'audioNode', attrs: { src: url.trim() } });
        }
      });
      return chain;
    },
  },
  {
    label: '文件',
    description: '插入文件附件',
    group: '插入',
    icon: <FileText size={18} />,
    keywords: ['file', 'attachment'],
    action: (chain: ChainedCommands) => {
      void promptCompat({ title: '文件链接', placeholder: 'https://example.com/file.pdf' }).then((url) => {
        if (!url?.trim()) return;
        void promptCompat({
          title: '文件名称',
          defaultValue: '未命名文件',
          placeholder: '显示名称',
        }).then((name) => {
          chain.insertContent({ type: 'fileNode', attrs: { src: url.trim(), name: name?.trim() || '未命名文件' } });
        });
      });
      return chain;
    },
  },
  {
    label: '链接到笔记',
    description: '插入双链到其他笔记',
    group: '插入',
    icon: <LinkIcon size={18} />,
    keywords: ['link', 'note', 'backlink', 'gl'],
    action: (chain: ChainedCommands) => chain.insertContent('[['),
  },
  {
    label: '嵌入内容',
    description: '嵌入 B 站、YouTube 或网页',
    group: '插入',
    icon: <MonitorPlay size={18} />,
    keywords: ['embed', 'bilibili', 'youtube', 'iframe', 'bzhan'],
    action: (chain: ChainedCommands) => {
      void promptCompat({
        title: '插入嵌入内容',
        placeholder: '请输入可嵌入的 B 站、YouTube 或网页链接',
      }).then((url) => {
        if (!url?.trim()) return;

        let embedUrl = url.trim();
        const bvidMatch = embedUrl.match(/(?:bilibili\.com\/video\/|b23\.tv\/)(BV[\w]+)/i);
        if (bvidMatch?.[1]) {
          embedUrl = `https://player.bilibili.com/player.html?bvid=${bvidMatch[1]}&high_quality=1&danmaku=0&autoplay=0`;
        }

        const ytMatch = embedUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
        if (ytMatch?.[1]) {
          embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
        }

        chain.insertContent({ type: 'embedNode', attrs: { src: embedUrl } });
      });
      return chain;
    },
  },
  {
    label: '图片轮播',
    description: '插入图片轮播组件',
    group: '插入',
    icon: <Layout size={18} />,
    keywords: ['slider', 'carousel', 'lunbo'],
    action: (chain: ChainedCommands) => chain.insertContent({ type: 'slider', attrs: { images: [] } }),
  },
  {
    label: '和纸胶带',
    description: '插入装饰胶带',
    group: '手账装饰',
    icon: <Highlighter size={18} className="text-pink-400" />,
    keywords: ['tape', 'washi'],
    action: (chain: ChainedCommands) => chain.insertContent({ type: 'washiTape' }),
  },
  {
    label: '便利贴',
    description: '添加一张浮动便利贴',
    group: '手账装饰',
    icon: <StickyNoteIcon size={18} className="text-yellow-400" />,
    keywords: ['note', 'sticky'],
    action: () => window.dispatchEvent(new CustomEvent('add-sticky-note')),
  },
  {
    label: '倒计时',
    description: '插入倒计时组件',
    group: '精致小组件',
    icon: <Timer size={18} />,
    keywords: ['countdown', 'djs'],
    action: (chain: ChainedCommands) => chain.insertContent({ type: 'countdown' }),
  },
  {
    label: '音乐播放器',
    description: '插入音乐播放器组件',
    group: '精致小组件',
    icon: <Music size={18} />,
    keywords: ['music', 'player'],
    action: (chain: ChainedCommands) => chain.insertContent({ type: 'musicPlayer' }),
  },
  {
    label: '迷你日历',
    description: '插入迷你日历组件',
    group: '精致小组件',
    icon: <List size={18} />,
    keywords: ['calendar', 'checkin'],
    action: (chain: ChainedCommands) => chain.insertContent({ type: 'miniCalendar' }),
  },
  {
    label: '习惯打卡',
    description: '插入习惯追踪组件',
    group: '精致小组件',
    icon: <CheckSquare size={18} />,
    keywords: ['habit', 'tracker', 'dk'],
    action: (chain: ChainedCommands) => chain.insertContent({ type: 'habitTracker' }),
  },
  {
    label: '全局待办',
    description: '插入同步待办组件',
    group: '精致小组件',
    icon: <CheckSquare size={18} className="text-[#8BA494]" />,
    keywords: ['todo', 'widget', 'sync', 'task'],
    action: (chain: ChainedCommands) => chain.insertContent({ type: 'todoWidget' }),
  },
  {
    label: '看板',
    description: '插入 Kanban 看板组件',
    group: '精致小组件',
    icon: <Columns size={18} />,
    keywords: ['kanban', 'kb'],
    action: (chain: ChainedCommands) => chain.insertContent({ type: 'kanban' }),
  },
];

interface NovaBlockEditorProps {
  note: Note | null;
  onLiveChange?: (payload: Partial<Note>) => void;
  onSave: (payload: any) => Promise<Partial<Note> | void>;
  onNotify?: (text: string, tone?: 'success' | 'error' | 'info') => void;
  onSaveAsTemplate?: () => void;
}

/**
 * NovaBlockEditor (Sprint 3 Core)
 * 鏋佽嚧鎬ц兘銆乽ipro 涓撲笟瑙嗚
 */
export const NovaBlockEditor = React.memo<NovaBlockEditorProps>(({
  note, onLiveChange, onSave, onNotify, onSaveAsTemplate
}) => {
  const { isAiEnabled } = useAI();
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(note?.created_at || null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [fps, setFps] = useState(0);
  const [isBlockMenuOpen, setIsBlockMenuOpen] = useState(false);
  const [targetPos, setTargetPos] = useState<number | null>(null);
  const [stickers, setStickers] = useState<StickerData[]>([]);
  const [stickyNotes, setStickyNotes] = useState<StickyNoteData[]>([]);
  const [isStickerMode, setIsStickerMode] = useState(false);
  const [isStickerPanelOpen, setIsStickerPanelOpen] = useState(false);
  const [isEmoticonPanelOpen, setIsEmoticonPanelOpen] = useState(false);
  const [backgroundPaper, setBackgroundPaper] = useState<BackgroundPaperType>(note?.background_paper || 'none');
  const [spellcheckError, setSpellcheckError] = useState<{ error: any, rect: any } | null>(null);
  const blockMenuRef = useRef<HTMLDivElement>(null);
  const emoticonPanelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeDragHandlePosRef = useRef(-1);
  const dragHandleRepositionFrameRef = useRef<number | null>(null);
  const dragInteractionRef = useRef<{ startX: number; startY: number; startTime: number } | null>(null);

  const slashItemsRef = useRef<any[]>(NOVA_BLOCK_SLASH_ITEMS);
  slashItemsRef.current = NOVA_BLOCK_SLASH_ITEMS;
  
  // 淇濇寔瀵规渶鏂?note 鐨勫紩鐢紝闃叉鍦?useEditor 闂寘涓嬁鍒版棫鐨?state 瀵艰嚧灞炴€ц瑕嗙洊
  const latestNoteRef = useRef(note);
  const isSavingRef = useRef(false);
  const queuedPayloadRef = useRef<any | null>(null);

  // Global drop cursor ghost cleanup (running during drag)
  useEffect(() => {
    let cleanupTimer: any = null;
    const cleanupGhosts = () => {
      if (cleanupTimer) return;
      cleanupTimer = requestAnimationFrame(() => {
        cleanupTimer = null;
        const cursors = document.querySelectorAll('.nova-drop-cursor, .ProseMirror-dropcursor');
        if (cursors.length > 1) {
          // Keep the last one visible, hide the rest without removing them from DOM
          // This prevents ProseMirror DropCursorView from crashing when it tries to removeChild on nodes we already deleted
          for (let i = 0; i < cursors.length - 1; i++) {
            (cursors[i] as HTMLElement).style.display = 'none';
            (cursors[i] as HTMLElement).style.opacity = '0';
          }
        }
      });
    };

    window.addEventListener('dragover', cleanupGhosts);
    window.addEventListener('drag', cleanupGhosts);
    
    // Safety net on drag end as well
    const forceCleanAll = () => {
      setTimeout(() => {
        document.querySelectorAll('.nova-drop-cursor, .ProseMirror-dropcursor').forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
      }, 50);
      setTimeout(() => {
        document.querySelectorAll('.nova-drop-cursor, .ProseMirror-dropcursor').forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
      }, 300);
    };
    window.addEventListener('dragend', forceCleanAll);
    window.addEventListener('drop', forceCleanAll);

    return () => {
      window.removeEventListener('dragover', cleanupGhosts);
      window.removeEventListener('drag', cleanupGhosts);
      window.removeEventListener('dragend', forceCleanAll);
      window.removeEventListener('drop', forceCleanAll);
      if (cleanupTimer) cancelAnimationFrame(cleanupTimer);
    };
  }, []);


  useEffect(() => {
    latestNoteRef.current = note;
  }, [note]);

  const handleStickersChange = useCallback((newStickers: StickerData[]) => {
    setStickers(newStickers);
    if (latestNoteRef.current) {
      latestNoteRef.current = { ...latestNoteRef.current, stickers: newStickers };
    }
    if (!isDirty) setIsDirty(true);
  }, [isDirty]);

  const handleStickyNotesChange = useCallback((newNotes: StickyNoteData[]) => {
    setStickyNotes(newNotes);
    if (latestNoteRef.current) {
      latestNoteRef.current = { ...latestNoteRef.current, sticky_notes: newNotes };
    }
    if (!isDirty) setIsDirty(true);
  }, [isDirty]);

  // 鏍稿績 Tiptap 鎵╁睍閰嶇疆 (楂樻€ц兘 memo 妯″紡)
  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      link: false,
      underline: false,
      dropcursor: false,
    }),
    AILoadingNode,
    Dropcursor.configure({
      color: 'hsl(var(--primary))',
      width: 2,
      class: 'nova-drop-cursor',
    }),
    Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    Blockquote,
    CodeBlock,
    Link.configure({ openOnClick: true, autolink: true }),
    Highlight,
    UnderlineExtension,
    TiptapTable.configure({ resizable: true }),
    TableRow,
    DatabaseTableHeader,
    DatabaseTableCell,
    MathInline,
    MathBlock,
    Footnote,
    ColumnGroup,
    Column,
    HighlightBlock,
    AudioNode,
    VideoNode,
    EmbedNode,
    FileNode,
    CalloutNode,
    WikiLink,
    TaskList,
    TaskItem.configure({ nested: true }),
    ResizableImage.configure({ inline: false }),
    WashiTape,
    JournalStamp,
    FilePlaceholder,
    FileUpload,
    CountdownNode,
    MusicPlayerNode,
    MiniCalendarNode,
    KanbanNode,
    HabitTrackerNode,
    TodoNode,
    Emoticon,
    SliderExtension,
    TextEffect,
    AISpellcheck.configure({ debounceMs: 800 }),
    NoteLink.configure({ suggestion: getNoteLinkSuggestionConfig() }),
    SlashCommands.configure({ suggestion: getSuggestionConfig(slashItemsRef, isAiEnabled) }),
  ], [isAiEnabled]);

  const [outline, setOutline] = useState<any[]>([]);
  const outlineTimerRef = useRef<any>(null);

  // 鎻愬彇澶х翰鏁版嵁鐢ㄤ簬 TOC
  const updateOutline = useCallback((editorInstance: Editor) => {
    if (outlineTimerRef.current) {
      clearTimeout(outlineTimerRef.current);
    }
    
    outlineTimerRef.current = setTimeout(() => {
      const items: any[] = [];
      let foldLevel: number | null = null;
      
      editorInstance.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          const currentLevel = node.attrs.level;
          
          // 閫昏緫涓?CollapsibleHeading 淇濇寔涓€鑷?
          if (foldLevel !== null && currentLevel <= foldLevel) {
            foldLevel = null;
          }

          // 濡傛灉澶勪簬鎶樺彔鑼冨洿鍐咃紝涓嶅姞鍏ュぇ绾?
          if (foldLevel !== null) return false;

          const text = node.textContent;
          const displayText = text.trim() === '' ? '无标题' : text;
          const baseId = node.attrs.id || `h-pending-${pos}`;
          
          items.push({
            id: baseId,
            key: baseId + '-' + pos + '-' + currentLevel, // Ensure absolute uniqueness for React Key
            text: displayText,
            level: currentLevel,
          });

          if (node.attrs.collapsed) {
            foldLevel = currentLevel;
          }
          return false;
        }
        
        if (node.isBlock && foldLevel !== null) return false;
        return true;
      });

      // 鍙湁鍦ㄧ粨鏋勬垨鏍稿績鏁版嵁鍙戠敓鍙樺寲鏃舵墠鏇存柊鐘舵€?
      setOutline((prev) => {
        // 鍏抽敭锛氬鏋滃綋鍓嶅寘鍚?pending ID锛屾垨鑰呬箣鍓嶅寘鍚?pending ID锛屽繀椤诲厑璁告洿鏂颁互杈惧埌鏈€缁堢ǔ瀹氱姸鎬?
        const hasPending = items.some(it => it.id.startsWith('h-pending-'));
        const prevHasPending = prev.some(it => it.id.startsWith('h-pending-'));

        if (!hasPending && !prevHasPending && 
            prev.length === items.length && 
            prev.every((item, i) => item.id === items[i].id && item.text === items[i].text && item.level === items[i].level)) {
          return prev;
        }
        return items;
      });
    }, 500); // 500ms 闃叉姈锛屽ぇ骞呮彁鍗囪緭鍏ユ€ц兘锛屾潨缁?React 娓叉煋姝婚攣
  }, []);

  const editor = useEditor({
    extensions,
    content: note?.content || '<p></p>',
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      // 閬垮厤閲嶅璁剧疆鐘舵€佸鑷?React React 姝诲惊鐜?
      if (!isDirty) {
        setIsDirty(true);
      }
      
      const html = editor.getHTML();
      const currentLatestNote = latestNoteRef.current;
      const payload: any = { ...currentLatestNote, content: html };
      
      if (!currentLatestNote?.is_title_manually_edited) {
        // Extract title from the first text-containing block
        const docContent = editor.getJSON().content || [];
        let autoTitle = '';
        for (const block of docContent) {
          if (block.content && block.content.length > 0) {
            autoTitle = block.content.map((n: any) => n.text || '').join('');
            if (autoTitle.trim() !== '') {
              break; // use the first non-empty text
            }
          }
        }
        if (autoTitle.trim() !== '') {
          payload.title = autoTitle.trim();
        } else {
          payload.title = '未命名笔记';
        }
      }
      
      latestNoteRef.current = payload;
      onLiveChange?.(payload);
      // 杩欓噷涓嶈鍦ㄦ瘡娆℃寜閿椂绔嬪埢 await onSave(payload)锛屽洜涓?onUpdate 鏄悓姝ヨЕ鍙戠殑楂橀浜嬩欢
      // 璁?handleSave (debounced) 鍘绘帴绠′繚瀛橀€昏緫锛屾瀬澶ф彁楂樿緭鍏ユ€ц兘
      // 鍙湁鍦ㄩ渶瑕佺珛鍗虫洿鏂板ぇ绾叉椂锛屾墠璋冪敤 updateOutline(editor);
      updateOutline(editor);
    },
    onTransaction: ({ editor }) => {
      // 鍦ㄤ簨鍔℃彁浜ゅ悗鏇存柊澶х翰锛屾崟鎹夋嫋鎷藉拰灞炴€у彉鍖?
      updateOutline(editor);
    },
    onCreate: ({ editor }) => {
      // 寮哄埗杩愯涓€娆?ID 琛ュ叏
      // @ts-ignore
      editor.commands.ensureHeadingIds();
      updateOutline(editor);
    },
    editorProps: {
      attributes: {
        class: 'novablock-editor prose prose-stone dark:prose-invert max-w-none focus:outline-none min-h-[500px] w-full mx-auto pt-4 px-12 mb-32 font-sans text-foreground selection:bg-primary/20'
      },
      handleKeyDown: (view, event) => {
        // `/e` + Enter -> 鎵撳紑琛ㄦ儏闈㈡澘锛堥樆姝㈡崲琛岋紝骞跺垹闄よЕ鍙戞枃鏈級
        if (event.key !== 'Enter') return false;

        const { state } = view;
        const { selection } = state;
        if (!selection.empty) return false;

        const { from } = selection;
        if (from < 2) return false;

        const trigger = state.doc.textBetween(from - 2, from, '\0', '\0');
        if (trigger !== '/e') return false;

        // 纭繚 `/e` 鏄竴涓嫭绔嬭Е鍙戯紙鍓嶄竴涓瓧绗︿负绌烘垨绌虹櫧锛?
        const prevChar = from - 3 >= 0 ? state.doc.textBetween(from - 3, from - 2, '\0', '\0') : '';
        if (prevChar && !/\s/.test(prevChar)) return false;

        event.preventDefault();
        const tr = state.tr.delete(from - 2, from);
        view.dispatch(tr);
        setIsEmoticonPanelOpen(true);
        return true;
      },
    }
  }, [extensions, updateOutline]);

  const getEditorViewDom = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isInitialized) {
      return null;
    }

    try {
      return editor.view.dom;
    } catch (_error) {
      return null;
    }
  }, [editor]);

  const scheduleDragHandleReposition = useCallback(() => {
    const editorDom = getEditorViewDom();
    if (!editor || editor.isDestroyed || !editorDom) {
      return;
    }

    if (dragHandleRepositionFrameRef.current !== null) {
      cancelAnimationFrame(dragHandleRepositionFrameRef.current);
    }

    dragHandleRepositionFrameRef.current = requestAnimationFrame(() => {
      dragHandleRepositionFrameRef.current = null;

      const dragHandleElement = getDragHandleElement(blockMenuRef.current);

      void repositionDragHandleAtNode({
        editor,
        dragHandleElement,
        pos: activeDragHandlePosRef.current,
        computePositionConfig: dragHandleComputePositionConfig,
      });
    });
  }, [editor, getEditorViewDom]);

  useEffect(() => {
    const handleAddSticker = (e?: Event) => {
      const detail = (e as CustomEvent<{ content?: string; url?: string; type?: 'image' | 'text'; x?: number; y?: number }>)?.detail;
      const type = detail?.type || (detail?.url ? 'image' : 'text');
      
      const defaultX = scrollContainerRef.current ? scrollContainerRef.current.clientWidth / 2 - 100 : 100;
      const defaultY = scrollContainerRef.current ? scrollContainerRef.current.scrollTop + 100 : 100;

      const x = detail?.x ?? defaultX;
      const y = detail?.y ?? defaultY;

      if (type === 'image' && detail?.url) {
        const newSticker: StickerData = {
          id: Math.random().toString(36).substring(7),
          type: 'image',
          url: detail.url,
          x,
          y,
          scale: 1,
          rotation: (Math.random() - 0.5) * 10,
          opacity: 1,
        };
        handleStickersChange([...stickers, newSticker]);
      } else {
        const newSticky: StickyNoteData = {
          id: Math.random().toString(36).substring(7),
          x,
          y,
          color: 'rgba(254, 240, 138, 1)',
          rotation: (Math.random() - 0.5) * 10,
          content: detail?.content || '<p></p>',
        };
        handleStickyNotesChange([...stickyNotes, newSticky]);
      }
    };
    window.addEventListener('add-sticky-note', handleAddSticker as EventListener);
    
    const handleOpenEmoticon = (e?: any) => {
      if (e && e.stopPropagation) e.stopPropagation();
      setIsEmoticonPanelOpen(true);
    };
    window.addEventListener('open-emoticon-panel', handleOpenEmoticon);

    const handleAIWrite = async (e: any) => {
      const { prompt } = e.detail;
      if (!editor) return;

      if (!isAiEnabled) {
        onNotify?.('请先在设置中开启 AI 插件', 'info');
        return;
      }
      
      // 在当前光标位置插入像素女仆动图加载占位
      try {
        editor.chain().insertContent({ type: "aiLoadingPlaceholder" }).run();
      } catch(e) {
        console.error('Failed to insert AI placeholder:', e);
      }

      try {
        const { api } = await import('../../lib/api');
        
        let streamBuffer = '';
        let isFirstToken = true;
        
        // --- 实时流式解析状态 ---
        let currentStreamingAction: { type: string; language?: string; startPos: number } | null = null;
        let lastActionValue = ''; // 记录上一次 Action 累积的内容，用于增量插入

        const flushText = (text: string) => {
          if (text && editor) {
            editor.chain().focus().insertContent(text).run();
          }
        };

        await api.streamInlineAI(
          { prompt, context: editor.getText(), action: 'ask' },
          (chunk: string) => {
            if (isFirstToken) {
              isFirstToken = false;

              // 查找并删除像素女仆动图
              const { tr } = editor.state;
              let foundPos = -1;
              tr.doc.descendants((node, pos) => {
                if (node.type.name === 'aiLoadingPlaceholder') {
                  foundPos = pos;
                  return false;
                }
                return true;
              });
              if (foundPos !== -1) {
                editor.chain().deleteRange({ from: foundPos, to: foundPos + 1 }).focus().run();
              }
            }
            streamBuffer += chunk;
            
            const processBuffer = () => {
              if (currentStreamingAction) {
                // 鎴戜滑姝ｅ浜庝竴涓?Action 鏍囩鍐呴儴
                const actionEnd = streamBuffer.toLowerCase().indexOf('</action>');
                
                if (actionEnd !== -1) {
                  // Action 缁撴潫浜嗭紒
                  const innerContent = streamBuffer.slice(0, actionEnd);
                  const incremental = innerContent.slice(lastActionValue.length);
                  
                  if (incremental) {
                    // 琛ラ綈鏈€鍚庝竴鐐瑰閲?
                    if (currentStreamingAction.type === 'insert_code_block' || currentStreamingAction.type === 'insert_text' || currentStreamingAction.type === 'insert_todo') {
                       // 绉婚櫎鍙兘鏈夌殑 markdown 浠ｇ爜鍧楀寘瑁圭 (浠呭湪 insert_code_block/insert_todo 鏃?
                       let cleanInc = incremental;
                       if (currentStreamingAction.type !== 'insert_text') {
                         cleanInc = cleanInc.replace(/```[a-z]*\n?/gi, '').replace(/\n?```$/gi, '');
                       }
                       if (cleanInc) flushText(cleanInc);
                    }
                  }

                  // 杩欓噷鐨勯€昏緫鍙互淇濈暀 handleAIAction 鍘熸湁鐨勯潪娴佸紡 Action 澶勭悊閫昏緫 (濡?set_title)
                  // 浣嗕负浜嗘敮鎸佸叏閲?Action锛屾垜浠繕鏄?dispatch 涓€涓畬鏁寸殑浜嬩欢
                  const fullTag = `<Action type="${currentStreamingAction.type}"${currentStreamingAction.language ? ` language="${currentStreamingAction.language}"` : ''}>${innerContent}</Action>`;
                  const match = /<Action\s+type=(?:"|')([^"']+)(?:"|')(?:\s+language=(?:"|')([^"']+)(?:"|'))?\s*>([\s\S]*?)<\/Action>/i.exec(fullTag);
                  if (match && !['insert_code_block', 'insert_text', 'insert_todo'].includes(match[1])) {
                    // 鍙湁闈炲疄鏃舵祦寮忕殑 Action 鎵嶉噸鏂拌Е鍙?handleAIAction
                    const [, type, language, value] = match;
                    window.dispatchEvent(new CustomEvent('ai-action', { 
                      detail: { type, value: value.trim(), attrs: { language } } 
                    }));
                  }

                  // 閲嶇疆鐘舵€?
                  currentStreamingAction = null;
                  lastActionValue = '';
                  streamBuffer = streamBuffer.slice(actionEnd + 9);
                  if (streamBuffer.length > 0) processBuffer();
                } else {
                  // 杩樺湪 Action 鍐呴儴锛屽皾璇曟祦寮忚緭鍑?
                  // 瀵绘壘鍐呭閮ㄥ垎鐨勮捣濮嬶紙璺宠繃鍙兘杩樺湪 buffer 閲岀殑鏍囩寮€澶达級
                  // 杩欓噷鐨?innerContent 灏辨槸 Action 鏍囩閲岀殑鏂囨湰
                  const incremental = streamBuffer.slice(lastActionValue.length);
                  
                  // 鍙湁鐗瑰畾鐨?Action 绫诲瀷鏀寔瀹炴椂娴佸紡杈撳嚭鍒扮紪杈戝櫒
                  if (['insert_code_block', 'insert_text', 'insert_todo'].includes(currentStreamingAction.type)) {
                    // 绠€鍗曠殑澧為噺杈撳嚭銆傛敞鎰忥細濡傛灉杩欓噷鏈夊鏉傜殑 markdown 鍖呰９绗︼紝娴佸紡鏃朵細甯﹀嚭鏉?
                    // 鍙湁褰撶Н绱埌涓€瀹氶暱搴︽垨鑰呮娴嬪埌鎹㈣鏃舵墠杈撳嚭锛岄伩鍏嶈繃浜庨浂纰庣殑浜嬪姟
                    if (incremental.length > 5 || incremental.includes('\n')) {
                      let cleanInc = incremental;
                      // 绠€鍗曞鐞嗭細濡傛灉鏄?insert_code_block锛屾祦寮忚繃绋嬩腑涓嶆樉绀?```
                      if (currentStreamingAction.type !== 'insert_text') {
                        cleanInc = cleanInc.replace(/```[a-z]*\n?/gi, '').replace(/\n?```$/gi, '');
                      }
                      
                      if (cleanInc) {
                        flushText(cleanInc);
                        lastActionValue += incremental; // 璁板綍宸插鐞嗙殑鍘熷閮ㄥ垎
                      }
                    }
                  }
                }
              } else {
                // 娌″湪 Action 鍐呴儴锛屽鎵炬爣绛惧紑濮?
                const actionStart = streamBuffer.search(/<Action/i);
                
                if (actionStart === -1) {
                  // 娌℃壘鍒版爣绛惧紑濮嬶紝鐪嬬湅鏈熬鏄惁鍙兘鏄墠缂€
                  const lastBracket = streamBuffer.lastIndexOf('<');
                  if (lastBracket !== -1 && '<action'.startsWith(streamBuffer.slice(lastBracket).toLowerCase())) {
                    const before = streamBuffer.slice(0, lastBracket);
                    if (before) flushText(before);
                    streamBuffer = streamBuffer.slice(lastBracket);
                  } else {
                    flushText(streamBuffer);
                    streamBuffer = '';
                  }
                } else {
                  // 鎵惧埌浜?<Action
                  if (actionStart > 0) {
                    flushText(streamBuffer.slice(0, actionStart));
                    streamBuffer = streamBuffer.slice(actionStart);
                  }
                  
                  // 妫€鏌ユ爣绛惧ご鏄惁瀹屾暣 (鐩村埌 >)
                  const tagHeaderEnd = streamBuffer.indexOf('>');
                  if (tagHeaderEnd !== -1) {
                    const tagHeader = streamBuffer.slice(0, tagHeaderEnd + 1);
                    const match = /<Action\s+type=(?:"|')([^"']+)(?:"|')(?:\s+language=(?:"|')([^"']+)(?:"|'))?\s*>/i.exec(tagHeader);
                    
                    if (match) {
                      const [, type, language] = match;
                      currentStreamingAction = { type, language, startPos: editor.state.selection.from };
                      lastActionValue = ''; 
                      
                      // 閽堝涓嶅悓鐨?Action 绫诲瀷锛屾祦寮忓紑濮嬪墠鍏堝仛浜涘噯澶?
                      if (type === 'insert_code_block') {
                        editor.chain().focus().insertContent({
                          type: 'codeBlock',
                          attrs: { language: language || 'plain' },
                          content: []
                        }).run();
                        // Tiptap 鎻掑叆 block 鍚庡厜鏍囦細鑷姩杩涘叆锛屾墍浠ユ帴涓嬫潵鐨?flushText 浼氭彃鍏ュ埌 codeBlock 鍐呴儴
                      } else if (type === 'insert_todo') {
                        editor.chain().focus().insertContent({
                          type: 'taskList',
                          content: [{
                            type: 'taskItem',
                            attrs: { checked: false },
                            content: [{ type: 'paragraph', content: [] }]
                          }]
                        }).run();
                      }
                      
                      streamBuffer = streamBuffer.slice(tagHeaderEnd + 1);
                      if (streamBuffer.length > 0) processBuffer();
                    } else {
                      // 濂囨€殑鏍囩锛屾寜鏂囨湰澶勭悊
                      flushText(tagHeader);
                      streamBuffer = streamBuffer.slice(tagHeaderEnd + 1);
                      if (streamBuffer.length > 0) processBuffer();
                    }
                  }
                }
              }
            };

            processBuffer();
          }
        );
        
        if (streamBuffer) {
          flushText(streamBuffer);
        }
      } catch (err: any) {
        console.error(err);

        // 查找并删除像素女仆动图 (清理)
        const { tr } = editor.state;
        let foundPos = -1;
        tr.doc.descendants((node, pos) => {
          if (node.type.name === 'aiLoadingPlaceholder') {
            foundPos = pos;
            return false;
          }
          return true;
        });
        if (foundPos !== -1) {
          editor.chain().deleteRange({ from: foundPos, to: foundPos + 1 }).run();
        }

        editor.chain().focus().insertContent(`\n[AI 生成失败: ${err.message}]`).run();
      }
    };
    window.addEventListener('ai-write', handleAIWrite as EventListener);

    const handleAIAction = (e: any) => {
      const { type, value, attrs } = e.detail;
      console.log(`[NovaBlock] Handling AI Action: ${type}`, { value, attrs });
      
      if (!isAiEnabled) {
        onNotify?.('璇峰厛鍦ㄨ缃腑寮€鍚?AI 鎻掍欢', 'info');
        return;
      }

      if (type === 'set_title') {
        const newTitle = value.trim();
        if (newTitle) {
          const currentNote = latestNoteRef.current;
          if (currentNote) {
            const payload = { ...currentNote, title: newTitle, is_title_manually_edited: true };
            onSave(payload);
            latestNoteRef.current = payload;
          }
          // 鍚屾鏇存柊缂栬緫鍣ㄥ唴瀹归《閮ㄧ殑 H1
          if (editor) {
            const firstNode = editor.state.doc.firstChild;
            if (firstNode && firstNode.type.name === 'heading' && firstNode.attrs.level === 1) {
              // 鏇存柊宸插瓨鍦ㄧ殑 H1
              editor.chain().setNodeSelection(0).insertContent({
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: newTitle }]
              }).run();
            } else {
              // 鍦ㄩ《閮ㄦ彃鍏ユ柊鐨?H1
              editor.chain().insertContentAt(0, {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: newTitle }]
              }).run();
            }
          }
        }
      } else if (type === 'set_tags') {
        const tags = value.split(',').map((t: string) => t.trim()).filter((t: string) => t !== '');
        if (tags.length > 0) {
          const currentNote = latestNoteRef.current;
          if (currentNote) {
            const payload = { ...currentNote, tags };
            onSave(payload);
            latestNoteRef.current = payload;
          }
          // 鍦ㄧ紪杈戝櫒涓彃鍏ユ爣绛撅紙閫氬父鍦ㄦ爣棰樹笅鏂癸級
          if (editor) {
            const tagText = tags.map((t: string) => `#${t}`).join(' ');
            // 鏌ユ壘鏄惁鏈?H1锛屽鏋滄湁锛屽湪 H1 鍚庨潰鎻掑叆
            const firstNode = editor.state.doc.firstChild;
            let insertPos = 0;
            if (firstNode && firstNode.type.name === 'heading' && firstNode.attrs.level === 1) {
              insertPos = firstNode.nodeSize;
            }
            editor.chain().insertContentAt(insertPos, {
              type: 'paragraph',
              content: [{ type: 'text', text: tagText }]
            }).run();
          }
        }
      } else if (type === 'insert_code_block') {
        if (editor) {
          // 鍐呭娓呯悊锛氬墺绂诲彲鑳藉瓨鍦ㄧ殑 ``` 鍖呰
          const cleanValue = value.replace(/```[a-z]*\n?/gi, '').replace(/\n?```$/gi, '').trim();
          editor.chain().focus().insertContent({
            type: 'codeBlock',
            attrs: { language: attrs?.language || 'plain' },
            content: [{ type: 'text', text: cleanValue }]
          }).run();
        }
      } else if (type === 'insert_todo') {
        if (editor) {
          const cleanValue = value.replace(/```[a-z]*\n?/gi, '').replace(/\n?```$/gi, '').trim();
          editor.chain().focus().insertContent({
            type: 'taskList',
            content: [{
              type: 'taskItem',
              attrs: { checked: false },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: cleanValue }] }]
            }]
          }).run();
        }
      } else if (type === 'insert_text') {
        if (editor) {
          editor.chain().focus().insertContent(value).run();
        }
      }
    };
    window.addEventListener('ai-action', handleAIAction);

    const handleSpellcheckOpen = (e: any) => {
      if (e.detail?.noteId == null || isSpellcheckDetailForNote(note?.id ?? null, e.detail)) {
        setSpellcheckError(e.detail);
      }
    };
    window.addEventListener('open-spellcheck-suggestion', handleSpellcheckOpen);

    return () => {
      window.removeEventListener('add-sticky-note', handleAddSticker as EventListener);
      window.removeEventListener('open-emoticon-panel', handleOpenEmoticon);
      window.removeEventListener('ai-write', handleAIWrite as EventListener);
      window.removeEventListener('ai-action', handleAIAction);
      window.removeEventListener('open-spellcheck-suggestion', handleSpellcheckOpen);
    };
  }, [editor, stickers, stickyNotes, handleStickersChange, handleStickyNotesChange, note?.id, onSave]);

  useEffect(() => {
    setStickers(note?.stickers || []);
    setStickyNotes(note?.sticky_notes || []);
    setBackgroundPaper(note?.background_paper || 'none');
    setSpellcheckError(null);
  }, [note?.id, note?.stickers, note?.sticky_notes, note?.background_paper]);

  useEffect(() => {
    const editorDom = getEditorViewDom();
    if (!editorDom) {
      return;
    }

    if (note?.id !== undefined && note?.id !== null) {
      editorDom.setAttribute('data-note-id', String(note.id));
      return;
    }

    editorDom.removeAttribute('data-note-id');
  }, [getEditorViewDom, note?.id]);

  useEffect(() => {
    const editorDom = getEditorViewDom();
    if (!editorDom) {
      return;
    }

    const handleSpellcheckMarkerClick = (event: MouseEvent) => {
      const marker = findSpellcheckMarkerFromTarget(event.target);
      const parsedError = parseSpellcheckErrorFromTarget(event.target);
      if (!marker || !parsedError) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rect = marker.getBoundingClientRect();
      setSpellcheckError({
        error: parsedError,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      });
    };

    editorDom.addEventListener('click', handleSpellcheckMarkerClick, true);
    return () => {
      editorDom.removeEventListener('click', handleSpellcheckMarkerClick, true);
    };
  }, [getEditorViewDom, note?.id]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.isInitialized || !note?.id) {
      return;
    }

    const timerId = window.setTimeout(() => {
      const spellcheckStorage = (editor.storage as any)?.aiSpellcheck;
      if (!spellcheckStorage?.runCheck) {
        return;
      }

      if (editor.isDestroyed || !editor.isInitialized) {
        return;
      }

      editor.state.doc.descendants((node: any) => {
        if (node.type?.name === 'paragraph' && node.textContent?.trim()) {
          try {
            void spellcheckStorage.runCheck(editor.view, node.textContent);
          } catch (_error) {
            return false;
          }
          return false;
        }
        return true;
      });
    }, 250);

    return () => window.clearTimeout(timerId);
  }, [editor, note?.id, note?.content]);

  // 淇濆瓨閫昏緫
  const handleSave = useCallback(async (content?: string, updates?: Partial<Note>) => {
    const currentNote = latestNoteRef.current;
    if (!currentNote) return;
    
    // 鍚堝苟鏈€鏂扮殑缂栬緫鍣ㄥ唴瀹瑰拰浼犲叆鐨勫閲忔洿鏂?(濡傚ぉ姘斻€佸績鎯?
    const html = content || editor?.getHTML() || '';
    const payloadToSave = { ...currentNote, ...updates, content: html };

    const runSave = async (nextPayload: any): Promise<void> => {
      isSavingRef.current = true;
      setIsSaving(true);
      try {
        const savedNote = await onSave(nextPayload);
        latestNoteRef.current = savedNote ? { ...nextPayload, ...savedNote } : nextPayload;
        if (editor?.getHTML() === latestNoteRef.current?.content) {
          setIsDirty(false);
        }
        setLastSavedAt(new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Save failed:', err);
        onNotify?.('淇濆瓨澶辫触', 'error');
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);

        const queuedPayload = queuedPayloadRef.current;
        if (queuedPayload) {
          queuedPayloadRef.current = null;
          await runSave(queuedPayload);
        }
      }
    };

    if (isSavingRef.current) {
      queuedPayloadRef.current = payloadToSave;
      return;
    }

    await runSave(payloadToSave);
  }, [editor, onNotify, onSave]);

  // 鑷姩淇濆瓨 (debounce)
  const timerRef = useRef<any>(null);
  const autosaveDelayMs = window.electron?.ipcInvoke ? 0 : 3000;
  useEffect(() => {
    // 鍙鏈夋敼鍔紝灏辫缃畾鏃跺櫒
    if (!isDirty) return;
    
    if (timerRef.current) clearTimeout(timerRef.current);
    
    timerRef.current = setTimeout(() => {
      handleSave();
    }, autosaveDelayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autosaveDelayMs, handleSave, isDirty]);

  useEffect(() => {
    const flushPendingSave = () => {
      if (!latestNoteRef.current) {
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (isDirty || isSavingRef.current || queuedPayloadRef.current) {
        void handleSave(latestNoteRef.current.content, latestNoteRef.current);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSave();
      }
    };

    window.addEventListener('beforeunload', flushPendingSave);
    window.addEventListener('pagehide', flushPendingSave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const unsubscribeBeforeClose = window.electron?.onBeforeAppClose?.(async () => {
      try {
        await handleSave(latestNoteRef.current?.content, latestNoteRef.current || undefined);
      } finally {
        window.electron?.finishBeforeAppClose?.();
      }
    });

    return () => {
      window.removeEventListener('beforeunload', flushPendingSave);
      window.removeEventListener('pagehide', flushPendingSave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribeBeforeClose?.();
    };
  }, [handleSave, isDirty]);

  const [blockMenuPos, setBlockMenuPos] = useState({ top: 0, left: 0 });
  const [blockMenuAnchorRect, setBlockMenuAnchorRect] = useState<{ top: number; left: number; right: number; bottom: number } | null>(null);
  const blockMenuContentRef = useRef<HTMLDivElement>(null);

  const getBlockMenuAnchorRect = useCallback((pos: number) => {
    if (!editor) {
      return null;
    }

    const dragHandleElement = getDragHandleElement(blockMenuRef.current);
    const referenceRect = getDragHandleReferenceRect(editor, pos);

    if (!(dragHandleElement instanceof HTMLElement) || !referenceRect) {
      return null;
    }
    const handleRect = dragHandleElement.getBoundingClientRect();

    return {
      top: Math.min(referenceRect.top, handleRect.top),
      left: handleRect.left,
      right: handleRect.right,
      bottom: Math.max(referenceRect.bottom, handleRect.bottom),
    };
  }, [editor]);

  // 瑙嗗彛杈圭晫妫€娴嬶細闃叉鑿滃崟琚伄鎸?
  useLayoutEffect(() => {
    if (isBlockMenuOpen && blockMenuContentRef.current && blockMenuAnchorRect) {
      const rect = blockMenuContentRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 16;
      let left = blockMenuAnchorRect.right + 8;
      let top = blockMenuAnchorRect.top - 8;

      if (left + rect.width > viewportWidth - margin) {
        left = Math.max(margin, blockMenuAnchorRect.left - rect.width - 8);
      }

      if (top + rect.height > viewportHeight - margin) {
        top = Math.max(margin, viewportHeight - rect.height - margin);
      }

      top = Math.max(margin, top);

      setBlockMenuPos({ top, left });
    }
  }, [blockMenuAnchorRect, isBlockMenuOpen]);

  // 鐐瑰嚮澶栭儴鍏抽棴鍧楄彍鍗?
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as unknown as HTMLElement;
      const clickedHandle = blockMenuRef.current?.contains(target);
      const clickedMenu = blockMenuContentRef.current?.contains(target);

      if (!clickedHandle && !clickedMenu) {
        setIsBlockMenuOpen(false);
      }
    };

    if (isBlockMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isBlockMenuOpen]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    try {
      if (editor.isDestroyed) return;
      const tr = editor.state.tr.setMeta('lockDragHandle', isBlockMenuOpen);
      editor.view.dispatch(tr);
    } catch (e) {
      // Ignore if view is not ready or unmounted
    }
  }, [editor, isBlockMenuOpen]);

  // 鐐瑰嚮澶栭儴鍏抽棴琛ㄦ儏闈㈡澘
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emoticonPanelRef.current && !emoticonPanelRef.current.contains(event.target as unknown as HTMLElement)) {
        setIsEmoticonPanelOpen(false);
      }
    };

    let timer: any;
    if (isEmoticonPanelOpen) {
      // Use setTimeout to avoid catching the current mousedown event that might be bubbling up
      timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEmoticonPanelOpen]);

  // 处理拖拽手柄点击：严格区分点击与拖拽 (Notion 风格)
  const handleGripClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // 如果最近有显著的拖拽行为，不触发点击菜单
    if (dragInteractionRef.current) {
      const { startX, startY, startTime } = dragInteractionRef.current;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const duration = Date.now() - startTime;

      // Notion 逻辑：如果移动距离超过阈值，视为拖拽
      if (distance > 4 || duration > 300) {
        dragInteractionRef.current = null;
        return;
      }
    }

    if (!editor) return;

    // 清除状态防止干扰
    dragInteractionRef.current = null;

    if (!isBlockMenuOpen) {
      const blockPos = activeDragHandlePosRef.current;
      if (blockPos >= 0) {
        setTargetPos(blockPos);
        const gripRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setBlockMenuAnchorRect({
          top: gripRect.top,
          left: gripRect.left,
          right: gripRect.right,
          bottom: gripRect.bottom,
        });
        
        // Notion 点击手柄时会选中该块
        editor.commands.setNodeSelection(blockPos);
        
        // 同时延迟打开菜单以确保布局稳定
        requestAnimationFrame(() => {
          setIsBlockMenuOpen(true);
        });
        return;
      }
    }
    
    setIsBlockMenuOpen(!isBlockMenuOpen);
  };

  const handleGripMouseDown = (e: React.MouseEvent) => {
    dragInteractionRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
    };
  };
  
  // 鎬ц兘鐩戞帶 (uipro 鏍稿績閾佸緥锛氭€ц兘绗竴)
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    const updateFps = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }
      requestAnimationFrame(updateFps);
    };
    const animId = requestAnimationFrame(updateFps);
    return () => cancelAnimationFrame(animId);
  }, []);

  const [prevNoteId, setPrevNoteId] = useState<number | string | undefined>(note?.id);

  // 鍚屾鍐呭 (浠呭湪鍒囨崲绗旇锛屾垨缂栬緫鍣ㄥ畬鍏ㄤ负绌轰絾鏈夊唴瀹规椂)
  useEffect(() => {
    if (!editor || !note?.id) return;
    
    if (note.id !== prevNoteId) {
      editor.commands.setContent(note.content || '<p></p>', { emitUpdate: false });
      // 鍒囨崲鍐呭鍚庯紝寮哄埗琛ラ綈 ID 骞舵洿鏂板ぇ绾?
      // @ts-ignore
      editor.commands.ensureHeadingIds();
      setPrevNoteId(note.id);
      updateOutline(editor);
    }
  }, [note?.id, note?.content, editor, prevNoteId, updateOutline]);

  // 鍚屾棰勮/缂栬緫妯″紡
  useEffect(() => {
    if (editor) {
      editor.setEditable(viewMode === 'edit');
    }
  }, [editor, viewMode]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (!scrollContainer) {
      return;
    }

    const handleReposition = () => {
      scheduleDragHandleReposition();
    };

    scrollContainer.addEventListener('scroll', handleReposition, { passive: true });
    window.addEventListener('resize', handleReposition);

    return () => {
      scrollContainer.removeEventListener('scroll', handleReposition);
      window.removeEventListener('resize', handleReposition);
    };
  }, [scheduleDragHandleReposition]);

  useEffect(() => {
    if (!isBlockMenuOpen || targetPos === null) {
      return;
    }

    const syncMenuAnchor = () => {
      setBlockMenuAnchorRect(getBlockMenuAnchorRect(targetPos));
    };

    const scrollContainer = scrollContainerRef.current;
    syncMenuAnchor();
    window.addEventListener('resize', syncMenuAnchor);
    scrollContainer?.addEventListener('scroll', syncMenuAnchor, { passive: true });

    return () => {
      window.removeEventListener('resize', syncMenuAnchor);
      scrollContainer?.removeEventListener('scroll', syncMenuAnchor);
    };
  }, [getBlockMenuAnchorRect, isBlockMenuOpen, targetPos]);

  useEffect(() => {
    if (!editor || typeof ResizeObserver === 'undefined') {
      return;
    }

    const scrollContainer = scrollContainerRef.current;
    let editorElement: Element | null = null;
    try {
      // Accessing editor.view throws an error in Tiptap if the view is not mounted yet
      if (editor.isDestroyed) return;
      editorElement = editor.view.dom;
    } catch (e) {
      return;
    }

    if (!scrollContainer || !editorElement) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleDragHandleReposition();
    });

    resizeObserver.observe(scrollContainer);
    resizeObserver.observe(editorElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [editor, scheduleDragHandleReposition]);

  useEffect(() => {
    return () => {
      if (dragHandleRepositionFrameRef.current !== null) {
        cancelAnimationFrame(dragHandleRepositionFrameRef.current);
      }
    };
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex flex-col h-full bg-transparent overflow-hidden"
    >
      
      {/* 鎬ц兘浠〃鐩?*/}
      <div className="fixed top-6 left-6 z-[100] flex items-center gap-2 px-3 py-1.5 bg-background/40 hover:bg-background/80 rounded-full backdrop-blur-xl border border-border/20 pointer-events-none transition-all duration-300 shadow-soft">
        <Cpu size={12} className={fps < 55 ? 'text-destructive' : 'text-primary'} />
        <span className="text-[10px] font-mono font-bold text-muted-foreground">{fps} FPS</span>
      </div>

      <div 
        data-note-id={note?.id ?? ''}
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto relative scrollbar-hide pt-0 custom-scrollbar"
        onScroll={() => {
          // 寮哄埗璁?tiptap-extension-drag-handle 閲嶆柊璁＄畻浣嶇疆锛岃В鍐虫粴鍔ㄦ紓绉婚棶棰?
          // 璇ユ彃浠跺唴閮ㄧ洃鍚簡 window 婊氬姩锛屼絾瀵逛簬鑷畾涔夋粴鍔ㄥ鍣ㄩ渶瑕佹墜鍔ㄨЕ鍙?
          scheduleDragHandleReposition();
        }}
        onDragEnd={() => {
          document.querySelectorAll('.nova-drop-cursor, .ProseMirror-dropcursor').forEach(el => {
            (el as HTMLElement).style.display = 'none';
          });
        }}
        onDragOver={(e) => {
          if (isStickerMode) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          if (!isStickerMode) return;
          e.preventDefault();
          
          try {
            const dataStr = e.dataTransfer.getData('application/json');
            if (!dataStr) return;
            
            const stickerData = JSON.parse(dataStr);
            if (stickerData.type === 'image' && stickerData.url) {
              // 璁＄畻鐩稿浜?scrollContainer 鐨勫潗鏍?
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top + e.currentTarget.scrollTop;

              window.dispatchEvent(new CustomEvent('add-sticky-note', { 
                detail: { 
                  url: stickerData.url, 
                  type: 'image',
                  x: x - 50, // 灞呬腑钀界偣
                  y: y - 50 
                } 
              }));
            }
          } catch (err) {
            console.error('Failed to handle sticker drop:', err);
          }
        }}
      >
        <div className="flex flex-col w-full max-w-[900px] mx-auto pb-40">
          <div className="px-12 mt-6">
            <EditorHeader
              icon={note?.icon ?? '馃摑'}
              title={note?.title ?? '未命名笔记'}
              isTitleManuallyEdited={note?.is_title_manually_edited ?? false}
              breadcrumbs={[]}
              onSelectBreadcrumb={() => {}}
              savePhase={isSaving ? 'saving' : isDirty ? 'queued' : 'idle'}
              isDirty={isDirty}
              lastSavedAt={lastSavedAt}
              showRelations={false}
              showOutline={false}
              viewMode={viewMode}
              isStickerMode={isStickerMode}
              backgroundPaper={backgroundPaper}
              onSave={() => handleSave()}
              onUpdateTitle={(newTitle, isManual) => {
                const currentNote = latestNoteRef.current;
                if(currentNote) {
                  const payload = { ...currentNote, title: newTitle, is_title_manually_edited: isManual };
                  onSave(payload);
                  latestNoteRef.current = payload;
                }
              }}
              onToggleRelations={() => {}}
              onOutlineEnter={() => {}}
              onOutlineLeave={() => {}}
              onSetViewMode={setViewMode}
              onToggleStickerMode={() => {
                const newMode = !isStickerMode;
                setIsStickerMode(newMode);
                if (newMode) setIsStickerPanelOpen(true);
                else setIsStickerPanelOpen(false);
              }}
              onOpenStickerPanel={() => setIsStickerPanelOpen(true)}
              onClearStickers={() => handleStickersChange([])}
              onSaveAsTemplate={onSaveAsTemplate}
              onChangeBackgroundPaper={(type) => {
                setBackgroundPaper(type);
                if (latestNoteRef.current) {
                  const payload = { ...latestNoteRef.current, background_paper: type };
                  setTimeout(() => {
                    onSave(payload);
                  }, 0);
                  latestNoteRef.current = payload;
                }
              }}
            />

            {note && (
              <div 
                className="mt-1 px-0"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <PropertyPanel 
                  note={note} 
                  onUpdate={(updated) => {
                    const currentNote = latestNoteRef.current;
                    if (currentNote) {
                      const payload = { ...currentNote, ...updated, silent: true };
                      onSave(payload);
                      latestNoteRef.current = { ...currentNote, ...updated };
                    }
                  }}
                  onFlushSave={(updates) => {
                    if (timerRef.current) clearTimeout(timerRef.current);
                    handleSave(editor?.getHTML(), updates);
                  }}
                />
              </div>
            )}
          </div>

          <div className="relative group/editor mt-2 w-full min-h-[500px] rounded-xl overflow-hidden">
            <BackgroundPaper type={backgroundPaper} />
            {/* Block 鎷栨嫿鎵嬫焺 */}
            {editor && (
              /* @ts-ignore */
              <DragHandle 
                editor={editor} 
                pluginKey="DragHandle"
                // @ts-ignore
                getReferencedVirtualElement={() => getDragHandleVirtualReference(editor, activeDragHandlePosRef.current)}
                onNodeChange={({ pos }) => {
                  activeDragHandlePosRef.current = pos;
                  if (pos >= 0) {
                    scheduleDragHandleReposition();
                  }
                }}
                onElementDragEnd={() => {
                  setTimeout(() => {
                    document.querySelectorAll('.nova-drop-cursor, .ProseMirror-dropcursor').forEach(el => {
                      (el as HTMLElement).style.display = 'none';
                    });
                  }, 50);
                }}
                // @ts-ignore
                computePositionConfig={dragHandleComputePositionConfig}
              >
                <div className="flex items-center gap-1 group/handle relative" ref={blockMenuRef}>
                  <div 
                    onMouseDown={handleGripMouseDown}
                    onClick={handleGripClick}
                    className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 cursor-grab active:cursor-grabbing text-stone-400 group-hover/handle:text-stone-600 transition-colors drag-handle"
                  >
                    <GripVertical size={16} />
                  </div>


                </div>
              </DragHandle>
            )}

            {/* 琛ㄦ牸娴姩鑿滃崟 */}
            {editor && (
              <BubbleMenu 
                editor={editor} 
                shouldShow={({ editor }) => editor.isActive('table')}
                className="flex overflow-hidden rounded-2xl border border-border/20 bg-popover/80 backdrop-blur-2xl shadow-soft p-1.5"
              >
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => editor.chain().focus().addColumnBefore().run()}
                    className="p-2 rounded-xl hover:bg-accent text-muted-foreground transition-all duration-300"
                    title="在前插入列"
                  >
                    <Columns size={16} className="rotate-180" />
                  </button>
                  <button 
                    onClick={() => editor.chain().focus().addColumnAfter().run()}
                    className="p-2 rounded-xl hover:bg-accent text-muted-foreground transition-all duration-300"
                    title="在后插入列"
                  >
                    <Columns size={16} />
                  </button>
                  <button 
                    onClick={() => editor.chain().focus().deleteColumn().run()}
                    className="p-2 rounded-xl hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-all duration-300"
                    title="删除列"
                  >
                    <Trash size={14} className="rotate-90" />
                  </button>
                  
                  <div className="w-px h-5 bg-border/20 mx-1" />

                  <button 
                    onClick={() => editor.chain().focus().addRowBefore().run()}
                    className="p-2 rounded-xl hover:bg-accent text-muted-foreground transition-all duration-300"
                    title="在前插入行"
                  >
                    <Rows size={16} className="rotate-180" />
                  </button>
                  <button 
                    onClick={() => editor.chain().focus().addRowAfter().run()}
                    className="p-2 rounded-xl hover:bg-accent text-muted-foreground transition-all duration-300"
                    title="在后插入行"
                  >
                    <Rows size={16} />
                  </button>
                  <button 
                    onClick={() => editor.chain().focus().deleteRow().run()}
                    className="p-2 rounded-xl hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-all duration-300"
                    title="删除行"
                  >
                    <Trash size={14} />
                  </button>

                  <div className="w-px h-5 bg-border/20 mx-1" />

                  <button 
                    onClick={() => editor.chain().focus().deleteTable().run()}
                    className="p-2 rounded-xl hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-all duration-300"
                    title="删除表格"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </BubbleMenu>
            )}

            {isBlockMenuOpen && editor && typeof document !== 'undefined' && createPortal(
                <motion.div
                  ref={blockMenuContentRef}
                  data-block-menu="true"
                  initial={{ opacity: 0, scale: 0.9, x: -10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  style={{ 
                    top: blockMenuPos.top, 
                    left: blockMenuPos.left, 
                    position: 'fixed',
                    opacity: 'var(--block-menu-opacity, 0.85)',
                    backdropFilter: 'blur(var(--block-menu-blur, 15px))',
                    backgroundColor: 'var(--block-menu-bg, rgba(var(--popover), 0.8))',
                    color: 'var(--block-menu-fg, inherit)',
                    borderColor: 'var(--block-menu-border, rgba(var(--border), 0.1))',
                  }}
                  className="z-[110] w-64 overflow-hidden rounded-2xl border shadow-soft flex flex-col"
                  onMouseDown={(e) => e.stopPropagation()}
                  onWheel={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-col max-h-[60vh] overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] p-2 gap-1.5">
                    <div className="px-1 py-1">
                      <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-2 px-1">转换为</p>
                      <div className="grid grid-cols-5 gap-1 px-1">
                        {[
                          { label: '正文', title: '转换为正文', icon: <Type size={16} />, action: () => editor.chain().focus().setNode('paragraph').run() },
                          { label: 'H1', title: '转换为一级标题', icon: <Heading1 size={16} />, action: () => editor.chain().focus().setNode('heading', { level: 1 }).run() },
                          { label: 'H2', title: '转换为二级标题', icon: <Heading2 size={16} />, action: () => editor.chain().focus().setNode('heading', { level: 2 }).run() },
                          { label: 'H3', title: '转换为三级标题', icon: <Heading3 size={16} />, action: () => editor.chain().focus().setNode('heading', { level: 3 }).run() },
                          { label: '引用', title: '转换为引用', icon: <Quote size={16} />, action: () => editor.chain().focus().toggleBlockquote().run() },
                          { label: '列表', title: '转换为无序列表', icon: <List size={16} />, action: () => editor.chain().focus().toggleBulletList().run() },
                          { label: '有序', title: '转换为有序列表', icon: <ListOrdered size={16} />, action: () => editor.chain().focus().toggleOrderedList().run() },
                          { label: '任务', title: '转换为任务列表', icon: <CheckSquare size={16} />, action: () => editor.chain().focus().toggleTaskList().run() },
                          { label: '代码', title: '转换为代码块', icon: <Code size={16} />, action: () => editor.chain().focus().setCodeBlock().run() },
                          { label: '分割线', title: '插入分割线', icon: <Minus size={16} />, action: () => editor.chain().focus().setHorizontalRule().run() },
                        ].map((item) => (
                          <button
                            key={item.label}
                            title={item.title}
                            onClick={() => {
                              item.action();
                              setIsBlockMenuOpen(false);
                            }}
                            className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-all duration-200"
                          >
                            {item.icon}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="h-px bg-border/20 mx-2" />

                    <div className="px-2 py-1.5">
                      <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest mb-1.5 px-1">操作</p>
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => {
                            if (targetPos !== null) {
                              editor.chain().insertContentAt(targetPos, { type: 'paragraph' }).focus().run();
                            }
                            setIsBlockMenuOpen(false);
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-all duration-200"
                        >
                          <ArrowUpToLine size={14} /> 在上方插入空行
                        </button>
                        <button
                          onClick={() => {
                            if (targetPos !== null) {
                              const node = editor.state.doc.nodeAt(targetPos);
                              const endPos = targetPos + (node?.nodeSize || 0);
                              editor.chain().insertContentAt(endPos, { type: 'paragraph' }).focus().run();
                            }
                            setIsBlockMenuOpen(false);
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-all duration-200"
                        >
                          <ArrowDownToLine size={14} /> 在下方插入空行
                        </button>
                        <button
                          onClick={() => {
                            if (targetPos !== null) {
                              const node = editor.state.doc.nodeAt(targetPos);
                              if (node) {
                                const endPos = targetPos + node.nodeSize;
                                editor.chain().insertContentAt(endPos, node.toJSON()).focus().run();
                              }
                            }
                            setIsBlockMenuOpen(false);
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-all duration-200"
                        >
                          <CopyPlus size={14} /> 复制该块并插入
                        </button>
                        <button
                          onClick={() => {
                            if (targetPos !== null) {
                              const node = editor.state.doc.nodeAt(targetPos);
                              if (node) {
                                const tempEditor = new Editor({
                                  extensions: extensions,
                                  content: node.toJSON(),
                                });
                                const finalHtml = tempEditor.getHTML();
                                tempEditor.destroy();

                                editor.chain().focus().deleteRange({ from: targetPos, to: targetPos + node.nodeSize }).run();
                                window.dispatchEvent(new CustomEvent('add-sticky-note', { detail: { content: finalHtml } }));
                              }
                            }
                            setIsBlockMenuOpen(false);
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-all duration-200"
                        >
                          <StickyNote size={14} /> 转为便利贴
                        </button>
                        <button
                          onClick={() => {
                            let content = '';
                            if (targetPos !== null) {
                              content = editor.state.doc.nodeAt(targetPos)?.textContent || '';
                            } else {
                              const { from, to } = editor.state.selection;
                              content = editor.state.doc.textBetween(from, to, '\n');
                            }
                            navigator.clipboard.writeText(content);
                            onNotify?.('已复制纯文本', 'success');
                            setIsBlockMenuOpen(false);
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-all duration-200"
                        >
                          <Copy size={14} /> 复制纯文本
                        </button>
                      </div>
                    </div>

                    <div className="h-px bg-border/20 mx-2" />

                    <div className="px-2 py-1.5">
                      <button
                        onClick={() => {
                          if (targetPos !== null) {
                            const node = editor.state.doc.nodeAt(targetPos);
                            editor.chain().focus().deleteRange({ from: targetPos, to: targetPos + (node?.nodeSize || 0) }).run();
                          } else {
                            editor.chain().focus().deleteSelection().run();
                          }
                          setIsBlockMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold text-destructive/80 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200"
                      >
                        <Trash2 size={14} /> 删除块
                      </button>
                    </div>
                  </div>
                </motion.div>,
                document.body,
              )}

            {/* 娴姩鑿滃崟 */}
            {editor && (
              <BubbleMenu 
                editor={editor} 

                shouldShow={({ editor }: { editor: Editor }) => {
                  const { selection } = editor.state;
                  const isNodeSelection = selection instanceof NodeSelection;
                  
                  return (
                    !isBlockMenuOpen && 
                    !selection.empty && 
                    !isNodeSelection &&
                    !editor.isActive('table')
                  );
                }}
                className="flex overflow-hidden rounded-2xl border shadow-soft p-1.5"
                style={{
                  opacity: 'var(--text-menu-opacity, 0.9)',
                  backdropFilter: 'blur(var(--text-menu-blur, 10px))',
                  backgroundColor: 'var(--text-menu-bg, rgba(var(--popover), 0.9))',
                  color: 'var(--text-menu-fg, inherit)',
                  borderColor: 'var(--text-menu-border, rgba(var(--border), 0.2))',
                }}
              >
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex items-center gap-1"
                >
                  <button 
                    onClick={() => editor.chain().focus().toggleBold().run()} 
                    className={`p-2 rounded-xl hover:bg-accent transition-all duration-300 ${editor.isActive('bold') ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                    title="加粗"
                  >
                    <Bold size={16} />
                  </button>
                  <button 
                    onClick={() => editor.chain().focus().toggleItalic().run()} 
                    className={`p-2 rounded-xl hover:bg-accent transition-all duration-300 ${editor.isActive('italic') ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                    title="斜体"
                  >
                    <Italic size={16} />
                  </button>
                  <button 
                    onClick={() => editor.chain().focus().toggleUnderline().run()} 
                    className={`p-2 rounded-xl hover:bg-accent transition-all duration-300 ${editor.isActive('underline') ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                    title="下划线"
                  >
                    <Underline size={16} />
                  </button>
                  <button 
                    onClick={() => editor.chain().focus().toggleStrike().run()} 
                    className={`p-2 rounded-xl hover:bg-accent transition-all duration-300 ${editor.isActive('strike') ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                    title="删除线"
                  >
                    <Strikethrough size={16} />
                  </button>
                  
                  <div className="w-px h-5 bg-border/20 mx-1" />

                  <button 
                    onClick={async () => {
                      const currentHref = editor.getAttributes('link').href || ''
                      const url = await promptCompat({
                        title: '插入链接',
                        defaultValue: currentHref,
                        placeholder: 'https://example.com',
                        description: '留空并确认会移除当前链接。',
                      })
                      if (url === null) {
                        return
                      }
                      if (url.trim()) {
                        editor.chain().focus().setLink({ href: url.trim() }).run()
                      } else {
                        editor.chain().focus().unsetLink().run()
                      }
                    }} 
                    className={`p-2 rounded-xl hover:bg-accent transition-all duration-300 ${editor.isActive('link') ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                    title="插入链接"
                  >
                    <LinkIcon size={16} />
                  </button>

                  <button 
                    onClick={() => editor.chain().focus().toggleHighlight({ color: '#ffec3d' }).run()} 
                    className={`p-2 rounded-xl hover:bg-accent transition-all duration-300 ${editor.isActive('highlight') ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                    title="高亮"
                  >
                    <Highlighter size={16} />
                  </button>

                  <button 
                    onClick={() => editor.chain().focus().toggleCode().run()} 
                    className={`p-2 rounded-xl hover:bg-accent transition-all duration-300 ${editor.isActive('code') ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                    title="内联代码"
                  >
                    <Code size={16} />
                  </button>

                  <div className="w-px h-5 bg-border/20 mx-1" />

                  {/* Text Effects */}
                  <button 
                    onClick={() => editor.chain().focus().toggleTextEffect({ effect: 'gradient' }).run()} 
                    className={`p-2 rounded-xl hover:bg-accent transition-all duration-300 ${editor.isActive('textEffect', { effect: 'gradient' }) ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                    title="动态渐变特效"
                  >
                    <Sparkles size={16} />
                  </button>
                  <button 
                    onClick={() => editor.chain().focus().toggleTextEffect({ effect: 'bounce' }).run()} 
                    className={`p-2 rounded-xl hover:bg-accent transition-all duration-300 ${editor.isActive('textEffect', { effect: 'bounce' }) ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                    title="动感跳动特效"
                  >
                    <Waves size={16} />
                  </button>
                  <button 
                    onClick={() => editor.chain().focus().toggleTextEffect({ effect: 'neon' }).run()} 
                    className={`p-2 rounded-xl hover:bg-accent transition-all duration-300 ${editor.isActive('textEffect', { effect: 'neon' }) ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                    title="赛博霓虹特效"
                  >
                    <Zap size={16} />
                  </button>
                  <button 
                    onClick={() => editor.chain().focus().toggleTextEffect({ effect: 'typewriter' }).run()} 
                    className={`p-2 rounded-xl hover:bg-accent transition-all duration-300 ${editor.isActive('textEffect', { effect: 'typewriter' }) ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                    title="打字机特效"
                  >
                    <Type size={16} />
                  </button>

                  <div className="w-px h-5 bg-border/20 mx-1" />
                  
                  <button 
                    onClick={() => editor.chain().focus().unsetAllMarks().run()} 
                    className="p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all duration-300"
                    title="清除格式"
                  >
                    <Eraser size={16} />
                  </button>

                  <div className="w-px h-5 bg-border/20 mx-1" />

                  <div className="relative">
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsEmoticonPanelOpen((v) => !v);
                      }}
                      className={`p-2 rounded-xl hover:bg-accent transition-all duration-300 ${isEmoticonPanelOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                      title="表情面板"
                    >
                      <Smile size={16} />
                    </button>
                  </div>
                </motion.div>
              </BubbleMenu>
            )}
            
            {/* 涓夊眰鏋舵瀯娓叉煋 */}
            {/* Layer 2: Stickers (Decorations) */}
            <StickerLayer 
              stickers={stickers} 
              isEditable={isStickerMode}
              onChange={handleStickersChange} 
            />

            {/* Layer 1: Tiptap Editor */}
            <EditorContent 
              editor={editor} 
              className={`relative z-30 transition-all duration-500 ${isStickerMode ? 'opacity-40 blur-[1px] pointer-events-none' : 'opacity-100 blur-0'}`} 
            />

            {/* Layer 0: Sticky Notes (Top Layer) - Independent of Sticker Mode blur */}
            <StickyNotesLayer
              notes={stickyNotes}
              onChange={handleStickyNotesChange}
            />

            {/* Global Emoticon Panel (Detached from BubbleMenu) */}
            <AnimatePresence>
              {isEmoticonPanelOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 8 }}
                  className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[99999]"
                  ref={emoticonPanelRef}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <EmoticonPanel
                    onSelect={(emoticon) => {
                      editor?.chain().focus().setEmoticon({ src: formatUrl(emoticon.url), alt: emoticon.name }).run();
                      setIsEmoticonPanelOpen(false);
                    }}
                  />
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsEmoticonPanelOpen(false);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-background border border-border rounded-full flex items-center justify-center shadow-md hover:bg-accent transition-colors"
                    aria-label="鍏抽棴琛ㄦ儏闈㈡澘"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        {/* TOC 鎸傝浇鍦ㄦ粴鍔ㄥ鍣ㄥ唴閮紝鐩稿瀹氫綅 */}
        <TableOfContents outline={outline} scrollContainerRef={scrollContainerRef as React.RefObject<HTMLDivElement>} />
      </div>

      <AnimatePresence>
        {isStickerPanelOpen && (
          <StickerPanel 
            onClose={() => setIsStickerPanelOpen(false)}
            onSelect={(url) => {
              window.dispatchEvent(new CustomEvent('add-sticky-note', { 
                detail: { url: formatUrl(url), type: 'image' } 
              }));
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {spellcheckError && (
          <SpellcheckSuggestionCard
            error={spellcheckError.error}
            rect={spellcheckError.rect}
            onClose={() => setSpellcheckError(null)}
                onReplace={(suggestion) => {
              if (editor && spellcheckError) {
                const { error } = spellcheckError;
                // Dispatch meta to remove the error and decoration BEFORE mapping changing the pos
                const tr = editor.state.tr;
                tr.setMeta(spellcheckPluginKey, { type: 'removeError', from: error.from, to: error.to });
                tr.insertText(suggestion, error.from, error.to);
                editor.view.dispatch(tr);

                setSpellcheckError(null);
                onNotify?.('已修正错别字', 'success');
              }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSaving && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-primary text-primary-foreground px-6 py-3 rounded-2xl shadow-soft"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            <span className="text-xs font-bold tracking-widest uppercase">鎵嬪啓璁板繂鍚屾涓?..</span>
          </motion.div>
        )}

        {/* AI Loading is now handled inline by pixel-maid.webp */}
      </AnimatePresence>
    </motion.div>
  );
});


