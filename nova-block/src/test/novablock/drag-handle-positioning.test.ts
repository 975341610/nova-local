/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computePosition } from '@floating-ui/dom'
import {
  dragHandleComputePositionConfig,
  getDragHandleElement,
  repositionDragHandleAtNode,
} from '../../components/novablock/dragHandlePositioning'

vi.mock('@floating-ui/dom', async () => {
  const actual = await vi.importActual<typeof import('@floating-ui/dom')>('@floating-ui/dom')

  return {
    ...actual,
    computePosition: vi.fn(),
  }
})

describe('dragHandlePositioning', () => {
  beforeEach(() => {
    vi.mocked(computePosition).mockReset()
  })

  it('repositions the visible drag handle against the current block node', async () => {
    const dragHandle = document.createElement('div')
    const blockNode = document.createElement('p')
    const editor = {
      view: {
        nodeDOM: vi.fn(() => blockNode),
      },
    }

    vi.mocked(computePosition).mockResolvedValue({
      x: 24,
      y: 96,
      strategy: 'absolute',
      placement: 'left-start',
      middlewareData: {},
    } as Awaited<ReturnType<typeof computePosition>>)

    await expect(
      repositionDragHandleAtNode({
        editor: editor as never,
        dragHandleElement: dragHandle,
        pos: 7,
      }),
    ).resolves.toBe(true)

    expect(editor.view.nodeDOM).toHaveBeenCalledWith(7)
    expect(computePosition).toHaveBeenCalledWith(
      expect.objectContaining({
        getBoundingClientRect: expect.any(Function),
      }),
      dragHandle,
      expect.objectContaining({ placement: 'left-start', strategy: 'fixed' }),
    )
    expect(dragHandle.style.position).toBe('absolute')
    expect(dragHandle.style.left).toBe('24px')
    expect(dragHandle.style.top).toBe('96px')
  })

  it('skips repositioning when the current block DOM node is unavailable', async () => {
    const dragHandle = document.createElement('div')
    const editor = {
      view: {
        nodeDOM: vi.fn(() => null),
      },
    }

    await expect(
      repositionDragHandleAtNode({
        editor: editor as never,
        dragHandleElement: dragHandle,
        pos: 5,
      }),
    ).resolves.toBe(false)

    expect(computePosition).not.toHaveBeenCalled()
  })

  it('finds the positioned drag handle element from the inner handle content', () => {
    const outer = document.createElement('div')
    outer.className = 'drag-handle'
    const inner = document.createElement('div')
    outer.appendChild(inner)

    expect(getDragHandleElement(inner)).toBe(outer)
  })

  it('uses fixed positioning for the drag handle config to avoid scroll-container drift', () => {
    expect(dragHandleComputePositionConfig).toEqual(
      expect.objectContaining({
        strategy: 'fixed',
      }),
    )
  })
})
