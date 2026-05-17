import { computePosition, offset, type ComputePositionConfig, type VirtualElement } from '@floating-ui/dom'

type EditorViewLike = {
  dom: HTMLElement
  nodeDOM: (pos: number) => Node | null
  posAtDOM?: (node: Node, offset: number) => number
  state?: {
    doc?: {
      nodeAt?: (pos: number) => unknown
      resolve?: (pos: number) => {
        depth: number
        before?: (depth: number) => number
      }
    }
  }
}

type EditorLike = {
  view: EditorViewLike
  state?: EditorViewLike['state']
  isDestroyed: boolean
}

export const dragHandleComputePositionConfig: ComputePositionConfig = {
  placement: 'left-start',
  strategy: 'fixed',
  middleware: [
    offset({
      mainAxis: 8,
      crossAxis: 0,
    }),
  ],
}

export const QINGZHI_BLOCK_HANDLE_WIDTH = 32
export const QINGZHI_BLOCK_HANDLE_GAP = 32

type QingZhiBlockHandleRect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

type PointLike = {
  x: number
  y: number
}

export function getQingZhiBlockHandleRect(referenceRect: DOMRect | null): QingZhiBlockHandleRect | null {
  if (!referenceRect) {
    return null
  }

  const size = QINGZHI_BLOCK_HANDLE_WIDTH
  const left = Math.round(referenceRect.left - QINGZHI_BLOCK_HANDLE_GAP - size)
  const top = Math.round(referenceRect.top)

  return {
    left,
    top,
    right: left + size,
    bottom: top + size,
    width: size,
    height: size,
  }
}

export function shouldKeepDragHandlePositionOnNodeLoss({
  nextPos,
  bridgeLocked,
  menuOpen,
}: {
  nextPos: number
  bridgeLocked: boolean
  menuOpen: boolean
}): boolean {
  return nextPos < 0 && (bridgeLocked || menuOpen)
}

export function makeDragHandleElementInteractive(dragHandleElement: HTMLElement | null): void {
  if (!dragHandleElement) {
    return
  }

  dragHandleElement.style.visibility = ''
  dragHandleElement.style.pointerEvents = 'auto'
}

function getAdjustedReferenceRect(element: Element): DOMRect {
  return element.getBoundingClientRect()
}

function getEditorDoc(editor: EditorLike) {
  return editor.view.state?.doc ?? editor.state?.doc ?? null
}

function normalizeDragHandleTargetPos(editor: EditorLike, pos: number): number | null {
  if (!Number.isFinite(pos) || pos < 0) {
    return null
  }

  const doc = getEditorDoc(editor)
  if (!doc) {
    return pos
  }

  try {
    const resolved = doc.resolve?.(pos)
    if (resolved && resolved.depth > 0 && typeof resolved.before === 'function') {
      const blockPos = resolved.before(1)
      return Number.isFinite(blockPos) && blockPos >= 0 ? blockPos : pos
    }

    const nodeAtPos = doc.nodeAt?.(pos)
    if (nodeAtPos) {
      return pos
    }
  } catch {
    return pos
  }

  return pos
}

function isUsableBlockRect(rect: DOMRect): boolean {
  return (
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.bottom) &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.right) &&
    rect.width > 0 &&
    rect.height > 0
  )
}

function getTopLevelBlockElementAtPoint(editorRoot: HTMLElement, point: PointLike): Element | null {
  const children = Array.from(editorRoot.children)
  if (children.length === 0 || !Number.isFinite(point.y)) {
    return null
  }

  let nearest: { element: Element; distance: number } | null = null

  for (const child of children) {
    const rect = child.getBoundingClientRect()
    if (!isUsableBlockRect(rect)) {
      continue
    }

    if (point.y >= rect.top - 4 && point.y <= rect.bottom + 4) {
      return child
    }

    const distance = point.y < rect.top ? rect.top - point.y : point.y - rect.bottom
    if (!nearest || distance < nearest.distance) {
      nearest = { element: child, distance }
    }
  }

  const rootRect = editorRoot.getBoundingClientRect()
  if (!isUsableBlockRect(rootRect)) {
    return null
  }

  const isInsideEditorVerticalRange = point.y >= rootRect.top - 24 && point.y <= rootRect.bottom + 24
  if (!isInsideEditorVerticalRange) {
    return null
  }

  return nearest?.element ?? null
}

