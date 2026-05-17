/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { WashiTape, JournalStamp } from '../../lib/tiptapExtensions'

const editors: Editor[] = []

function createEditor(options: ConstructorParameters<typeof Editor>[0]) {
  const editor = new Editor(options)
  editors.push(editor)
  return editor
}

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy()
  }
})

describe('Journal Extensions', () => {
  describe('WashiTape', () => {
    it('should be correctly parsed from HTML', () => {
      const editor = createEditor({
        extensions: [StarterKit, WashiTape],
        content: '<div data-type="washi-tape" data-pattern="polka-dots" data-color="#ff0000"></div>',
      })
      const { type, attrs } = editor.state.doc.firstChild!
      expect(type.name).toBe('washiTape')
      expect(attrs.pattern).toBe('polka-dots')
      expect(attrs.color).toBe('#ff0000')
    })

    it('should render correct HTML attributes', () => {
      const editor = createEditor({
        extensions: [StarterKit, WashiTape],
      })
      editor.commands.insertContent({
        type: 'washiTape',
        attrs: { pattern: 'grid', color: '#00ff00' },
      })
      expect(editor.getHTML()).toContain('data-type="washi-tape"')
      expect(editor.getHTML()).toContain('data-pattern="grid"')
      expect(editor.getHTML()).toContain('data-color="#00ff00"')
    })
  })


  describe('JournalStamp', () => {
    it('should be correctly parsed from HTML', () => {
      const editor = createEditor({
        extensions: [StarterKit, JournalStamp],
        content: '<span data-type="journal-stamp" data-stamp-type="mood" data-value="happy"></span>',
      })
      const node = editor.state.doc.firstChild!.firstChild! // inline node in paragraph
      expect(node.type.name).toBe('journalStamp')
      expect(node.attrs.stampType).toBe('mood')
      expect(node.attrs.value).toBe('happy')
    })
  })
})
