import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockId: {
      ensureBlockIds: () => ReturnType
    }
  }
}

const TARGET_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'table',
  'mathBlock',
  'image',
  'file',
  'fileNode',
  'videoNode',
  'audioNode',
  'embedNode',
  'callout',
  'timelineBlock',
  'highlightBlock',
  'columnGroup',
  'slider',
  'freehand',
  'washiTape',
  'journalStamp',
  'countdown',
  'musicPlayer',
  'miniCalendar',
  'kanban',
  'habitTracker',
  'todo',
]

export const BlockId = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: TARGET_BLOCK_TYPES,
        attributes: {
          blockId: {
            default: null,
            parseHTML: element => element.getAttribute('data-block-id'),
            renderHTML: attributes => {
              if (!attributes.blockId) return {}
              return { 'data-block-id': attributes.blockId }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      ensureBlockIds: () => ({ state, dispatch }) => {
        const tr = state.tr
        const changed = ensureTopLevelBlockIds(tr)
        if (changed && dispatch) {
          dispatch(tr.setMeta('addToHistory', false))
        }
        return changed
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('qingzhi-block-id-generator'),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some(tr => tr.docChanged)) return undefined
          const tr = newState.tr
          const changed = ensureTopLevelBlockIds(tr)
          return changed ? tr.setMeta('addToHistory', false) : undefined
        },
      }),
    ]
  },
})

function ensureTopLevelBlockIds(tr: any): boolean {
  let changed = false
  const usedIds = new Set<string>()

  tr.doc.descendants((node: any) => {
    const blockId = node.attrs?.blockId
    if (typeof blockId === 'string' && blockId.trim()) {
      usedIds.add(blockId)
    }
  })

  tr.doc.descendants((node: any, pos: number, parent: any) => {
    if (parent?.type?.name !== 'doc') return false
    if (!TARGET_BLOCK_TYPES.includes(node.type.name)) return false

    const current = typeof node.attrs?.blockId === 'string' ? node.attrs.blockId.trim() : ''
    if (current && usedIds.has(current)) return false

    const nextId = current || createBlockId(usedIds)
    usedIds.add(nextId)
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      blockId: nextId,
    })
    changed = true
    return false
  })

  return changed
}

function createBlockId(usedIds: Set<string>): string {
  let id = ''
  do {
    const random = Math.random().toString(36).slice(2, 10)
    id = `blk-${random || Date.now().toString(36)}`
  } while (usedIds.has(id))
  return id
}
