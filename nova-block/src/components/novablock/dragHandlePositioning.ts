import { computePosition, offset, type ComputePositionConfig, type VirtualElement } from '@floating-ui/dom'

type EditorViewLike = {
  dom: HTMLElement
  nodeDOM: (pos: number) => Node | null
}

type EditorLike = {
  view: EditorViewLike
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

export function getDragHandleReferenceRect(editor: EditorLike, pos: number): DOMRect | null {
  if (!editor || editor.isDestroyed || !editor.view || !editor.view.dom || pos < 0) {
    return null
  }

  const domNode = editor.view.nodeDOM(pos)

  if (!(domNode instanceof Element)) {
    return null
  }

  const anchorElement = domNode.closest('[data-node-view-wrapper]') ?? domNode
  const headingToggleElement = anchorElement.querySelector('[contenteditable="false"][title]')

  if (headingToggleElement instanceof HTMLElement) {
    return headingToggleElement.getBoundingClientRect()
  }

  return anchorElement.getBoundingClientRect()
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
