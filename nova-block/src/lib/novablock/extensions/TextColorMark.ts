import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * v0.21.1 · D1 TextColorMark
 *
 * 自定义文字颜色 Mark：为选区加一个带 inline style 的 span，承载 color。
 * 不依赖 @tiptap/extension-color + @tiptap/extension-text-style（未安装），
 * 而是自实现一个最小 mark，保证 round-trip。
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      setTextColor: (color: string) => ReturnType
      unsetTextColor: () => ReturnType
    }
  }
}

export const TextColorMark = Mark.create({
  name: 'textColor',

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => {
          const inline = (el as HTMLElement).style?.color
          if (inline) return inline
          return (el as HTMLElement).getAttribute('data-text-color')
        },
        renderHTML: (attrs) => {
          if (!attrs.color) return {}
          return {
            'data-text-color': attrs.color,
            style: `color:${attrs.color}`,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-text-color]' },
      {
        tag: 'span[style]',
        getAttrs: (node) => {
          const el = node as HTMLElement
          const c = el.style.color
          if (!c) return false
          // 避免把含其他样式但不含颜色的 span 吞掉
          return { color: c }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setTextColor:
        (color: string) =>
        ({ chain }: any) => {
          return chain().setMark(this.name, { color }).run()
        },
      unsetTextColor:
        () =>
        ({ chain }: any) => {
          return chain().unsetMark(this.name).run()
        },
    } as any
  },
})

export default TextColorMark
