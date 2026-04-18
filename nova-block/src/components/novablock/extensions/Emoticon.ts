import { Node, mergeAttributes } from '@tiptap/core';

export interface EmoticonOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    emoticon: {
      /**
       * Insert an emoticon
       */
      setEmoticon: (options: { src: string; alt?: string; title?: string }) => ReturnType;
    };
  }
}

export const Emoticon = Node.create<EmoticonOptions>({
  name: 'emoticon',

  addOptions() {
    return {
      HTMLAttributes: {
        'data-emoticon': 'true',
        class: 'inline-emoticon',
      },
    };
  },

  group: 'inline',

  inline: true,

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-emoticon]',
        priority: 100,
      },
      {
        tag: 'img[src*="/api/emoticons/"]',
        priority: 100,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        style: 'width: 1.5em; height: 1.5em; vertical-align: middle; display: inline-block; margin: 0 0.1em;',
      }),
    ];
  },

  addCommands() {
    return {
      setEmoticon:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});
