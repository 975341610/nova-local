import { Node, Mark, Extension, mergeAttributes, markInputRule, nodePasteRule, nodeInputRule } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import Image from '@tiptap/extension-image';
import { TableCell as BaseTableCell } from '@tiptap/extension-table-cell';
import { TableHeader as BaseTableHeader } from '@tiptap/extension-table-header';
import { CollapsibleHeading as Heading } from '../components/novablock/extensions/CollapsibleHeading';
import { Blockquote as BaseBlockquote } from '@tiptap/extension-blockquote';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import { getApiBase } from './api';
// @ts-ignore
import container from 'markdown-it-container';
// @ts-ignore
import footnote from 'markdown-it-footnote';
import { MediaNodeView } from '../components/MediaNodeView';
import { MathBlockComponent } from '../components/editor/MathBlockComponent';
import { FootnoteComponent } from '../components/editor/FootnoteComponent';
import { CodeBlockComponent } from '../components/editor/CodeBlockComponent';

import { SliderExtension } from '../components/novablock/extensions/SliderExtension';
import { TextEffect } from '../components/novablock/extensions/TextEffect';

export { TaskList, TaskItem, SliderExtension, TextEffect };

// --- Widgets ---
export { CountdownNode } from './novablock/extensions/CountdownNode';
export { MusicPlayerNode } from './novablock/extensions/MusicPlayerNode';
export { MiniCalendarNode } from './novablock/extensions/MiniCalendarNode';
export { KanbanNode } from './novablock/extensions/KanbanNode';
export { HabitTrackerNode } from './novablock/extensions/HabitTrackerNode';
export { TodoNode } from './novablock/extensions/TodoNode';
export { Emoticon } from '../components/novablock/extensions/Emoticon';
export { NoteLink } from '../components/novablock/extensions/NoteLink';
export { AISpellcheck, spellcheckPluginKey } from '../components/novablock/extensions/AISpellcheck';

// Keep WikiLink for backward compatibility if needed, or replace it. 
// The user asked for a Tiptap Extension with capsule style and ID. 
// NoteLink (from NoteLink.ts) is our new implementation.

// --- 基础扩展增强 ---
export { Heading };

export const Blockquote = BaseBlockquote.extend({
  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes, { 
      class: 'border-l-4 border-stone-200 pl-4 py-1 my-4' 
    }), 0];
  },
});

const lowlight = createLowlight(common);

export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Backspace: () => {
        const { selection } = this.editor.state;
        const { $from, empty } = selection;

        if (!empty || $from.parentOffset !== 0) {
          return false;
        }

        const node = $from.parent;
        if (node.type.name !== this.name) return false;

        // If the code block is empty or the cursor is at the very beginning
        // Intercept to prevent merging into the previous line.
        // Delete if empty, do nothing otherwise.
        if (node.textContent.length === 0) {
          return this.editor.chain().deleteNode(this.name).run();
        }
        return true;
      },
    };
  },
}).configure({
  lowlight,
  defaultLanguage: 'plaintext',
});

// --- 分栏 (Columns) ---
export const ColumnGroup = Node.create({
  name: 'columnGroup',
  group: 'block',
  content: 'column{2,}', // 至少两列
  parseHTML() {
    return [{ tag: 'div[data-type="column-group"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 
      'data-type': 'column-group', 
      class: 'flex gap-4 w-full my-6 border-2 border-dashed border-stone-100 rounded-2xl p-4 transition-colors hover:border-stone-200' 
    }), 0];
  },
  addStorage() {
    return {
      markdown: {
        serialize: (state: any, node: any) => {
          state.write(':::column-group\n');
          state.renderContent(node);
          state.write(':::');
          state.closeBlock(node);
        },
        parse: {
          setup: (markdownit: any) => {
            markdownit.use(container, 'column-group', {
              render: (tokens: any, idx: any) => {
                return tokens[idx].nesting === 1 ? '<div data-type="column-group">' : '</div>';
              }
            });
          }
        }
      }
    };
  }
});

