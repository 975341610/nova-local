/**
 * @vitest-environment jsdom
 */
import { generateHTML, generateJSON } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { FileNode } from '../lib/tiptapExtensions'

const extensions = [StarterKit, FileNode]

describe('FileNode serialization', () => {
  it('preserves attachment attributes through HTML snapshots and restores', () => {
    const html = [
      '<p>before</p>',
      '<div data-type="file-card" class="notion-file-block"',
      ' src="/api/media/static/files/demo.pdf"',
      ' name="demo.pdf"',
      ' size="69427"',
      ' type="application/pdf"',
      ' data-upload-id="upload-1"></div>',
      '<p>after</p>',
    ].join('')

    const json = generateJSON(html, extensions)
    const fileNode = json.content?.find((item: any) => item.type === 'fileNode') as any

    expect(fileNode?.attrs).toMatchObject({
      src: '/api/media/static/files/demo.pdf',
      name: 'demo.pdf',
      size: 69427,
      type: 'application/pdf',
      'data-upload-id': 'upload-1',
    })

    const restoredHtml = generateHTML(json, extensions)
    expect(restoredHtml).toContain('data-type="file-card"')
    expect(restoredHtml).toContain('src="/api/media/static/files/demo.pdf"')
    expect(restoredHtml).toContain('name="demo.pdf"')
    expect(restoredHtml).toContain('size="69427"')
    expect(restoredHtml).toContain('type="application/pdf"')
    expect(restoredHtml).toContain('data-upload-id="upload-1"')
  })
})
