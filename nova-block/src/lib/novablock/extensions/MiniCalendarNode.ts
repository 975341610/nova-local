import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MiniCalendarComponent } from '../../../components/widgets/MiniCalendarComponent';

export const MiniCalendarNode = Node.create({
  name: 'miniCalendar',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      checkedDates: {
        default: [], // array of "YYYY-MM-DD"
      },
      title: {
        default: '打卡日历',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mini-calendar"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mini-calendar' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MiniCalendarComponent);
  },
});
