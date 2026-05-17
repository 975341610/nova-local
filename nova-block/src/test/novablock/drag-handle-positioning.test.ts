/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computePosition } from '@floating-ui/dom'
import {
  QINGZHI_BLOCK_HANDLE_WIDTH,
  makeDragHandleElementInteractive,
  dragHandleComputePositionConfig,
  getDragHandleAnchorElement,
  getDragHandleElement,
  getQingZhiBlockHandleRect,
  getDragHandleReferenceRect,
  getDragHandleTargetPosFromElement,
  getDragHandleTargetPosFromPoint,
  repositionDragHandleAtNode,
  shouldKeepDragHandlePositionOnNodeLoss,
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
        dom: document.createElement('div'),
        nodeDOM: vi.fn(() => blockNode),
      },
      isDestroyed: false,
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

  it('uses the outer block edge for QingZhi references so padded text blocks share one handle lane', () => {
    const blockNode = document.createElement('p')
    blockNode.style.paddingLeft = '40px'
    vi.spyOn(blockNode, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 20,
      right: 500,
      bottom: 60,
      width: 400,
      height: 40,
      x: 100,
      y: 20,
      toJSON: () => ({}),
    } as DOMRect)

    const editor = {
      view: {
        dom: document.createElement('div'),
        nodeDOM: vi.fn(() => blockNode),
      },
      isDestroyed: false,
    }

    const rect = getDragHandleReferenceRect(editor as never, 3)

    expect(rect?.left).toBe(100)
    expect(rect?.right).toBe(500)
    expect(rect?.width).toBe(400)
  })

  it('normalizes table descendants to the table wrapper before positioning the handle', () => {
    const tableWrapper = document.createElement('div')
    tableWrapper.className = 'tableWrapper'
    tableWrapper.style.paddingLeft = '40px'
    const table = document.createElement('table')
    const tbody = document.createElement('tbody')
    const tr = document.createElement('tr')
    const td = document.createElement('td')
    tr.appendChild(td)
    tbody.appendChild(tr)
    table.appendChild(tbody)
    tableWrapper.appendChild(table)

    vi.spyOn(tableWrapper, 'getBoundingClientRect').mockReturnValue({
      left: 80,
      top: 40,
      right: 580,
      bottom: 140,
      width: 500,
      height: 100,
      x: 80,
      y: 40,
      toJSON: () => ({}),
    } as DOMRect)

    vi.spyOn(table, 'getBoundingClientRect').mockReturnValue({
      left: 120,
      top: 48,
      right: 560,
      bottom: 132,
      width: 440,
      height: 84,
      x: 120,
      y: 48,
      toJSON: () => ({}),
    } as DOMRect)

    const editor = {
      view: {
        dom: document.createElement('div'),
        nodeDOM: vi.fn(() => table),
      },
      isDestroyed: false,
    }

    expect(getDragHandleAnchorElement(td)).toBe(tableWrapper)

    const rect = getDragHandleReferenceRect(editor as never, 9)

    expect(rect?.left).toBe(80)
    expect(rect?.top).toBe(40)
    expect(rect?.right).toBe(580)
    expect(rect?.width).toBe(500)
  })

  it('resolves table descendants to the table block position for stable handle clicks', () => {
    const editorRoot = document.createElement('div')
    const tableWrapper = document.createElement('div')
    tableWrapper.className = 'tableWrapper'
    const table = document.createElement('table')
    const td = document.createElement('td')
    table.appendChild(td)
    tableWrapper.appendChild(table)
    editorRoot.appendChild(tableWrapper)

    const posAtDOM = vi.fn(() => 22)
    const editor = {
      view: {
        dom: editorRoot,
        nodeDOM: vi.fn(),
        posAtDOM,
      },
      isDestroyed: false,
    }

    expect(getDragHandleTargetPosFromElement(editor as never, td)).toBe(22)
    expect(posAtDOM).toHaveBeenCalledWith(tableWrapper, 0)
  })

  it('normalizes code block descendants to the outer code wrapper before positioning the handle', () => {
    const codeWrapper = document.createElement('pre')
    codeWrapper.className = 'code-block-wrapper'
    const innerCode = document.createElement('code')
    codeWrapper.appendChild(innerCode)

    vi.spyOn(codeWrapper, 'getBoundingClientRect').mockReturnValue({
      left: 96,
      top: 88,
      right: 560,
      bottom: 188,
      width: 464,
      height: 100,
      x: 96,
      y: 88,
      toJSON: () => ({}),
    } as DOMRect)

    const editor = {
      view: {
        dom: document.createElement('div'),
        nodeDOM: vi.fn(() => innerCode),
      },
      isDestroyed: false,
    }

    expect(getDragHandleAnchorElement(innerCode)).toBe(codeWrapper)

    const rect = getDragHandleReferenceRect(editor as never, 9)

    expect(rect?.left).toBe(96)
    expect(rect?.top).toBe(88)
    expect(rect?.right).toBe(560)
  })

  it('normalizes blockquote descendants to the outer quote card before positioning the handle', () => {
    const quote = document.createElement('blockquote')
    quote.style.paddingLeft = '44px'
    const paragraph = document.createElement('p')
    quote.appendChild(paragraph)

    vi.spyOn(quote, 'getBoundingClientRect').mockReturnValue({
      left: 88,
      top: 120,
      right: 588,
      bottom: 212,
      width: 500,
      height: 92,
      x: 88,
      y: 120,
      toJSON: () => ({}),
    } as DOMRect)

    vi.spyOn(paragraph, 'getBoundingClientRect').mockReturnValue({
      left: 132,
      top: 140,
      right: 560,
      bottom: 188,
      width: 428,
      height: 48,
      x: 132,
      y: 140,
      toJSON: () => ({}),
    } as DOMRect)

    const editor = {
      view: {
        dom: document.createElement('div'),
        nodeDOM: vi.fn(() => paragraph),
      },
      isDestroyed: false,
    }

    expect(getDragHandleAnchorElement(paragraph)).toBe(quote)

    const rect = getDragHandleReferenceRect(editor as never, 9)

    expect(rect?.left).toBe(88)
    expect(rect?.top).toBe(120)
    expect(rect?.right).toBe(588)
  })

  it('resolves code block descendants to the outer code block position', () => {
    const editorRoot = document.createElement('div')
    const codeWrapper = document.createElement('pre')
    codeWrapper.className = 'code-block-wrapper'
    const innerCode = document.createElement('code')
    codeWrapper.appendChild(innerCode)
    editorRoot.appendChild(codeWrapper)

    const posAtDOM = vi.fn(() => 31)
    const editor = {
      view: {
        dom: editorRoot,
        nodeDOM: vi.fn(),
        posAtDOM,
      },
      isDestroyed: false,
    }

    expect(getDragHandleTargetPosFromElement(editor as never, innerCode)).toBe(31)
    expect(posAtDOM).toHaveBeenCalledWith(codeWrapper, 0)
  })

  it('resolves list item descendants to the whole list position instead of the item', () => {
    const editorRoot = document.createElement('div')
    const list = document.createElement('ol')
    const item = document.createElement('li')
    const paragraph = document.createElement('p')
    item.appendChild(paragraph)
    list.appendChild(item)
    editorRoot.appendChild(list)

    const posAtDOM = vi.fn(() => 44)
    const editor = {
      view: {
        dom: editorRoot,
        nodeDOM: vi.fn(),
        posAtDOM,
      },
      isDestroyed: false,
    }

    expect(getDragHandleAnchorElement(paragraph)).toBe(list)
    expect(getDragHandleTargetPosFromElement(editor as never, paragraph)).toBe(44)
    expect(posAtDOM).toHaveBeenCalledWith(list, 0)
  })

  it('normalizes plugin node view descendants to their outer node view wrapper', () => {
    const nodeViewWrapper = document.createElement('div')
    nodeViewWrapper.setAttribute('data-node-view-wrapper', '')
    nodeViewWrapper.style.paddingLeft = '40px'
    const pluginCard = document.createElement('div')
    pluginCard.className = 'qz-widget-card'
    nodeViewWrapper.appendChild(pluginCard)

    vi.spyOn(nodeViewWrapper, 'getBoundingClientRect').mockReturnValue({
      left: 70,
      top: 24,
      right: 470,
      bottom: 124,
      width: 400,
      height: 100,
      x: 70,
      y: 24,
      toJSON: () => ({}),
    } as DOMRect)

    vi.spyOn(pluginCard, 'getBoundingClientRect').mockReturnValue({
      left: 110,
      top: 32,
      right: 450,
      bottom: 116,
      width: 340,
      height: 84,
      x: 110,
      y: 32,
      toJSON: () => ({}),
    } as DOMRect)

    const editor = {
      view: {
        dom: document.createElement('div'),
        nodeDOM: vi.fn(() => pluginCard),
      },
      isDestroyed: false,
    }

    expect(getDragHandleAnchorElement(pluginCard)).toBe(nodeViewWrapper)

    const rect = getDragHandleReferenceRect(editor as never, 11)

    expect(rect?.left).toBe(70)
    expect(rect?.top).toBe(24)
    expect(rect?.right).toBe(470)
  })

  it('resolves plugin node descendants to their node view wrapper position', () => {
    const editorRoot = document.createElement('div')
    const nodeViewWrapper = document.createElement('div')
    nodeViewWrapper.setAttribute('data-node-view-wrapper', '')
    const internalButton = document.createElement('button')
    nodeViewWrapper.appendChild(internalButton)
    editorRoot.appendChild(nodeViewWrapper)

    const posAtDOM = vi.fn(() => 55)
    const editor = {
      view: {
        dom: editorRoot,
        nodeDOM: vi.fn(),
        posAtDOM,
      },
      isDestroyed: false,
    }

    expect(getDragHandleTargetPosFromElement(editor as never, internalButton)).toBe(55)
    expect(posAtDOM).toHaveBeenCalledWith(nodeViewWrapper, 0)
  })

  it('normalizes internal DOM positions back to the top-level block position', () => {
    const editorRoot = document.createElement('div')
    const nodeViewWrapper = document.createElement('div')
    nodeViewWrapper.setAttribute('data-node-view-wrapper', '')
    const internalControl = document.createElement('button')
    nodeViewWrapper.appendChild(internalControl)
    editorRoot.appendChild(nodeViewWrapper)

    const editor = {
      view: {
        dom: editorRoot,
        nodeDOM: vi.fn(),
        posAtDOM: vi.fn(() => 37),
        state: {
          doc: {
            nodeAt: vi.fn(() => null),
            resolve: vi.fn(() => ({
              depth: 3,
              before: vi.fn((depth: number) => (depth === 1 ? 12 : 30)),
            })),
          },
        },
      },
      isDestroyed: false,
    }

    expect(getDragHandleTargetPosFromElement(editor as never, internalControl)).toBe(12)
  })

  it('climbs positions that already point at inner nodes back to the top-level block', () => {
    const editorRoot = document.createElement('div')
    const list = document.createElement('ol')
    const item = document.createElement('li')
    const paragraph = document.createElement('p')
    item.appendChild(paragraph)
    list.appendChild(item)
    editorRoot.appendChild(list)

    const editor = {
      view: {
        dom: editorRoot,
        nodeDOM: vi.fn(),
        posAtDOM: vi.fn(() => 27),
        state: {
          doc: {
            nodeAt: vi.fn(() => ({ type: { name: 'listItem' } })),
            resolve: vi.fn(() => ({
              depth: 2,
              before: vi.fn((depth: number) => (depth === 1 ? 18 : 26)),
            })),
          },
        },
      },
      isDestroyed: false,
    }

    expect(getDragHandleTargetPosFromElement(editor as never, paragraph)).toBe(18)
  })

  it('targets the top-level block by pointer y so gutter movement does not hit inner list items or widget controls', () => {
    const editorRoot = document.createElement('div')
    const paragraph = document.createElement('p')
    const list = document.createElement('ol')
    const item = document.createElement('li')
    const widget = document.createElement('div')
    widget.setAttribute('data-node-view-wrapper', '')
    const widgetButton = document.createElement('button')
    widget.appendChild(widgetButton)
    list.appendChild(item)
    editorRoot.append(paragraph, list, widget)

    vi.spyOn(editorRoot, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 10,
      right: 700,
      bottom: 340,
      width: 600,
      height: 330,
      x: 100,
      y: 10,
      toJSON: () => ({}),
    } as DOMRect)
    vi.spyOn(paragraph, 'getBoundingClientRect').mockReturnValue({
      left: 160,
      top: 30,
      right: 700,
      bottom: 60,
      width: 540,
      height: 30,
      x: 160,
      y: 30,
      toJSON: () => ({}),
    } as DOMRect)
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({
      left: 160,
      top: 96,
      right: 700,
      bottom: 180,
      width: 540,
      height: 84,
      x: 160,
      y: 96,
      toJSON: () => ({}),
    } as DOMRect)
    vi.spyOn(widget, 'getBoundingClientRect').mockReturnValue({
      left: 160,
      top: 220,
      right: 700,
      bottom: 310,
      width: 540,
      height: 90,
      x: 160,
      y: 220,
      toJSON: () => ({}),
    } as DOMRect)

    const posAtDOM = vi.fn((node: Node) => {
      if (node === paragraph) return 3
      if (node === list) return 14
      if (node === widget) return 29
      return 99
    })
    const editor = {
      view: {
        dom: editorRoot,
        nodeDOM: vi.fn(),
        posAtDOM,
      },
      isDestroyed: false,
    }

    expect(getDragHandleTargetPosFromPoint(editor as never, { x: 92, y: 120 })).toBe(14)
    expect(getDragHandleTargetPosFromPoint(editor as never, { x: 92, y: 245 })).toBe(29)
    expect(posAtDOM).toHaveBeenCalledWith(list, 0)
    expect(posAtDOM).toHaveBeenCalledWith(widget, 0)
  })

  it('ignores elements that are not inside the editor root', () => {
    const editorRoot = document.createElement('div')
    const outside = document.createElement('p')
    const posAtDOM = vi.fn(() => 9)
    const editor = {
      view: {
        dom: editorRoot,
        nodeDOM: vi.fn(),
        posAtDOM,
      },
      isDestroyed: false,
    }

    expect(getDragHandleTargetPosFromElement(editor as never, outside)).toBe(null)
    expect(posAtDOM).not.toHaveBeenCalled()
  })

  it('ignores the editor root itself so blank gutters do not select the whole document', () => {
    const editorRoot = document.createElement('div')
    const posAtDOM = vi.fn(() => 0)
    const editor = {
      view: {
        dom: editorRoot,
        nodeDOM: vi.fn(),
        posAtDOM,
      },
      isDestroyed: false,
    }

    expect(getDragHandleTargetPosFromElement(editor as never, editorRoot)).toBe(null)
    expect(posAtDOM).not.toHaveBeenCalled()
  })

  it('does not anchor plugin node handles to internal controls with titles', () => {
    const nodeViewWrapper = document.createElement('div')
    nodeViewWrapper.setAttribute('data-node-view-wrapper', '')
    nodeViewWrapper.style.paddingLeft = '40px'
    const internalButton = document.createElement('button')
    internalButton.setAttribute('contenteditable', 'false')
    internalButton.setAttribute('title', 'settings')
    nodeViewWrapper.appendChild(internalButton)

    vi.spyOn(nodeViewWrapper, 'getBoundingClientRect').mockReturnValue({
      left: 90,
      top: 30,
      right: 490,
      bottom: 130,
      width: 400,
      height: 100,
      x: 90,
      y: 30,
      toJSON: () => ({}),
    } as DOMRect)

    vi.spyOn(internalButton, 'getBoundingClientRect').mockReturnValue({
      left: 420,
      top: 42,
      right: 452,
      bottom: 74,
      width: 32,
      height: 32,
      x: 420,
      y: 42,
      toJSON: () => ({}),
    } as DOMRect)

    const editor = {
      view: {
        dom: document.createElement('div'),
        nodeDOM: vi.fn(() => internalButton),
      },
      isDestroyed: false,
    }

    const rect = getDragHandleReferenceRect(editor as never, 12)

    expect(rect?.left).toBe(90)
    expect(rect?.top).toBe(30)
    expect(rect?.right).toBe(490)
  })

  it('anchors heading drag handles to the outer heading wrapper so they stay separate from fold toggles', () => {
    const headingWrapper = document.createElement('div')
    headingWrapper.setAttribute('data-node-view-wrapper', '')
    headingWrapper.setAttribute('data-qz-heading-wrapper', 'true')
    headingWrapper.style.paddingLeft = '40px'
    const foldToggle = document.createElement('button')
    foldToggle.setAttribute('data-fold-toggle', 'true')
    foldToggle.setAttribute('contenteditable', 'false')
    foldToggle.setAttribute('title', 'collapse')
    headingWrapper.appendChild(foldToggle)

    vi.spyOn(headingWrapper, 'getBoundingClientRect').mockReturnValue({
      left: 72,
      top: 64,
      right: 572,
      bottom: 112,
      width: 500,
      height: 48,
      x: 72,
      y: 64,
      toJSON: () => ({}),
    } as DOMRect)

    vi.spyOn(foldToggle, 'getBoundingClientRect').mockReturnValue({
      left: 82,
      top: 70,
      right: 106,
      bottom: 94,
      width: 24,
      height: 24,
      x: 82,
      y: 70,
      toJSON: () => ({}),
    } as DOMRect)

    const editor = {
      view: {
        dom: document.createElement('div'),
        nodeDOM: vi.fn(() => headingWrapper),
      },
      isDestroyed: false,
    }

    const rect = getDragHandleReferenceRect(editor as never, 15)

    expect(rect?.left).toBe(72)
    expect(rect?.top).toBe(64)
    expect(rect?.right).toBe(572)
  })

  it('places the QingZhi block handle at the block left-top in a lane separate from heading fold controls', () => {
    const referenceRect = new DOMRect(160, 80, 480, 42)

    const handleRect = getQingZhiBlockHandleRect(referenceRect)

    expect(handleRect).toEqual({
      left: 96,
      top: 80,
      right: 128,
      bottom: 112,
      width: QINGZHI_BLOCK_HANDLE_WIDTH,
      height: QINGZHI_BLOCK_HANDLE_WIDTH,
    })

    // The fold toggle lives closer to the heading text, so the grip never overlaps it.
    const foldRightEdge = referenceRect.left - 18
    expect(handleRect!.right).toBeLessThan(foldRightEdge)
  })

  it('uses the top of tall rich blocks instead of vertically centering the handle', () => {
    const referenceRect = new DOMRect(180, 240, 620, 220)

    const handleRect = getQingZhiBlockHandleRect(referenceRect)

    expect(handleRect?.top).toBe(240)
    expect(handleRect?.bottom).toBe(272)
  })

  it('does not create a QingZhi block handle rect without a block reference', () => {
    expect(getQingZhiBlockHandleRect(null)).toBe(null)
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

  it('prefers the QingZhi floating drag handle shell over the inner grip icon', () => {
    const floating = document.createElement('div')
    floating.className = 'qz-block-drag-handle-floating'
    const hitbox = document.createElement('div')
    hitbox.className = 'qz-drag-handle-hitbox'
    const grip = document.createElement('div')
    grip.className = 'drag-handle'
    hitbox.appendChild(grip)
    floating.appendChild(hitbox)

    expect(getDragHandleElement(grip)).toBe(floating)
    expect(getDragHandleElement(hitbox)).toBe(floating)
  })

  it('uses fixed positioning for the drag handle config to avoid scroll-container drift', () => {
    expect(dragHandleComputePositionConfig).toEqual(
      expect.objectContaining({
        strategy: 'fixed',
      }),
    )
  })

  it('keeps the last block position while the pointer is crossing the handle bridge', () => {
    expect(
      shouldKeepDragHandlePositionOnNodeLoss({
        nextPos: -1,
        bridgeLocked: true,
        menuOpen: false,
      }),
    ).toBe(true)

    expect(
      shouldKeepDragHandlePositionOnNodeLoss({
        nextPos: -1,
        bridgeLocked: false,
        menuOpen: true,
      }),
    ).toBe(true)

    expect(
      shouldKeepDragHandlePositionOnNodeLoss({
        nextPos: -1,
        bridgeLocked: false,
        menuOpen: false,
      }),
    ).toBe(false)
  })

  it('can make a hidden floating handle interactive while crossing the QingZhi gutter bridge', () => {
    const floating = document.createElement('div')
    floating.style.visibility = 'hidden'
    floating.style.pointerEvents = 'none'

    makeDragHandleElementInteractive(floating)

    expect(floating.style.visibility).toBe('')
    expect(floating.style.pointerEvents).toBe('auto')
  })
})
