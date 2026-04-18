type RectLike = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export function computePlaylistPopoverPosition(
  anchorRect: RectLike,
  viewportWidth: number,
  viewportHeight: number,
  popoverWidth = 288,
  popoverHeight = 400,
) {
  const centerX = anchorRect.left + anchorRect.width / 2
  let left = centerX - popoverWidth / 2
  let top = anchorRect.bottom + 8

  if (left + popoverWidth > viewportWidth - 10) {
    left = viewportWidth - popoverWidth - 10
  }
  if (left < 10) {
    left = 10
  }

  if (top + popoverHeight > viewportHeight - 10) {
    top = anchorRect.top - popoverHeight - 8
  }
  if (top < 10) {
    top = 10
  }

  return { left, top }
}
