import { Mark, mergeAttributes } from '@tiptap/core';

export interface TextEffectOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textEffect: {
      setTextEffect: (effect: string) => ReturnType;
      toggleTextEffect: (options: { effect: string }) => ReturnType;
      unsetTextEffect: () => ReturnType;
    };
  }
}

export const TextEffect = Mark.create<TextEffectOptions>({
  name: 'textEffect',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      effect: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-text-effect'),
        renderHTML: (attributes) => {
          if (!attributes.effect) {
            return {};
          }

          return {
            'data-text-effect': attributes.effect,
            class: `text-effect-${attributes.effect}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-text-effect]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTextEffect: (effect) => ({ commands }) => {
        return commands.setMark(this.name, { effect });
      },
      toggleTextEffect: (options) => ({ commands }) => {
        return commands.toggleMark(this.name, options);
      },
      unsetTextEffect: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
    };
  },
});
