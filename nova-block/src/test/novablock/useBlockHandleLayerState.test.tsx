// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useBlockHandleLayerState } from '../../components/novablock/hooks/useBlockHandleLayerState'

describe('useBlockHandleLayerState', () => {
  it('keeps block handle transient refs and visible state in one layer hook', () => {
    const { result } = renderHook(() => useBlockHandleLayerState())

    expect(result.current.activeDragHandlePosRef.current).toBe(-1)
    expect(result.current.dragHandleRepositionFrameRef.current).toBeNull()
    expect(result.current.dragInteractionRef.current).toBeNull()
    expect(result.current.blockHandleState).toBeNull()

    act(() => {
      result.current.activeDragHandlePosRef.current = 9
      result.current.setBlockHandleState({
        visible: true,
        pos: 9,
        rect: { top: 10, left: 20, right: 44, bottom: 34, width: 24, height: 24 },
        referenceRect: { top: 12, left: 50, right: 220, bottom: 40 },
      })
    })

    expect(result.current.activeDragHandlePosRef.current).toBe(9)
    expect(result.current.blockHandleState?.visible).toBe(true)
    expect(result.current.blockHandleState?.pos).toBe(9)
  })
})
