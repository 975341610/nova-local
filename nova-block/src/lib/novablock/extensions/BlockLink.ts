import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

import { buildBlockLinkHref, parseBlockLinkHref, storePendingBlockJump } from '../blockLinks'

export type BlockLinkOptions = {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockLink: {
      setBlockLink: (attrs: { noteId: number; blockId: string; label?: string }) => ReturnType
      unsetBlockLink: () => ReturnType
    }
  }
}

export const BlockLink = Mark.create<BlockLinkOptions>({
  name: 'blockLink',

  priority: 1000,

  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: element => element.getAttribute('data-note-id'),
        renderHTML: attributes => ({ 'data-note-id': attributes.noteId }),
      },
      blockId: {
        default: null,
        parseHTML: element => element.getAttribute('data-block-id'),
        renderHTML: attributes => ({ 'data-block-id': attributes.blockId }),
      },
      label: {
        default: null,
        parseHTML: element => element.getAttribute('data-label'),
        renderHTML: attributes => {
          if (!attributes.label) return {}
          return { 'data-label': attributes.label }
        },
      },
      href: {
        default: null,
        parseHTML: element => element.getAttribute('href'),
        renderHTML: attributes => {
          const noteId = Number(attributes.noteId)
          const blockId = typeof attributes.blockId === 'string' ? attributes.blockId : ''
          if (!Number.isFinite(noteId) || !blockId) return {}
          return { href: buildBlockLinkHref({ noteId, blockId, label: attributes.label }) }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-type="block-link"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'block-link',
        class: 'qz-block-link',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setBlockLink:
        attrs =>
        ({ chain }) =>
          chain()
            .setMark(this.name, {
              noteId: attrs.noteId,
              blockId: attrs.blockId,
              label: attrs.label,
            })
            .run(),
      unsetBlockLink:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    }
  },

  addProseMirrorPlugins() {
    const openBlockLink = (event: Event): boolean => {
      const target = event.target as HTMLElement | null
      const link = target?.closest?.('a[data-type="block-link"]') as HTMLAnchorElement | null
      const parsed = parseBlockLinkHref(link?.getAttribute('href') || '')
      if (!parsed) return false

      event.preventDefault()
      event.stopPropagation()
      if ('stopImmediatePropagation' in event && typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }
      if (typeof window !== 'undefined') {
        storePendingBlockJump(parsed)
        window.dispatchEvent(new CustomEvent('nova-select-note', {
          detail: {
            noteId: parsed.noteId,
            blockId: parsed.blockId,
            blockLabel: parsed.label,
          },
        }))
        window.dispatchEvent(new CustomEvent('nova:block-jump-requested', {
          detail: parsed,
        }))
      }
      return true
    }

    return [
      new Plugin({
        key: new PluginKey('qingzhi-block-link-click'),
        props: {
          handleDOMEvents: {
            click: (_view, event) => openBlockLink(event),
          },
          handleClick: (_view, _pos, event) => {
            return openBlockLink(event)
          },
        },
      }),
    ]
  },
})
