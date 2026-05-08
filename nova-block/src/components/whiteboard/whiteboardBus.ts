/**
 * v0.21.6 · 白板编辑器事件总线
 *
 * 为什么单独搞一个 bus:
 *   展示层 (FreehandNodeView) 不持有 editor/modal 引用, 靠全局事件触发 fullscreen modal.
 *   Host 监听, modal 关闭时反向调用 commitBack 把数据写回 tiptap attr.
 */
import type { WhiteboardData } from '../../lib/whiteboard/types'

type OpenDetail = {
  nodeId: string // tiptap pos 不稳定, 用我们自己塞的 nodeId
  data: WhiteboardData
  commitBack: (next: WhiteboardData) => void
}

type Listener = (d: OpenDetail) => void

let listeners: Listener[] = []

export function onWhiteboardOpen(l: Listener): () => void {
  listeners.push(l)
  return () => {
    listeners = listeners.filter((x) => x !== l)
  }
}

export function emitWhiteboardOpen(d: OpenDetail): void {
  for (const l of listeners) l(d)
}
