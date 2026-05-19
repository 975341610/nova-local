/**
 * @vitest-environment jsdom
 *
 * F4-T1 · 取消媒体"拍立得相框"边框
 *
 * 媒体节点(image/video)外层容器原本带白底/内边距/阴影/border 的"拍立得"风格,
 * 现要求改为无相框样式,但**保留**圆角(rounded-xl)和悬停上移动效(hover:-translate-y-0.5)。
 * 音频节点不受影响(原本就走 "relative" 分支)。
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Editor, EditorContent } from '@tiptap/react'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { MediaNodeView } from '../components/MediaNodeView'

// 我们直接 mount MediaNodeView 来检查渲染产物的 className,
// 不需要把它整套接入 Tiptap.
import { createElement } from 'react'

function makeProps(kind: 'image' | 'video' | 'audio') {
  return {
    node: { attrs: { src: 'https://example.com/x.png', width: '100%' }, type: { name: kind } },
    updateAttributes: () => {},
    deleteNode: () => {},
    selected: false,
    kind,
    // 以下为 NodeViewProps 兼容字段(未在被测代码中使用)
    editor: null,
    decorations: [],
    extension: { name: kind },
    getPos: () => 0,
    HTMLAttributes: {},
    innerDecorations: [],
    view: null,
  } as never
}

function getOuterContainer(rootEl: HTMLElement): HTMLElement {
  // NodeViewWrapper 渲染为带 group/media 的最外层 div;
  // 我们关心的是它的**直接子 div**(Outer Polaroid Container)
  const wrapper = rootEl.querySelector('[data-media-wrapper]') as HTMLElement | null
  expect(wrapper).not.toBeNull()
  const outer = wrapper!.querySelector(':scope > div') as HTMLElement | null
  expect(outer).not.toBeNull()
  return outer!
}

describe('MediaNodeView · 无相框样式', () => {
  it('image 容器不再含 polaroid 风格的类(bg-white/shadow-sm/p-2/border)', () => {
    const { container } = render(createElement(MediaNodeView, makeProps('image')))
    const outer = getOuterContainer(container)
    const cls = outer.className
    expect(cls).not.toMatch(/\bbg-white\b/)
    expect(cls).not.toMatch(/\bshadow-sm\b/)
    expect(cls).not.toMatch(/\bp-2\b/)
    expect(cls).not.toMatch(/\bpb-8\b/)
    expect(cls).not.toMatch(/\bborder-stone-200\b/)
  })

  it('image 容器仍保留圆角 rounded-xl 与悬停上移 hover:-translate-y-0.5', () => {
    const { container } = render(createElement(MediaNodeView, makeProps('image')))
    const outer = getOuterContainer(container)
    const cls = outer.className
    expect(cls).toMatch(/\brounded-xl\b/)
    expect(cls).toMatch(/hover:-translate-y-0\.5/)
  })

  it('video 容器同样无相框、有圆角与悬停上移', () => {
    const { container } = render(createElement(MediaNodeView, makeProps('video')))
    const outer = getOuterContainer(container)
    const cls = outer.className
    expect(cls).not.toMatch(/\bbg-white\b/)
    expect(cls).not.toMatch(/\bshadow-sm\b/)
    expect(cls).toMatch(/\brounded-xl\b/)
    expect(cls).toMatch(/hover:-translate-y-0\.5/)
  })
})