export const Column = Node.create({
  name: 'column',
  group: 'block',
  content: 'block+',
  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 
      'data-type': 'column', 
      class: 'flex-1 min-w-0 border border-dashed border-stone-200 hover:border-stone-300 rounded-xl p-4 transition-all' 
    }), 0];
  },
  addStorage() {
    return {
      markdown: {
        serialize: (state: any, node: any) => {
          state.write(':::column\n');
          state.renderContent(node);
          state.write(':::\n');
        },
        parse: {
          setup: (markdownit: any) => {
            markdownit.use(container, 'column', {
              render: (tokens: any, idx: any) => {
                return tokens[idx].nesting === 1 ? '<div data-type="column">' : '</div>';
              }
            });
          }
        }
      }
    };
  }
});

// --- 数学公式 (Math) ---
export const MathInline = Mark.create({
  name: 'mathInline',
  priority: 1100,
  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: element => element.getAttribute('data-latex'),
        renderHTML: attributes => ({ 'data-latex': attributes.latex, class: 'math-inline' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span.math-inline' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, `$${HTMLAttributes['data-latex']}$`];
  },
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: '$',
          close: '$',
          mixable: true,
          expelEnclosingWhitespace: true,
          escape: false,
        },
        parse: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          setup: (_markdownit: any) => {
            // 依赖测试环境外部挂载插件
          }
        }
      }
    };
  },
  addInputRules() {
    return [
      markInputRule({
        find: /\$([^$]+)\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ];
  },
});

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: element => element.getAttribute('data-latex'),
        renderHTML: attributes => ({ 'data-latex': attributes.latex, class: 'math-block' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div.math-block' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', HTMLAttributes, `$$${HTMLAttributes['data-latex']}$$`];
  },
  addStorage() {
    return {
      markdown: {
        serialize: (state: any, node: any) => {
          state.write('$$\n');
          state.write(node.attrs.latex);
          state.write('\n$$');
          state.closeBlock(node);
        },
        parse: {
          setup: (markdownit: any) => {
            // 自定义数学公式解析逻辑，不依赖外部插件的渲染
            markdownit.inline.ruler.after('escape', 'math_inline', (state: any, silent: boolean) => {
              if (state.src[state.pos] !== '$') return false;
              // 找到匹配的 $
              const end = state.src.indexOf('$', state.pos + 1);
              if (end === -1) return false;
              if (!silent) {
                const token = state.push('html_inline', '', 0);
                token.content = `<span class="math-inline" data-latex="${state.src.slice(state.pos + 1, end)}"></span>`;
              }
              state.pos = end + 1;
              return true;
            });
          }
        }
      }
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathBlockComponent);
  },
});

// --- 注脚 (Footnote) ---
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      index: {
        default: 1,
        parseHTML: element => element.getAttribute('data-index') || 1,
        renderHTML: attributes => ({ 'data-index': attributes.index }),
      },
      content: {
        default: '',
        parseHTML: element => element.getAttribute('data-content') || '',
        renderHTML: attributes => ({ 'data-content': attributes.content }),
      },
    };
  },
  parseHTML() {
    return [
      { tag: 'span[data-type="footnote"]' },
      { tag: 'sup.footnote-ref' }, // 增加对标准 markdown-it-footnote HTML 的支持
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 
      'data-type': 'footnote', 
      class: 'footnote-marker inline-flex items-center justify-center w-5 h-5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold cursor-pointer hover:bg-blue-100 transition-colors mx-0.5 align-top' 
    }), String(HTMLAttributes.index)];
  },
  addStorage() {
    return {
      markdown: {
        serialize: (state: any, node: any) => {
          state.write(`[^${node.attrs.index}]`);
        },
        parse: {
          setup: (markdownit: any) => {
            markdownit.use(footnote);
          }
        }
      }
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(FootnoteComponent);
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('footnote-reindexer'),
        appendTransaction: (transactions, _oldState, newState) => {
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return;

          let index = 1;
          const { tr } = newState;
          let changed = false;

          newState.doc.descendants((node, pos) => {
            if (node.type.name === 'footnote') {
              if (node.attrs.index !== index) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  index,
                });
                changed = true;
              }
              index++;
            }
          });

          return changed ? tr : undefined;
        },
      }),
    ];
  },
});