export function getDragHandleAnchorElement(element: Element): Element {
  const nodeViewWrapper = element.closest('[data-node-view-wrapper]')
  if (nodeViewWrapper) {
    return nodeViewWrapper
  }

  const listItem = element.closest('li')
  const listRoot = listItem?.closest('ul, ol')
  if (listRoot) {
    return listRoot
  }

  const tableWrapper = element.closest('.tableWrapper')
  if (tableWrapper) {
    return tableWrapper
  }

  const blockWrapper = element.closest(
    [
      '.code-block-wrapper',
      '.math-block-wrapper',
      '[data-media-wrapper]',
      '.notion-file-block',
      '.slider-node',
      '.callout-block',
      '[data-highlight-block]',
      '[data-type="column-group"]',
      '[data-type="freehand"]',
      '[data-type="washi-tape"]',
      '[data-timeline]',
      'blockquote',
      'figure',
      'pre',
      'hr',
      'table',
    ].join(', '),
  )

  return blockWrapper ?? element
}

export function getDragHandleTargetPosFromElement(editor: EditorLike, element: Element | null): number | null {
  if (!editor || editor.isDestroyed || !editor.view || !editor.view.dom || !element) {
    return null
  }

  const editorRoot = editor.view.dom

  if (!editorRoot.contains(element)) {
    return null
  }

  const anchorElement = getDragHandleAnchorElement(element)

  if (anchorElement === editorRoot || !editorRoot.contains(anchorElement) || typeof editor.view.posAtDOM !== 'function') {
    return null
  }

  try {
    const pos = editor.view.posAtDOM(anchorElement, 0)
    return normalizeDragHandleTargetPos(editor, pos)
  } catch {
    return null
  }
}

export function getDragHandleTargetPosFromPoint(editor: EditorLike, point: PointLike): number | null {
  if (!editor || editor.isDestroyed || !editor.view || !editor.view.dom || typeof editor.view.posAtDOM !== 'function') {
    return null
  }

  const editorRoot = editor.view.dom
  const topLevelBlock = getTopLevelBlockElementAtPoint(editorRoot, point)

  if (topLevelBlock) {
    try {
      const pos = editor.view.posAtDOM(topLevelBlock, 0)
      const normalizedPos = normalizeDragHandleTargetPos(editor, pos)
      if (normalizedPos !== null) {
        return normalizedPos
      }
    } catch {
      // Fall through to elementFromPoint-based resolution below.
    }
  }

  const root = editorRoot.getRootNode()
  const elementFromPoint = root instanceof Document || root instanceof ShadowRoot
    ? root.elementFromPoint?.(point.x, point.y)
    : document.elementFromPoint(point.x, point.y)

  return getDragHandleTargetPosFromElement(editor, elementFromPoint instanceof Element ? elementFromPoint : null)
}

export function getDragHandleReferenceRect(editor: EditorLike, pos: number): DOMRect | null {
  if (!editor || editor.isDestroyed || !editor.view || !editor.view.dom || pos < 0) {
    return null
  }

  const domNode = editor.view.nodeDOM(pos)

  if (!(domNode instanceof Element)) {
    return null
  }

  const anchorElement = getDragHandleAnchorElement(domNode)

  return getAdjustedReferenceRect(anchorElement)
}

export function getDragHandleVirtualReference(editor: EditorLike, pos: number): VirtualElement | null {
  return {
    getBoundingClientRect: () => getDragHandleReferenceRect(editor, pos) ?? new DOMRect(),
  }
}

export function getDragHandleElement(handleContentElement: HTMLElement | null): HTMLElement | null {
  if (!handleContentElement) {
    return null
  }

  const qingzhiDragHandleElement = handleContentElement.closest('.qz-custom-block-handle, .qz-block-drag-handle-floating')

  if (qingzhiDragHandleElement instanceof HTMLElement) {
    return qingzhiDragHandleElement
  }

  const dragHandleElement = handleContentElement.closest('.drag-handle')

  if (dragHandleElement instanceof HTMLElement) {
    return dragHandleElement
  }

  return handleContentElement.parentElement
}

export async function repositionDragHandleAtNode({
  editor,
  dragHandleElement,
  pos,
  computePositionConfig = dragHandleComputePositionConfig,
}: {
  editor: EditorLike
  dragHandleElement: HTMLElement | null
  pos: number
  computePositionConfig?: ComputePositionConfig
}): Promise<boolean> {
  if (!editor || editor.isDestroyed || !editor.view || !editor.view.dom || !dragHandleElement || pos < 0) {
    return false
  }

  const reference = getDragHandleVirtualReference(editor, pos)
  const referenceRect = getDragHandleReferenceRect(editor, pos)

  if (!reference || !referenceRect) {
    return false
  }

  const { x, y, strategy } = await computePosition(reference, dragHandleElement, computePositionConfig)

  Object.assign(dragHandleElement.style, {
    position: strategy,
    left: `${x}px`,
    top: `${y}px`,
  })

  return true
}
