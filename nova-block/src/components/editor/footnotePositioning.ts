import type { CSSProperties } from 'react'

const VIEWPORT_PADDING = 12
const POPOVER_GAP = 10

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const isUsableRect = (rect: DOMRect) =>
  Number.isFinite(rect.left) &&
  Number.isFinite(rect.top) &&
  Number.isFinite(rect.width) &&
  Number.isFinite(rect.height) &&
  rect.width > 0 &&
  rect.height > 0

export function computeFootnotePopoverStyle({
  triggerRect,
  viewportWidth,
  viewportHeight,
  viewportOffsetLeft = 0,
  viewportOffsetTop = 0,
  editing,
}: {
  triggerRect: DOMRect
  viewportWidth: number
  viewportHeight: number
  viewportOffsetLeft?: number
  viewportOffsetTop?: number
  editing: boolean
}): CSSProperties {
  const preferredWidth = editing ? 320 : 360
  const estimatedHeight = editing ? 260 : 180
  const width = Math.max(160, Math.min(preferredWidth, viewportWidth - VIEWPORT_PADDING * 2))
  const minLeft = viewportOffsetLeft + VIEWPORT_PADDING
  const minTop = viewportOffsetTop + VIEWPORT_PADDING
  const maxLeft = Math.max(minLeft, viewportOffsetLeft + viewportWidth - width - VIEWPORT_PADDING)
  const maxTop = Math.max(minTop, viewportOffsetTop + viewportHeight - estimatedHeight - VIEWPORT_PADDING)

  if (!isUsableRect(triggerRect)) {
    return {
      position: 'fixed',
      left: Math.round(clamp(viewportOffsetLeft + (viewportWidth - width) / 2, minLeft, maxLeft)),
      top: Math.round(clamp(viewportOffsetTop + (viewportHeight - estimatedHeight) / 2, minTop, maxTop)),
      width,
      maxWidth: 'calc(100vw - 24px)',
      zIndex: 1000,
    }
  }

  const centeredLeft = triggerRect.left + triggerRect.width / 2 - width / 2
  const left = clamp(centeredLeft, minLeft, maxLeft)
  const hasRoomAbove = triggerRect.top >= estimatedHeight + POPOVER_GAP + minTop
  const hasRoomBelow = viewportOffsetTop + viewportHeight - triggerRect.bottom >= estimatedHeight + POPOVER_GAP + VIEWPORT_PADDING
  const preferredTop = hasRoomAbove || !hasRoomBelow
    ? triggerRect.top - estimatedHeight - POPOVER_GAP
    : triggerRect.bottom + POPOVER_GAP

  return {
    position: 'fixed',
    left: Math.round(left),
    top: Math.round(clamp(preferredTop, minTop, maxTop)),
    width,
    maxWidth: 'calc(100vw - 24px)',
    zIndex: 1000,
  }
}