// --- 高亮块 (Highlight Block) ---
export const HighlightBlock = Node.create({
  name: 'highlightBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      color: {
        default: 'blue',
        parseHTML: element => element.getAttribute('data-color') || 'blue',
        renderHTML: attributes => ({ 'data-color': attributes.color }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-highlight-block]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const colorMap: Record<string, string> = {
      blue: 'bg-blue-50/80 border-blue-100 text-blue-900',
      amber: 'bg-amber-50/80 border-amber-100 text-amber-900',
      emerald: 'bg-emerald-50/80 border-emerald-100 text-emerald-900',
      rose: 'bg-rose-50/80 border-rose-100 text-rose-900',
    };
    const colorClass = colorMap[HTMLAttributes.color as string] || colorMap.blue;
    return ['div', mergeAttributes(HTMLAttributes, { 
      'data-highlight-block': 'true', 
      class: `my-6 p-6 rounded-2xl border-2 ${colorClass} transition-all hover:shadow-md` 
    }), 0];
  },
  addStorage() {
    return {
      markdown: {
        serialize: (state: any, node: any) => {
          state.write(':::highlight-block\n');
          state.renderContent(node);
          state.write(':::');
          state.closeBlock(node);
        },
        parse: {
          setup: (markdownit: any) => {
            markdownit.use(container, 'highlight-block', {
              render: (tokens: any, idx: any) => {
                if (tokens[idx].nesting === 1) {
                  return '<div data-highlight-block="true">';
                }
                return '</div>';
              }
            });
          }
        }
      }
    };
  }
});

// --- 原有扩展 ---
export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: any) => {
          // 1. First, delete the slash and its trigger text
          // Using a single transaction is key here.
          // We must ensure the selection is updated AFTER deletion.
          const { tr } = editor.state;
          tr.deleteRange(range.from, range.to);
          editor.view.dispatch(tr);

          // 2. Now run the command with focus
          editor.chain().focus();
          
          // props.action expects a chain, so we provide one
          const chain = editor.chain().focus();
          const result = props.action(chain, editor);
          
          if (result && typeof result.run === 'function') {
            result.run();
          } else if (chain && typeof chain.run === 'function') {
            chain.run();
          }
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

export const WikiLink = Mark.create({
  name: 'wikiLink',
  priority: 1000,
  keepOnSplit: false,
  addAttributes() {
    return {
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-wiki-title'),
        renderHTML: (attributes) => {
          if (!attributes.title) return {};
          return { 'data-wiki-title': attributes.title, class: 'wiki-link', 'data-type': 'wiki' };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-wiki-title]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
  addInputRules() {
    return [
      markInputRule({
        find: /\[\[([^\]]+)\]\]$/,
        type: this.type,
        getAttributes: (match) => ({ title: match[1] }),
      }),
    ];
  },
});

const propertyTypeAttr = {
  propertyType: {
    default: 'text',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-property-type') || 'text',
    renderHTML: (attributes: { propertyType?: string }) => ({ 'data-property-type': attributes.propertyType || 'text' }),
  },
  propertyOptions: {
    default: '',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-property-options') || '',
    renderHTML: (attributes: { propertyOptions?: string }) => ({ 'data-property-options': attributes.propertyOptions || '' }),
  },
  propertyMode: {
    default: 'single',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-property-mode') || 'single',
    renderHTML: (attributes: { propertyMode?: string }) => ({ 'data-property-mode': attributes.propertyMode || 'single' }),
  },
  checked: {
    default: false,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-checked') === 'true',
    renderHTML: (attributes: { checked?: boolean }) => ({ 'data-checked': attributes.checked ? 'true' : 'false' }),
  },
  dateValue: {
    default: '',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-date-value') || '',
    renderHTML: (attributes: { dateValue?: string }) => ({ 'data-date-value': attributes.dateValue || '' }),
  },
  selectValue: {
    default: '',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-select-value') || '',
    renderHTML: (attributes: { selectValue?: string }) => ({ 'data-select-value': attributes.selectValue || '' }),
  },
};

export const DatabaseTableHeader = BaseTableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...propertyTypeAttr,
    };
  },
});

