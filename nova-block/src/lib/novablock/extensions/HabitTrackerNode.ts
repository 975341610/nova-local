import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { HabitTrackerComponent } from '../../../components/widgets/HabitTrackerComponent';

export const HabitTrackerNode = Node.create({
  name: 'habitTracker',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      title: { default: '打卡日历' },
      // 旧属性保留以便向前兼容，新逻辑改用 HabitContext
      checkedDates: { default: [] },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="habit-tracker"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'habit-tracker' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HabitTrackerComponent);
  },

  addStorage() {
    return {
      markdown: {
        serialize: (state: any, node: any) => {
          state.write(':::habit-tracker\n');
          state.write(`title: ${node.attrs.title}\n`);
          state.write(':::\n');
          state.closeBlock(node);
        },
        parse: {
          setup: (markdownit: any) => {
            // @ts-ignore
            const container = require('markdown-it-container');
            markdownit.use(container, 'habit-tracker', {
              render: (tokens: any, idx: any) => {
                return tokens[idx].nesting === 1 ? '<div data-type="habit-tracker">' : '</div>';
              }
            });
          }
        }
      }
    };
  }
});
