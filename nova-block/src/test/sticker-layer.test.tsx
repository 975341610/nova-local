// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StickerItem } from '../components/editor/StickerLayer'

describe('StickerItem', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('allows dragging directly from the sticker body with the left mouse button', () => {
    const onSelect = vi.fn()
    const onUpdate = vi.fn()
    const onRemove = vi.fn()

    const { container } = render(
      <StickerItem
        sticker={{
          id: 'sticker-1',
          type: 'image',
          url: 'https://example.com/sticker.png',
          x: 10,
          y: 20,
          scale: 1,
          rotation: 0,
          opacity: 1,
        }}
        isEditable
        isSelected={false}
        onSelect={onSelect}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />,
    )

    const image = container.querySelector('img')
    expect(image).toBeTruthy()

    fireEvent.mouseDown(image as HTMLImageElement, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.mouseMove(document, { clientX: 132, clientY: 145 })
    fireEvent.mouseUp(document)

    expect(onSelect).toHaveBeenCalledWith('sticker-1')
    expect(onUpdate).toHaveBeenCalledWith('sticker-1', expect.objectContaining({
      x: 42,
      y: 65,
    }))
  })
})