export const DatabaseTableCell = BaseTableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...propertyTypeAttr,
    };
  },
});

export const ResizableImage = Image.extend({
  draggable: true,
  addOptions() {
    return {
      ...(this.parent?.() || {}),
      inline: false,
      allowBase64: false,
      HTMLAttributes: {},
    } as any;
  },
  parseHTML() {
    return [
      {
        tag: 'img[src]:not([data-emoticon]):not([src*="/api/emoticons/"])',
      },
    ]
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        parseHTML: (element) => element.getAttribute('data-width') || '100%',
        renderHTML: (attributes) => ({ 'data-width': attributes.width, style: `width:${attributes.width};` }),
      },
      'data-upload-id': {
        default: null,
        parseHTML: (element) => element.getAttribute('data-upload-id'),
        renderHTML: (attributes) => attributes['data-upload-id'] ? { 'data-upload-id': attributes['data-upload-id'] } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => React.createElement(MediaNodeView, { ...props, kind: 'image' }));
  },
});

export const AudioNode = Node.create({
  name: 'audioNode',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { 
      src: { default: '' }, 
      width: { default: '100%' },
      'data-upload-id': {
        default: null,
        parseHTML: (element) => element.getAttribute('data-upload-id'),
        renderHTML: (attributes) => attributes['data-upload-id'] ? { 'data-upload-id': attributes['data-upload-id'] } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'audio[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['audio', { ...HTMLAttributes, controls: 'true', class: 'embedded-audio', style: `width:${HTMLAttributes.width || '100%'};` }];
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => React.createElement(MediaNodeView, { ...props, kind: 'audio' }));
  },
});

export const VideoNode = Node.create({
  name: 'videoNode',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { 
      src: { default: '' }, 
      width: { default: '100%' },
      'data-upload-id': {
        default: null,
        parseHTML: (element) => element.getAttribute('data-upload-id'),
        renderHTML: (attributes) => attributes['data-upload-id'] ? { 'data-upload-id': attributes['data-upload-id'] } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'video[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['video', { ...HTMLAttributes, controls: 'true', class: 'embedded-video', style: `width:${HTMLAttributes.width || '100%'};` }];
  },
  addStorage() {
    return {
      markdown: {
        serialize: (state: any, node: any) => {
          state.write(`<video src="${node.attrs.src}"></video>\n`);
          state.closeBlock(node);
        }
      }
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => React.createElement(MediaNodeView, { ...props, kind: 'video' }));
  },
});

export const EmbedNode = Node.create({
  name: 'embedNode',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: '' },
      width: { default: '100%' },
      height: { default: 420 },
    };
  },
  parseHTML() {
    return [{ tag: 'iframe[data-embed]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'iframe', 
      { 
        ...HTMLAttributes, 
        'data-embed': 'true', 
        class: 'embedded-iframe', 
        style: `width:${HTMLAttributes.width || '100%'};`, 
        allowfullscreen: 'true',
      }
    ];
  },
  addStorage() {
    return {
      markdown: {
        serialize: (state: any, node: any) => {
          state.write(`<iframe src="${node.attrs.src}" data-embed="true"></iframe>\n`);
          state.closeBlock(node);
        }
      }
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => React.createElement(MediaNodeView, { ...props, kind: 'embed' }));
  },
  addPasteRules() {
    return [
      nodePasteRule({
        find: /(?:https?:\/\/)?(?:www\.)?(?:bilibili\.com\/video\/|b23\.tv\/)(BV[\w]+)/g,
        type: this.type,
        getAttributes: match => {
          return {
            src: `https://player.bilibili.com/player.html?bvid=${match[1]}&high_quality=1&danmaku=0&autoplay=0`,
          };
        },
      }),
      nodePasteRule({
        find: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/g,
        type: this.type,
        getAttributes: match => {
          return {
            src: `https://www.youtube.com/embed/${match[1]}`,
          };
        },
      }),
    ];
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: /(?:https?:\/\/)?(?:www\.)?(?:bilibili\.com\/video\/|b23\.tv\/)(BV[\w]+)\s$/,
        type: this.type,
        getAttributes: match => {
          return {
            src: `https://player.bilibili.com/player.html?bvid=${match[1]}&high_quality=1&danmaku=0&autoplay=0`,
          };
        },
      }),
      nodeInputRule({
        find: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)\s$/,
        type: this.type,
        getAttributes: match => {
          return {
            src: `https://www.youtube.com/embed/${match[1]}`,
          };
        },
      }),
    ];
  },
});

