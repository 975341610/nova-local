import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CountdownComponent } from '../../../components/widgets/CountdownComponent';

export const CountdownNode = Node.create({
  name: 'countdown',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      targetDate: {
        default: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        parseHTML: (element) => element.getAttribute('data-target-date') || element.getAttribute('targetDate'),
        renderHTML: (attributes) => ({
          'data-target-date': attributes.targetDate,
        }),
      },
      title: {
        default: '倒计时',
        parseHTML: (element) => element.getAttribute('data-title') || element.getAttribute('title'),
        renderHTML: (attributes) => ({
          'data-title': attributes.title,
        }),
      },
      showBubble: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-show-bubble') === 'true' || element.getAttribute('showbubble') === 'true',
        renderHTML: (attributes) => ({
          'data-show-bubble': attributes.showBubble,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="countdown"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'countdown' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CountdownComponent);
  },
});
