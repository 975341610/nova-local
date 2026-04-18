import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TodoWidget } from '../../../components/widgets/TodoWidget';

export const TodoNode = Node.create({
  name: 'todoWidget',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      listId: {
        default: 'default-work',
        parseHTML: (element) => element.getAttribute('data-list-id'),
        renderHTML: (attributes) => ({ 'data-list-id': attributes.listId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="todo-widget"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': "todo-widget" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TodoWidget);
  },
});
