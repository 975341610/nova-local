import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * v0.21.1 · B6' MarginAnchor
 *
 * 为"被选中并创建过 Margin Note 的文字片段"打一个 mark。
 * - 存储 anchorId（与 MarginNotesPanel 的 MarginNote.id 对应）
 * - 渲染时添加 `.nv-margin-anchor` + dotted 底线样式，作为轻微视觉提示
 * - 点击交互由 BubbleMenu 触发；此处只负责 mark 本身的 schema。
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    marginAnchor: {
      setMarginAnchor: (anchorId: string) => ReturnType
      unsetMarginAnchor: () => ReturnType
    }
  }
}

export const MarginAnchor = Mark.create({
  name: 'marginAnchor',
  inclusive: false,
  keepOnSplit: false,
  excludes: '',

  addAttributes() {
    return {
      anchorId: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-margin-anchor') || '',
        renderHTML: (attrs) => {
          if (!attrs.anchorId) return {}
          return { 'data-margin-anchor': attrs.anchorId }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-margin-anchor]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'nv-margin-anchor' }),
      0,
    ]
  },

  addCommands() {
    return {
      setMarginAnchor:
        (anchorId: string) =>
        ({ chain }: any) => {
          return chain().setMark(this.name, { anchorId }).run()
        },
      unsetMarginAnchor:
        () =>
        ({ chain }: any) => {
          return chain().unsetMark(this.name).run()
        },
    } as any
  },
})

export default MarginAnchor
