/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {
  AIStreamingPreviewNode,
  findAIStreamingPreview,
  insertAIStreamingPreview,
  replaceAIStreamingPreviewWithContent,
  updateAIStreamingPreview,
} from '../lib/aiStreamingPreview'
import { aiMarkdownToHtml } from '../lib/aiMarkdown'

describe('AI streaming preview node', () => {
  it('streams markdown text into a temporary preview and replaces it with structured content', () => {
    const editor = new Editor({ extensions: [StarterKit, AIStreamingPreviewNode] })

    insertAIStreamingPreview(editor)
    updateAIStreamingPreview(editor, '## 修复摘要')
    updateAIStreamingPreview(editor, '## 修复摘要\n\n- **流式输出**')

    const preview = findAIStreamingPreview(editor)
    expect(preview?.node.attrs.text).toBe('## 修复摘要\n\n- **流式输出**')
    expect(JSON.stringify(editor.state.doc.toJSON())).toContain('aiStreamingPreview')

    replaceAIStreamingPreviewWithContent(editor, aiMarkdownToHtml(preview?.node.attrs.text ?? ''))
    const doc = editor.state.doc.toJSON()

    expect(JSON.stringify(doc)).not.toContain('aiStreamingPreview')
    expect(doc.content?.[0]?.type).toBe('heading')
    expect(doc.content?.some((node: any) => node.type === 'bulletList')).toBe(true)
    expect(JSON.stringify(doc)).toContain('bold')
  })
})
