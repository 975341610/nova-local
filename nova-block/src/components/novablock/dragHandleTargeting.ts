import type { NestedOptions } from '@tiptap/extension-drag-handle'

const EXCLUDED_NODE_TYPES = new Set([
  'listItem',
  'taskItem',
  'tableRow',
  'tableCell',
  'tableHeader',
  'timelineItem',
])

const EXCLUDED_PARENT_TYPES = new Set([
  'listItem',
  'taskItem',
  'tableRow',
  'tableCell',
  'tableHeader',
  'blockquote',
  'callout',
  'timeline',
  'column',
  'columnGroup',
])

export const qingzhiDragHandleNestedOptions: NestedOptions = {
  defaultRules: false,
  edgeDetection: {
    edges: ['left'],
    threshold: 72,
    strength: 700,
  },
  rules: [
    {
      id: 'qingzhiWholeBlockTargets',
      evaluate: ({ node, parent }) => {
        if (node.isInline || node.isText) {
          return 1000
        }

        if (EXCLUDED_NODE_TYPES.has(node.type.name)) {
          return 1000
        }

        if (parent && EXCLUDED_PARENT_TYPES.has(parent.type.name)) {
          return 1000
        }

        return 0
      },
    },
  ],
}
