import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

import { parseBlockLinkHref, storePendingBlockJump } from '../blockLinks'

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
        renderHTML: () => ({}),
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
        role: 'link',
        tabindex: '0',
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
    const readBlockLink = (link: HTMLAnchorElement | null): ReturnType<typeof parseBlockLinkHref> => {
      if (!link) return null
      const noteId = Number(link.getAttribute('data-note-id'))
      const blockId = link.getAttribute('data-block-id')?.trim()
      if (Number.isFinite(noteId) && noteId > 0 && blockId) {
        return {
          noteId,
          blockId,
          label: link.getAttribute('data-label') || undefined,
        }
      }
      return parseBlockLinkHref(link.getAttribute('href') || '')
    }

    const findBlockLink = (event: Event): HTMLAnchorElement | null => {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : []
      for (const item of path) {
        if (item instanceof HTMLAnchorElement && item.matches('a[data-type="block-link"]')) {
          return item
        }
        if (item instanceof HTMLElement) {
          const link = item.closest('a[data-type="block-link"]')
          if (link instanceof HTMLAnchorElement) return link
        }
      }

      const target = event.target
      const element = target instanceof HTMLElement
        ? target
        : target instanceof Node
          ? target.parentElement
          : null
      return element?.closest('a[data-type="block-link"]') as HTMLAnchorElement | null
    }

    const openBlockLink = (event: Event): boolean => {
      const link = findBlockLink(event)
      const parsed = readBlockLink(link)
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
        view: view => {
          const captureClick = (event: MouseEvent) => {
            openBlockLink(event)
          }
          const captureKeydown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            openBlockLink(event)
          }
          view.dom.addEventListener('click', captureClick, true)
          view.dom.addEventListener('keydown', captureKeydown, true)
          return {
            destroy() {
              view.dom.removeEventListener('click', captureClick, true)
              view.dom.removeEventListener('keydown', captureKeydown, true)
            },
          }
        },
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
