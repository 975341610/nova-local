/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSuggestionConfig } from '../../components/notion/SlashMenuConfig'

const { mockTippy, mockPopupInstance, MockReactRenderer } = vi.hoisted(() => {
  const popupInstance = {
    state: {
      isDestroyed: false,
    },
    setProps: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(function () {
      popupInstance.state.isDestroyed = true
    }),
  }

  class ReactRendererMock {
    element = document.createElement('div')
    updateProps = vi.fn()
    destroy = vi.fn()
    ref = {
      onKeyDown: vi.fn(() => false),
    }
  }

  const tippy = vi.fn(() => [popupInstance])

  return {
    mockTippy: tippy,
    mockPopupInstance: popupInstance,
    MockReactRenderer: ReactRendererMock,
  }
})

vi.mock('@tiptap/react', () => ({
  ReactRenderer: MockReactRenderer,
}))

vi.mock('tippy.js', () => ({
  default: mockTippy,
  sticky: {},
}))

describe('getSuggestionConfig', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    mockTippy.mockClear()
    mockPopupInstance.state.isDestroyed = false
    mockPopupInstance.setProps.mockClear()
    mockPopupInstance.hide.mockClear()
    mockPopupInstance.destroy.mockClear()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('creates the popup on update when clientRect becomes available after start', () => {
    const config = getSuggestionConfig({ current: [] }, true)
    const renderer = config.render()
    const clientRect = () => new DOMRect(10, 20, 30, 40)

    renderer.onStart({
      editor: {},
      items: [],
      command: vi.fn(),
      query: '',
      clientRect: null,
    })

    expect(mockTippy).not.toHaveBeenCalled()

    expect(() =>
      renderer.onUpdate({
        editor: {},
        items: [],
        command: vi.fn(),
        query: '',
        clientRect,
      }),
    ).not.toThrow()

    expect(mockTippy).toHaveBeenCalledTimes(1)
    expect(mockTippy).toHaveBeenCalledWith(
      'body',
      expect.objectContaining({
        getReferenceClientRect: clientRect,
      }),
    )
  })

  it('handles Escape safely even when no popup instance was created', () => {
    const config = getSuggestionConfig({ current: [] }, true)
    const renderer = config.render()

    renderer.onStart({
      editor: {},
      items: [],
      command: vi.fn(),
      query: '',
      clientRect: null,
    })

    expect(() =>
      renderer.onKeyDown({
        event: new KeyboardEvent('keydown', { key: 'Escape' }),
      }),
    ).not.toThrow()
  })

  it('removes the popup only once when exit runs repeatedly', () => {
    const config = getSuggestionConfig({ current: [] }, true)
    const renderer = config.render()
    const clientRect = () => new DOMRect(10, 20, 30, 40)

    renderer.onStart({
      editor: {},
      items: [],
      command: vi.fn(),
      query: '',
      clientRect,
    })

    renderer.onExit()
    renderer.onExit()
    vi.runAllTimers()

    expect(mockPopupInstance.destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps the popup mounted when a slash decoration is still active on the next frame', () => {
    const config = getSuggestionConfig({ current: [] }, true)
    const renderer = config.render()
    const clientRect = () => new DOMRect(10, 20, 30, 40)
    const decoration = document.createElement('span')
    decoration.className = 'suggestion'
    decoration.textContent = '/a'
    document.body.appendChild(decoration)

    renderer.onStart({
      editor: {},
      items: [],
      command: vi.fn(),
      query: 'a',
      clientRect,
    })

    renderer.onExit()
    vi.runAllTimers()

    expect(mockPopupInstance.destroy).not.toHaveBeenCalled()
  })
})
