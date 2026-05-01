/**
 * v0.21.4 · ListStyle
 *
 * 给 bulletList / orderedList 统一加上 `data-list-style` 属性，
 * 配合 CSS 渲染多种 marker（disc/circle/square/dash/arrow/star/flower/check/
 * decimal/lower-alpha/upper-alpha/lower-roman/upper-roman/cjk-han）。
 *
 * v0.21.4 修复：
 *   - 支持传入 `pos`（来自拖拽手柄的 targetPos），避免依赖 $from 导致
 *     NodeSelection 状态下定位不到列表的问题
 *   - 应用完属性后恢复 TextSelection 到列表内，避免 NodeSelection 残留
 *     造成 "点完卡顿无法输入"
 */
import { Extension } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'

export type BulletListStyle =
  | 'disc'
  | 'circle'
  | 'square'
  | 'dash'
  | 'arrow'
  | 'star'
  | 'flower'
  | 'check'

export type OrderedListStyle =
  | 'decimal'
  | 'lower-alpha'
  | 'upper-alpha'
  | 'lower-roman'
  | 'upper-roman'
  | 'cjk-han'

export type ListStyle = BulletListStyle | OrderedListStyle

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    listStyle: {
      /**
       * 为光标所在（或 pos 所指）的最近 bulletList / orderedList 节点
       * 设置 listStyle 属性。
       */
      setListStyle: (style: ListStyle, pos?: number) => ReturnType
      unsetListStyle: (pos?: number) => ReturnType
    }
  }
}

/**
 * 在给定 state / pos 下寻找最近的 bulletList / orderedList 节点。
 * - 优先处理 NodeSelection（手柄菜单场景）
 * - 兜底：从 $pos 向上回溯 depth
 */
function findListAncestor(
  state: EditorState,
  posHint?: number,
): { node: PMNode; pos: number } | null {
  const { bulletList, orderedList } = state.schema.nodes
  if (!bulletList && !orderedList) return null

  const isListNode = (n: PMNode | null | undefined) =>
    !!n && (n.type === bulletList || n.type === orderedList)

  // 1) 若提供了显式 pos，优先基于该位置
  if (typeof posHint === 'number' && posHint >= 0) {
    try {
      const nodeAt = state.doc.nodeAt(posHint)
      if (isListNode(nodeAt)) {
        return { node: nodeAt as PMNode, pos: posHint }
      }
      const $at = state.doc.resolve(posHint)
      const found = climbForList($at, isListNode)
      if (found) return found
      // 再从 pos+1 向内探一层（适用于 targetPos 指向 list 的场景）
      try {
        const $inside = state.doc.resolve(Math.min(posHint + 1, state.doc.content.size))
        const innerFound = climbForList($inside, isListNode)
        if (innerFound) return innerFound
      } catch {
        /* noop */
      }
    } catch {
      /* fall through */
    }
  }

  // 2) 基于当前选区
  const sel = state.selection
  const maybeSelectedNode = (sel as unknown as { node?: PMNode }).node
  if (maybeSelectedNode && isListNode(maybeSelectedNode)) {
    return { node: maybeSelectedNode, pos: sel.from }
  }

  const $from = sel.$from
  const found = climbForList($from, isListNode)
  if (found) return found

  // 3) NodeSelection 时 $from 在外层，再尝试从 $from 内部一级
  if (maybeSelectedNode) {
    try {
      const $inside = state.doc.resolve(Math.min(sel.from + 1, state.doc.content.size))
      const innerFound = climbForList($inside, isListNode)
      if (innerFound) return innerFound
    } catch {
      /* noop */
    }
  }
  return null
}

function climbForList(
  $pos: ResolvedPos,
  isListNode: (n: PMNode | null | undefined) => boolean,
): { node: PMNode; pos: number } | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth)
    if (isListNode(node)) {
      return { node, pos: depth === 0 ? 0 : $pos.before(depth) }
    }
  }
  return null
}

/**
 * 在事务 tr 中，基于目标列表位置，把光标恢复到该列表里第一个可编辑文本块
 * 的末尾，避免 NodeSelection 残留。
 */
function restoreTextSelectionInsideList(tr: Transaction, listPos: number) {
  const list = tr.doc.nodeAt(listPos)
  if (!list) return
  let target: number | null = null
  list.descendants((node, relPos) => {
    if (target !== null) return false
    if (node.isTextblock) {
      // relPos 是相对于 list 节点的偏移；listPos+1 进入 list 内部
      // 再 +relPos 到该 textblock 起点；+node.nodeSize-1 到末尾
      target = listPos + 1 + relPos + node.nodeSize - 1
      return false
    }
    return true
  })
  if (target !== null) {
    try {
      tr.setSelection(TextSelection.create(tr.doc, target))
    } catch {
      /* noop */
    }
  }
}

export const ListStyleExtension = Extension.create({
  name: 'listStyle',

  addGlobalAttributes() {
    return [
      {
        types: ['bulletList', 'orderedList'],
        attributes: {
          listStyle: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-list-style'),
            renderHTML: (attributes) => {
              if (!attributes.listStyle) return {}
              return { 'data-list-style': attributes.listStyle }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setListStyle:
        (style: ListStyle, pos?: number) =>
        ({ state, dispatch, view }) => {
          const target = findListAncestor(state, pos)
          if (!target) return false
          if (!dispatch) return true
          const tr = state.tr.setNodeAttribute(target.pos, 'listStyle', style)
          restoreTextSelectionInsideList(tr, target.pos)
          tr.scrollIntoView()
          dispatch(tr)
          // 确保编辑器拿到焦点
          queueMicrotask(() => {
            try {
              view?.focus()
            } catch {
              /* noop */
            }
          })
          return true
        },
      unsetListStyle:
        (pos?: number) =>
        ({ state, dispatch, view }) => {
          const target = findListAncestor(state, pos)
          if (!target) return false
          if (!dispatch) return true
          const tr = state.tr.setNodeAttribute(target.pos, 'listStyle', null)
          restoreTextSelectionInsideList(tr, target.pos)
          dispatch(tr)
          queueMicrotask(() => {
            try {
              view?.focus()
            } catch {
              /* noop */
            }
          })
          return true
        },
    }
  },
})

export default ListStyleExtension
