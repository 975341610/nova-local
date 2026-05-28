/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'

import type { Note } from '../../lib/types'
import {
  buildBlockLinkHref,
  extractBlockLinkTargets,
  parseBlockLinkHref,
} from '../../lib/novablock/blockLinks'
import { BlockId } from '../../lib/novablock/extensions/BlockId'
import { BlockLink } from '../../lib/novablock/extensions/BlockLink'

const makeNote = (patch: Partial<Note>): Note => ({
  id: 1,
  title: '测试笔记',
  icon: '📝',
  content: '<p></p>',
  file_path: '',
  type: 'note',
  summary: '',
  is_title_manually_edited: false,
  tags: [],
  properties: [],
  sticky_notes: [],
  stickers: [],
  links: [],
  notebook_id: 1,
  parent_id: null,
  position: 0,
  sort_key: 'm',
  is_folder: false,
  created_at: '2026-05-28T00:00:00.000Z',
  ...patch,
})

describe('block link helpers', () => {
  it('extracts top-level target blocks from note html with stable block ids', () => {
    const targets = extractBlockLinkTargets([
      makeNote({
        id: 7,
        title: '来源笔记',
        content: [
          '<h2 data-block-id="blk-heading">核心结论</h2>',
          '<p data-block-id="blk-p">这里是可以跳转到的正文段落。</p>',
          '<ul data-block-id="blk-list"><li><p>第一条</p></li><li><p>第二条</p></li></ul>',
          '<p>没有 block id 的段落不会成为跨笔记锚点。</p>',
        ].join(''),
      }),
      makeNote({ id: 9, title: '文件夹', is_folder: true }),
    ])

    expect(targets).toEqual([
      expect.objectContaining({
        noteId: 7,
        noteTitle: '来源笔记',
        blockId: 'blk-heading',
        label: '核心结论',
        type: 'heading',
      }),
      expect.objectContaining({
        noteId: 7,
        blockId: 'blk-p',
        preview: '这里是可以跳转到的正文段落。',
      }),
      expect.objectContaining({
        noteId: 7,
        blockId: 'blk-list',
        label: '第一条 第二条',
      }),
    ])
  })

  it('round-trips nova block link hrefs without using normal web urls', () => {
    const href = buildBlockLinkHref({ noteId: 12, blockId: 'blk-abcd', label: '目标块' })

    expect(href).toBe('nova://block?note=12&block=blk-abcd&label=%E7%9B%AE%E6%A0%87%E5%9D%97')
    expect(parseBlockLinkHref(href)).toEqual({
      noteId: 12,
      blockId: 'blk-abcd',
      label: '目标块',
    })
    expect(parseBlockLinkHref('https://example.com')).toBeNull()
  })
})

describe('BlockId extension', () => {
  it('adds stable data-block-id attributes to top-level block nodes only', () => {
    const editor = new Editor({
      extensions: [StarterKit, BlockId],
      content: '<p>Alpha</p><h2>Beta</h2><ul><li><p>One</p></li></ul>',
    })

    editor.commands.ensureBlockIds()
    const html = editor.getHTML()

    expect(html).toContain('<p data-block-id="blk-')
    expect(html).toContain('<h2 data-block-id="blk-')
    expect(html).toContain('<ul data-block-id="blk-')
    expect(html).not.toContain('<li data-block-id=')
  })
})

describe('BlockLink extension', () => {
  it('turns selected text into a block jump link mark', () => {
    const editor = new Editor({
      extensions: [StarterKit, BlockLink],
      content: '<p>跳到目标块</p>',
    })

    editor.commands.setTextSelection({ from: 1, to: 5 })
    editor.commands.setBlockLink({ noteId: 3, blockId: 'blk-target', label: '目标块' })

    const html = editor.getHTML()
    expect(html).toContain('data-type="block-link"')
    expect(html).toContain('data-note-id="3"')
    expect(html).toContain('data-block-id="blk-target"')
    expect(html).toContain('href="nova://block?note=3&amp;block=blk-target')
  })

  it('intercepts block jump clicks before the normal link handler can open nova protocol externally', () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        BlockLink,
        Link.configure({ openOnClick: true, autolink: true }),
      ],
      content: '<p><a data-type="block-link" data-note-id="3" data-block-id="blk-target" href="nova://block?note=3&amp;block=blk-target">跳到目标</a></p>',
    })
    document.body.appendChild(editor.view.dom)
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const selectSpy = vi.fn()
    window.addEventListener('nova-select-note', selectSpy)

    const link = editor.view.dom.querySelector('a[data-type="block-link"]') as HTMLAnchorElement
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))

    expect(openSpy).not.toHaveBeenCalled()
    expect(selectSpy).toHaveBeenCalledTimes(1)

    window.removeEventListener('nova-select-note', selectSpy)
    openSpy.mockRestore()
    editor.destroy()
  })
})
