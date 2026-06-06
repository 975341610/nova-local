import { useRef, useState } from 'react'

import type { BlockHandleOverlayState } from '../components/BlockHandleOverlay'

export type DragInteractionState = {
  startX: number
  startY: number
  startTime: number
}

export function useBlockHandleLayerState() {
  const activeDragHandlePosRef = useRef(-1)
  const dragHandleRepositionFrameRef = useRef<number | null>(null)
  const dragInteractionRef = useRef<DragInteractionState | null>(null)
  const dragPreviewRef = useRef<HTMLElement | null>(null)
  const suppressNextGripClickRef = useRef(false)
  const dragHandleBridgeLockedRef = useRef(false)
  const [blockHandleState, setBlockHandleState] = useState<BlockHandleOverlayState | null>(null)

  return {
    activeDragHandlePosRef,
    dragHandleRepositionFrameRef,
    dragInteractionRef,
    dragPreviewRef,
    suppressNextGripClickRef,
    dragHandleBridgeLockedRef,
    blockHandleState,
    setBlockHandleState,
  }
}
