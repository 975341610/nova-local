// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { prepareEditorContent } from '../../lib/novablock/editorContentPreparation'

describe('editor content preparation', () => {
  it('falls back to an empty paragraph when note content is missing', () => {
    expect(prepareEditorContent(null, 'Untitled')).toBe('<p></p>')
    expect(prepareEditorContent(undefined, 'Untitled')).toBe('<p></p>')
  })

  it('removes a duplicated leading title block before loading content into the editor', () => {
    expect(prepareEditorContent('<h1>测试笔记</h1><p>正文</p>', '测试笔记')).toBe('<p>正文</p>')
  })

  it('normalizes legacy local API media URLs before the editor receives the content', () => {
    const prepared = prepareEditorContent(
      '<p><img src="/api/media/static/files/a.png"></p>',
      'Media',
    )

    expect(prepared).toContain('http://127.0.0.1:8765/api/media/static/files/a.png')
    expect(prepared).not.toContain('src="/api/media/static/files/a.png"')
  })
})
