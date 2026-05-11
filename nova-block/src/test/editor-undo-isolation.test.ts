/**
 * @vitest-environment jsdom
 */
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { replaceEditorContentWithoutHistory } from '../lib/editorContentReplace'

describe('editor note switching undo isolation', () => {
  it('does not allow Ctrl+Z after switching notes to restore the previous note content', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: '<p>A note</p>',
    })

    editor.commands.insertContent(' edited')
    expect(editor.getHTML()).toContain('A note')
    expect(editor.getHTML()).toContain('edited')

    replaceEditorContentWithoutHistory(editor, '<p>B note</p>')
    expect(editor.getHTML()).toBe('<p>B note</p>')

    editor.commands.undo()

    expect(editor.getHTML()).toBe('<p>B note</p>')
    expect(editor.getHTML()).not.toContain('A note')

    editor.destroy()
  })
})
