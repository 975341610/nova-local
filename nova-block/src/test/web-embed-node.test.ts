/**
 * @vitest-environment jsdom
 */
import { Editor, generateHTML, generateJSON } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { EmbedNode, WebEmbedNode } from '../lib/tiptapExtensions'
import {
  isIframeBlockedWebEmbedUrl,
  isVideoEmbedUrl,
  isWebPageEmbedUrl,
  normalizeWebEmbedUrl,
} from '../lib/webEmbed'

const extensions = [StarterKit, EmbedNode, WebEmbedNode]

describe('WebEmbedNode', () => {
  it('preserves URL card attributes through HTML snapshots and restores', () => {
    const html = [
      '<p>before</p>',
      '<div data-type="web-embed-card"',
      ' data-url="https://example.com/article"',
      ' data-title="Example Article"',
      ' data-view-mode="preview"></div>',
      '<p>after</p>',
    ].join('')

    const json = generateJSON(html, extensions)
    const webNode = json.content?.find((item: any) => item.type === 'webEmbedNode') as any

    expect(webNode?.attrs).toMatchObject({
      url: 'https://example.com/article',
      title: 'Example Article',
      viewMode: 'preview',
    })

    const restoredHtml = generateHTML(json, extensions)
    expect(restoredHtml).toContain('data-type="web-embed-card"')
    expect(restoredHtml).toContain('data-url="https://example.com/article"')
    expect(restoredHtml).toContain('data-title="Example Article"')
    expect(restoredHtml).toContain('data-view-mode="preview"')
  })

  it('handles pasted normal web URLs without stealing video or block-link URLs', () => {
    expect(isWebPageEmbedUrl('https://example.com/article')).toBe(true)
    expect(normalizeWebEmbedUrl('example.com/article')).toBe('https://example.com/article')

    expect(isVideoEmbedUrl('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(true)
    expect(isWebPageEmbedUrl('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(false)
    expect(isWebPageEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(false)
    expect(isWebPageEmbedUrl('nova://block?note=1&block=abc')).toBe(false)
    expect(isWebPageEmbedUrl('#nova-block?note=1&block=abc')).toBe(false)
  })

  it('turns unsupported video-site links into web cards without stealing native video embeds', () => {
    expect(isVideoEmbedUrl('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(true)
    expect(isWebPageEmbedUrl('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(false)

    expect(isVideoEmbedUrl('https://v.douyin.com/iAbCdEf/')).toBe(false)
    expect(isWebPageEmbedUrl('https://v.douyin.com/iAbCdEf/')).toBe(true)
    expect(isVideoEmbedUrl('https://b23.tv/abcdef')).toBe(false)
    expect(isWebPageEmbedUrl('https://b23.tv/abcdef')).toBe(true)
  })

  it('detects websites that block embedded iframe previews', () => {
    expect(isIframeBlockedWebEmbedUrl('https://chatgpt.com/share/abc')).toBe(true)
    expect(isIframeBlockedWebEmbedUrl('https://chat.openai.com/c/abc')).toBe(true)
    expect(isIframeBlockedWebEmbedUrl('https://github.com/975341610/nova-local')).toBe(true)
    expect(isIframeBlockedWebEmbedUrl('https://v.douyin.com/iAbCdEf/')).toBe(true)
    expect(isIframeBlockedWebEmbedUrl('https://www.douyin.com/video/123')).toBe(true)
    expect(isIframeBlockedWebEmbedUrl('https://example.com/post')).toBe(false)
  })

  it('turns an exact pasted page URL into a web card node', () => {
    const editor = new Editor({
      extensions,
      content: '<p>hello</p>',
    })

    const clipboardData = {
      getData: (type: string) => (type === 'text/plain' ? 'https://example.com/post' : ''),
    } as DataTransfer
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', { value: clipboardData })

    editor.view.dom.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(editor.getHTML()).toContain('data-type="web-embed-card"')
    expect(editor.getHTML()).toContain('data-url="https://example.com/post"')
  })

  it('turns unsupported video-site pasted URLs into web cards', () => {
    const editor = new Editor({
      extensions,
      content: '<p>hello</p>',
    })

    const clipboardData = {
      getData: (type: string) => (type === 'text/plain' ? 'https://v.douyin.com/iAbCdEf/' : ''),
    } as DataTransfer
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', { value: clipboardData })

    editor.view.dom.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(editor.getHTML()).toContain('data-type="web-embed-card"')
    expect(editor.getHTML()).toContain('data-url="https://v.douyin.com/iAbCdEf/"')
  })

  it('lets existing video paste rules keep handling video URLs', () => {
    const editor = new Editor({
      extensions,
      content: '<p>hello</p>',
    })

    const clipboardData = {
      getData: (type: string) => (type === 'text/plain' ? 'https://www.bilibili.com/video/BV1xx411c7mD' : ''),
    } as DataTransfer
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', { value: clipboardData })

    editor.view.dom.dispatchEvent(event)

    expect(editor.getHTML()).not.toContain('data-type="web-embed-card"')
    expect(editor.getHTML()).toContain('data-embed="true"')
    expect(editor.getHTML()).toContain('player.bilibili.com')
  })
})