export const FileNode = Node.create({
  name: 'fileNode',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: '' },
      name: { default: '未命名文件' },
      size: { default: 0 },
      type: { default: '' },
      'data-upload-id': {
        default: null,
        parseHTML: (element) => element.getAttribute('data-upload-id'),
        renderHTML: (attributes) => attributes['data-upload-id'] ? { 'data-upload-id': attributes['data-upload-id'] } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="file-card"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'file-card', class: 'notion-file-block' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => React.createElement(MediaNodeView, { ...props, kind: 'file' }));
  },
});

export const FilePlaceholder = Node.create({
  name: 'filePlaceholder',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    return {
      id: { default: null },
      fileName: { default: '正在上传...' },
      progress: { default: 0 },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="file-placeholder"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'file-placeholder' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => {
      return React.createElement(NodeViewWrapper, { 
        className: 'flex items-center gap-4 p-4 my-2 bg-stone-50/50 border border-stone-200 border-dashed rounded-xl animate-pulse'
      }, [
        React.createElement('div', { 
          key: 'spinner',
          className: 'w-10 h-10 rounded-lg bg-stone-200 flex items-center justify-center'
        }, React.createElement('div', { className: 'w-5 h-5 border-2 border-stone-400 border-t-transparent rounded-full animate-spin' })),
        React.createElement('div', { key: 'text', className: 'flex-1' }, [
          React.createElement('div', { key: 'name', className: 'text-sm font-medium text-stone-500 mb-1' }, props.node.attrs.fileName),
          React.createElement('div', { key: 'bar', className: 'w-full h-1 bg-stone-200 rounded-full overflow-hidden' }, 
            React.createElement('div', { 
              className: 'h-full bg-blue-400 transition-all duration-300', 
              style: { width: `${props.node.attrs.progress}%` } 
            })
          )
        ])
      ]);
    });
  },
});

export const FileUpload = Extension.create({
  name: 'fileUpload',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('file-upload-handler'),
        props: {
          handleDrop(view, event) {
            if (!event.dataTransfer || !event.dataTransfer.files.length) return false;
            const files = Array.from(event.dataTransfer.files);
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!coordinates) return false;
            
            handleFilesUpload(view, files, coordinates.pos);
            return true;
          },
          handlePaste(view, event) {
            if (!event.clipboardData || !event.clipboardData.files.length) return false;
            const files = Array.from(event.clipboardData.files);
            handleFilesUpload(view, files, view.state.selection.from);
            return true;
          },
        },
      }),
    ];
  },
});

