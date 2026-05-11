import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { TimelineItemView } from '../../../components/widgets/TimelineItemView'

/**
 * v0.19 D3 · Timeline Block
 *
 * 结构：
 *   timeline (container)
 *     timelineItem (date + content)+
 *
 * v0.19.4：timelineItem 改用 React NodeView，日期可直接点击编辑。
 */

export const TimelineItem = Node.create({
  name: 'timelineItem',
  group: 'timelineChild',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      date: {
        default: '',
        parseHTML: el => (el as HTMLElement).getAttribute('data-date') || '',
        renderHTML: attrs => ({ 'data-date': attrs.date }),
      },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-timeline-item]',
      // v0.21.1 · 只把 .timeline-text 当作正文容器,避免把 .timeline-date 的文字当成内容重复吞进来
      contentElement: (node) => {
        const el = (node as HTMLElement).querySelector('.timeline-text')
        return (el as HTMLElement) ?? (node as HTMLElement)
      },
    }]
  },

  renderHTML({ HTMLAttributes }) {
    const date = (HTMLAttributes as any)['data-date'] || ''
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-timeline-item': 'true', class: 'timeline-item' }),
      ['span', { class: 'timeline-date', 'data-readonly-date': 'true' }, date || '—'],
      ['span', { class: 'timeline-text' }, 0],
    ] as any
  },

  addNodeView() {
    return ReactNodeViewRenderer(TimelineItemView)
  },
})

export const TimelineBlock = Node.create({
  name: 'timeline',
  group: 'block',
  content: 'timelineChild+',
  defining: true,

  parseHTML() {
    return [{
      tag: 'div[data-timeline]',
      // v0.21.1 · 容器只认 .timeline-rail,避免标题 "时间线" 被反复吸入 content
      contentElement: (node) => {
        const el = (node as HTMLElement).querySelector('.timeline-rail')
        return (el as HTMLElement) ?? (node as HTMLElement)
      },
    }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-timeline': 'true', class: 'timeline-block' }),
      ['div', { class: 'timeline-title', contenteditable: 'false' }, '时间线'],
      ['div', { class: 'timeline-rail' }, 0],
    ]
  },

  addCommands() {
    return {
      setTimeline:
        () =>
        ({ chain }: any) => {
          const today = new Date()
          const y = today.getFullYear()
          const m = String(today.getMonth() + 1).padStart(2, '0')
          const d = String(today.getDate()).padStart(2, '0')
          const iso = `${y}-${m}-${d}`
          return chain()
            .insertContent({
              type: 'timeline',
              content: [
                { type: 'timelineItem', attrs: { date: iso }, content: [{ type: 'text', text: '新事件' }] },
              ],
            })
            .run()
        },
    } as any
  },
})
