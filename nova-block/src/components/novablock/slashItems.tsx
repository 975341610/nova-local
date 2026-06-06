import type { ChainedCommands } from '@tiptap/core';
import {
  Bold,
  Bot,
  CheckSquare,
  Code,
  Columns,
  Cpu,
  Eraser,
  FileText,
  Film,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Layout,
  Link as LinkIcon,
  List,
  ListPlus,
  Minus,
  MonitorPlay,
  Music,
  Pencil,
  Quote,
  Replace,
  Smile,
  Sparkles,
  StickyNote,
  StickyNote as StickyNoteIcon,
  Strikethrough,
  Table as TableIcon,
  Timer,
  Type,
} from 'lucide-react';
import { promptCompat } from '../../lib/promptCompat';

export const NOVA_BLOCK_SLASH_ITEMS = [
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
    label: '高级表格',
    description: '插入带表头、配色和合并工具的表格',
    group: '插入',
    icon: <TableIcon size={18} className="text-primary" />,
    keywords: ['advanced-table', 'table', 'sheet', 'gaoji'],
    action: (chain: ChainedCommands) => {
      window.dispatchEvent(new CustomEvent('open-advanced-table-size-picker'));
      return chain;
    },
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
    label: '画板 · 双击进入全屏编辑',
    description: '预览+编辑分离:笔记内只做缩略展示,双击进入全屏编辑器(节点/连线/手绘/PlantUML)',
    group: '插入',
    icon: <Pencil size={18} />,
    keywords: ['freehand', 'draw', 'sketch', 'canvas', 'whiteboard', 'flowchart', 'mindmap', 'plantuml', '涂鸦', '手绘', '画板', '流程图', '思维导图', '白板'],
    action: (chain: ChainedCommands) =>
      chain.insertContent({
        type: 'freehand',
        attrs: {
          strokes: [],
          nodes: [
            {
              id: Math.random().toString(36).slice(2, 9),
              x: 60,
              y: 60,
              w: 140,
              h: 64,
              text: '开始',
              shape: 'rect',
            },
          ],
          edges: [],
          width: 720,
          height: 440,
        },
      }),
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
  // v0.19 D1/D2/D3 扩展
  {
    label: '提示 · 墨色纸片',
    description: '插入一条 Callout · 笔记样',
    group: '墨境块',
    icon: <StickyNote size={18} />,
    keywords: ['callout', '提示', '注意', 'note'],
    action: (chain: ChainedCommands) => chain.insertContent({
      type: 'callout', attrs: { tone: 'note' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '在此写下要点…' }] }],
    }),
  },
  {
    label: '提示 · 信息',
    description: '蓝色 Info Callout',
    group: '墨境块',
    icon: <StickyNote size={18} className="text-blue-500" />,
    keywords: ['callout', 'info', '信息'],
    action: (chain: ChainedCommands) => chain.insertContent({
      type: 'callout', attrs: { tone: 'info' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '信息提示…' }] }],
    }),
  },
  {
    label: '提示 · 警告',
    description: '朱砂警告 Callout',
    group: '墨境块',
    icon: <StickyNote size={18} className="text-red-500" />,
    keywords: ['callout', 'warn', '警告', 'danger'],
    action: (chain: ChainedCommands) => chain.insertContent({
      type: 'callout', attrs: { tone: 'warn' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '注意：' }] }],
    }),
  },
  {
    label: '提示 · 引语',
    description: '古典引语样式',
    group: '墨境块',
    icon: <Quote size={18} />,
    keywords: ['callout', 'quote', '引用'],
    action: (chain: ChainedCommands) => chain.insertContent({
      type: 'callout', attrs: { tone: 'quote' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '引一段话…' }] }],
    }),
  },
  {
    label: '提示 · 思考',
    description: '思考 Callout · 沉心',
    group: '墨境块',
    icon: <Sparkles size={18} />,
    keywords: ['callout', 'tip', '思考', 'think'],
    action: (chain: ChainedCommands) => chain.insertContent({
      type: 'callout', attrs: { tone: 'tip' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '灵光一现…' }] }],
    }),
  },
  {
    label: '时间线 · Timeline',
    description: '纵向时间线块 · D3',
    group: '墨境块',
    icon: <Timer size={18} />,
    keywords: ['timeline', '时间', '时间线', '时间轴'],
    action: (chain: ChainedCommands) => {
      const today = new Date().toISOString().slice(0, 10)
      const lastMonth = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      return chain.insertContent({
        type: 'timeline',
        content: [
          { type: 'timelineItem', attrs: { date: lastMonth }, content: [{ type: 'text', text: '起点' }] },
          { type: 'timelineItem', attrs: { date: today }, content: [{ type: 'text', text: '现在' }] },
        ],
      })
    },
  },
];
