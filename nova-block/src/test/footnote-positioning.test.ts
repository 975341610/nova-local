/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'

import { computeFootnotePopoverStyle } from '../components/editor/footnotePositioning'

describe('footnote popover positioning', () => {
  it('centers the popover on the footnote trigger while staying inside the viewport', () => {
    const style = computeFootnotePopoverStyle({
      triggerRect: new DOMRect(700, 620, 18, 18),
      viewportWidth: 1200,
      viewportHeight: 760,
      editing: false,
    })

    expect(style).toMatchObject({
      position: 'fixed',
      width: 360,
      left: 529,
    })
    expect(Number(style?.top)).toBeLessThan(620)
  })

  it('does not fall back to the top-left corner when the trigger rect is temporarily invalid', () => {
    const style = computeFootnotePopoverStyle({
      triggerRect: new DOMRect(0, 0, 0, 0),
      viewportWidth: 1200,
      viewportHeight: 760,
      editing: false,
    })

    expect(style?.left).toBe(420)
    expect(style?.top).toBe(290)
  })

  it('shrinks wide popovers on narrow windows instead of overflowing the edge', () => {
    const style = computeFootnotePopoverStyle({
      triggerRect: new DOMRect(160, 120, 12, 12),
      viewportWidth: 260,
      viewportHeight: 480,
      editing: true,
    })

    expect(style?.width).toBe(236)
    expect(style?.left).toBe(12)
    expect(style?.maxWidth).toBe('calc(100vw - 24px)')
  })

  it('accounts for visual viewport offsets when the editor is zoomed or panned', () => {
    const style = computeFootnotePopoverStyle({
      triggerRect: new DOMRect(680, 540, 18, 18),
      viewportWidth: 900,
      viewportHeight: 620,
      viewportOffsetLeft: 120,
      viewportOffsetTop: 80,
      editing: false,
    })

    expect(style?.left).toBeGreaterThanOrEqual(132)
    expect(style?.top).toBeGreaterThanOrEqual(92)
    expect(Number(style?.left)).toBeLessThanOrEqual(648)
    expect(Number(style?.top)).toBeLessThanOrEqual(508)
  })
})
