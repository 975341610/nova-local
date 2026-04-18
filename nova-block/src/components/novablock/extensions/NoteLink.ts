import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { NoteLinkNode } from './NoteLinkNode';

export const NoteLink = Node.create({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => ({ 'data-id': attributes.id }),
      },
      label: {
        default: null,
        parseHTML: element => element.getAttribute('data-label'),
        renderHTML: attributes => ({ 'data-label': attributes.label }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="note-link"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'note-link' }),
      `📝 ${HTMLAttributes['data-label'] || '未命名笔记'}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkNode);
  },

  addOptions() {
    return {
      suggestion: {
        char: '[[',
        command: ({ editor, range, props }: any) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, {
              type: 'noteLink',
              attrs: { id: props.id, label: props.label },
            })
            .run();
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('noteLinkSuggestion'),
        ...this.options.suggestion,
      }),
    ];
  },
});
