/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { aiMarkdownToHtml, aiMarkdownToHtmlWithFootnotes, shouldRenderAIMarkdown } from '../lib/aiMarkdown'
import { renderReaderHtml } from '../lib/readerContent'
import { Blockquote } from '../lib/tiptapExtensions'

describe('AI Markdown rendering', () => {
  it('detects common Markdown returned by inline AI', () => {
    expect(shouldRenderAIMarkdown('1. **Bug修复**\n- BubbleMenu 文字颜色\n- Margin Notes 点击无效')).toBe(true)
    expect(shouldRenderAIMarkdown('普通的一句话')).toBe(false)
  })

  it('converts AI Markdown into structured Tiptap content', () => {
    const editor = new Editor({ extensions: [StarterKit] })
    const html = aiMarkdownToHtml('## 修复摘要\n\n1. **Bug修复**\n2. `AI` 输出\n\n- BubbleMenu 文字颜色\n- Margin Notes 点击无效')

    editor.commands.setContent(html)
    const doc = editor.state.doc.toJSON()

    expect(doc.content?.[0]?.type).toBe('heading')
    expect(doc.content?.some((node: any) => node.type === 'orderedList')).toBe(true)
    expect(doc.content?.some((node: any) => node.type === 'bulletList')).toBe(true)
    expect(JSON.stringify(doc)).toContain('bold')
    expect(JSON.stringify(doc)).toContain('code')
  })

  it('converts AI citation markers into Nova footnote nodes', () => {
    const html = aiMarkdownToHtmlWithFootnotes('1. 问题答案在哪里？ [1]', [
      { title: '来源笔记', excerpt: '&lt;h1&gt;答案&lt;/h1&gt;<mark data-color="#fff59d">在这里</mark> **重点**' },
    ])

    expect(html).toContain('data-type="footnote"')
    expect(html).toContain('data-index="1"')
    expect(html).not.toContain('来源笔记')
    expect(html).toContain('答案 在这里 重点')
    expect(html).not.toContain('&lt;h1')
    expect(html).not.toContain('<mark')
    expect(html).not.toContain('[1]')
  })

  it('reader renders markdown-like AI text wrapped in an HTML paragraph', () => {
    const html = renderReaderHtml('<p>**Bug修复**\n- BubbleMenu 文字颜色\n- Margin Notes 点击无效</p>')

    expect(html).toContain('<strong>Bug修复</strong>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li><p>BubbleMenu 文字颜色</p></li>')
  })

  it('reader preserves AI source video card attributes', () => {
    const html = renderReaderHtml('<figure data-ai-source-card="video"><iframe src="https://player.bilibili.com/player.html?bvid=BV1xx411c7mD" data-embed="true"></iframe><figcaption>B站视频</figcaption></figure>')

    expect(html).toContain('data-ai-source-card="video"')
    expect(html).toContain('<iframe')
    expect(html).toContain('data-embed="true"')
    expect(html).toContain('B站视频')
  })

  it('editor preserves AI source link card attributes', () => {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ blockquote: false }),
        Blockquote,
      ],
      content: '<blockquote data-ai-source-card="link"><p><strong>来源</strong><br><a href="https://example.com">https://example.com</a></p></blockquote>',
    })

    const html = editor.getHTML()

    expect(html).toContain('data-ai-source-card="link"')
    expect(html).toContain('https://example.com')
  })
})