async function handleFilesUpload(view: any, files: File[], pos: number) {
  const { state, dispatch } = view;
  // 统一使用全局 API 配置
  const API_BASE = getApiBase();

  for (const file of files) {
    const uploadId = Math.random().toString(36).substring(7);
    
    // 1. 插入占位节点
    const tr = state.tr.insert(pos, view.state.schema.nodes.filePlaceholder.create({
      id: uploadId,
      fileName: file.name,
      progress: 0
    }));
    dispatch(tr);

    // 2. 开始上传
    try {
      const formData = new FormData();
      formData.append('file', file); // 后端 routes.py 期望的是 'file'
      
      const response = await fetch(`${API_BASE}/media/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${errorText || response.statusText}`);
      }
      
      const result = await response.json();

      // 3. 上传完成后替换占位符
      const { state: newState } = view;
      let placeholderPos = -1;
      newState.doc.descendants((node: any, p: number) => {
        if (node.type.name === 'filePlaceholder' && node.attrs.id === uploadId) {
          placeholderPos = p;
          return false;
        }
      });

      if (placeholderPos !== -1) {
        const type = file.type;
        let newNode;
        
        // 根据文件类型创建不同的节点
        if (type.startsWith('image/')) {
          newNode = view.state.schema.nodes.image.create({ src: result.url });
        } else if (type.startsWith('video/')) {
          newNode = view.state.schema.nodes.videoNode.create({ src: result.url });
        } else if (type.startsWith('audio/')) {
          newNode = view.state.schema.nodes.audioNode.create({ src: result.url });
        } else {
          newNode = view.state.schema.nodes.fileNode.create({
            src: result.url,
            name: file.name,
            size: result.size || file.size,
            type: result.type || file.type
          });
        }

        const finalTr = view.state.tr.replaceWith(placeholderPos, placeholderPos + 1, newNode);
        view.dispatch(finalTr);
      }
    } catch (error) {
      console.error('File upload error:', error);
      // 失败后删除占位符
      let placeholderPos = -1;
      view.state.doc.descendants((node: any, p: number) => {
        if (node.type.name === 'filePlaceholder' && node.attrs.id === uploadId) {
          placeholderPos = p;
          return false;
        }
      });
      if (placeholderPos !== -1) {
        view.dispatch(view.state.tr.delete(placeholderPos, placeholderPos + 1));
      }
      
      // 可以考虑弹窗提醒用户上传失败
      alert(`文件上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
}

export const CalloutNode = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div', 
      mergeAttributes(HTMLAttributes, { 'data-callout': 'true', class: 'callout-block' }), 
      ['span', { class: 'callout-icon', contenteditable: 'false' }, '💡'],
      ['div', { class: 'callout-content' }, 0]
    ];
  },
});

// --- 手账/日记扩展 (Journal Extensions) ---

/**
 * Washi Tape (胶带) - 用于装饰的块
 */
export const WashiTape = Node.create({
  name: 'washiTape',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      pattern: {
        default: 'polka-dots',
        parseHTML: element => element.getAttribute('data-pattern'),
        renderHTML: attributes => ({ 'data-pattern': attributes.pattern }),
      },
      color: {
        default: '#b8c6db',
        parseHTML: element => element.getAttribute('data-color'),
        renderHTML: attributes => ({ 'data-color': attributes.color }),
      },
      height: {
        default: 'medium',
        parseHTML: element => element.getAttribute('data-height'),
        renderHTML: attributes => ({ 'data-height': attributes.height }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="washi-tape"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'washi-tape', class: 'washi-tape-block' })];
  },
});

/**
 * Sticky Note (便利贴) - 带有旋转效果的内容块
 */

/**
 * Journal Stamp (心情/天气印章) - 行内印章
 */
export const JournalStamp = Node.create({
  name: 'journalStamp',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      stampType: {
        default: 'mood',
        parseHTML: element => element.getAttribute('data-stamp-type'),
        renderHTML: attributes => ({ 'data-stamp-type': attributes.stampType }),
      },
      value: {
        default: 'happy',
        parseHTML: element => element.getAttribute('data-value'),
        renderHTML: attributes => ({ 'data-value': attributes.value }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="journal-stamp"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const stamps: Record<string, string> = {
      happy: '😊',
      sad: '😢',
      angry: '😠',
      sunny: '☀️',
      cloudy: '☁️',
      rainy: '🌧️',
    };
    const emoji = stamps[HTMLAttributes.value as string] || '✨';
    return ['span', mergeAttributes(HTMLAttributes, { 
      'data-type': 'journal-stamp', 
      class: 'journal-stamp-inline inline-flex items-center justify-center bg-orange-50/50 border border-orange-100 rounded-md px-1 py-0.5 text-lg leading-none shadow-sm hover:scale-110 transition-transform cursor-default mx-0.5 align-middle' 
    }), emoji];
  },
});
