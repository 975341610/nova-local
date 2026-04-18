import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { SliderNodeView } from './SliderNodeView';

export interface SliderOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    slider: {
      setSlider: (options: { images: string[] }) => ReturnType;
    };
  }
}

export const SliderExtension = Node.create<SliderOptions>({
  name: 'slider',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      images: {
        default: [],
        parseHTML: element => JSON.parse(element.getAttribute('data-images') || '[]'),
        renderHTML: attributes => ({
          'data-images': JSON.stringify(attributes.images || []),
        }),
      },
      autoPlay: {
        default: true,
      },
      showDots: {
        default: true,
      },
      showArrows: {
        default: true,
      },
      visibleCount: {
        default: 5,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="slider"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'slider' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SliderNodeView);
  },

  addCommands() {
    return {
      setSlider:
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
