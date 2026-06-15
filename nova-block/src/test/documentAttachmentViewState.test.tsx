/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDocumentAttachmentViewState } from '../components/document/useDocumentAttachmentViewState'

describe('useDocumentAttachmentViewState', () => {
  it('keeps document preview controls bounded and centralized outside DocumentAttachmentView', () => {
    const viewModeChanges: string[] = []
    const { result } = renderHook(() =>
      useDocumentAttachmentViewState({
        cacheKey: 'doc-a',
        initialViewMode: 'card',
        pageCount: 3,
        onViewModeChange: (next) => viewModeChanges.push(next),
      }),
    )

    expect(result.current.sessionViewMode).toBe('card')
    expect(result.current.fullscreen).toBe(false)
    expect(result.current.page).toBe(1)
    expect(result.current.zoom).toBe(100)

    act(() => result.current.setCachedViewMode('preview'))
    expect(result.current.sessionViewMode).toBe('preview')
    expect(viewModeChanges).toEqual(['preview'])

    act(() => result.current.setNextPage(20))
    expect(result.current.page).toBe(3)

    act(() => result.current.setNextPage(-4))
    expect(result.current.page).toBe(1)

    act(() => result.current.zoomIn())
    expect(result.current.zoom).toBe(110)

    act(() => {
      for (let index = 0; index < 20; index += 1) {
        result.current.zoomOut()
      }
    })
    expect(result.current.zoom).toBe(50)

    act(() => result.current.setFullscreen(true))
    expect(result.current.fullscreen).toBe(true)
  })
})
