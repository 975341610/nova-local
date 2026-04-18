import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Footnote } from '../../lib/tiptapExtensions'

describe('Footnote Extension', () => {
  const editor = new Editor({
    extensions: [StarterKit, Footnote],
  })

  it('should automatically assign index to footnotes based on their position', () => {
    editor.commands.setContent('<p>First footnote <span data-type="footnote" data-content="A"></span> and second <span data-type="footnote" data-content="B"></span></p>')
    
    const doc = editor.state.doc
    const footnotes: any[] = []
    doc.descendants((node) => {
      if (node.type.name === 'footnote') {
        footnotes.push(node)
      }
    })

    expect(footnotes.length).toBe(2)
    expect(footnotes[0].attrs.index).toBe(1)
    expect(footnotes[1].attrs.index).toBe(2)
  })

  it('should re-index when a new footnote is inserted in the middle', () => {
    editor.commands.setContent('<p>Footnote 1 <span data-type="footnote" data-content="A"></span> and Footnote 3 <span data-type="footnote" data-content="C"></span></p>')
    
    // Insert Footnote 2 in the middle
    editor.commands.insertContentAt(15, {
      type: 'footnote',
      attrs: { content: 'B' }
    })

    const footnotes: any[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'footnote') {
        footnotes.push(node)
      }
    })

    expect(footnotes.length).toBe(3)
    expect(footnotes[0].attrs.index).toBe(1)
    expect(footnotes[1].attrs.index).toBe(2)
    expect(footnotes[2].attrs.index).toBe(3)
  })

  it('should re-index when a footnote is deleted', () => {
    editor.commands.setContent('<p><span data-type="footnote" data-content="A"></span> <span data-type="footnote" data-content="B"></span> <span data-type="footnote" data-content="C"></span></p>')
    
    // Delete the second footnote
    // The second footnote is at position 2 (after p start and first footnote)
    // First footnote: pos 1, size 1. Second footnote starts at pos 3.
    editor.commands.deleteRange({ from: 3, to: 4 })

    const footnotes: any[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'footnote') {
        footnotes.push(node)
      }
    })

    expect(footnotes.length).toBe(2)
    expect(footnotes[0].attrs.index).toBe(1)
    expect(footnotes[1].attrs.index).toBe(2)
    expect(footnotes[1].attrs.content).toBe('C')
  })
})
