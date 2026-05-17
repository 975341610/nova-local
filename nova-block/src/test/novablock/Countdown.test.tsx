/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { CountdownNode } from '../../lib/novablock/extensions/CountdownNode'

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

describe('Countdown Extension', () => {
  it('should be correctly parsed from HTML', () => {
    const targetDate = '2026-12-31T23:59:59.000Z'
    const editor = createEditor({
      extensions: [StarterKit, CountdownNode],
      content: `<div data-type="countdown" data-target-date="${targetDate}" data-title="New Year"></div>`,
    })
    const { type, attrs } = editor.state.doc.firstChild!
    expect(type.name).toBe('countdown')
    expect(attrs.targetDate).toBe(targetDate)
    expect(attrs.title).toBe('New Year')
  })

  it('should render correct HTML attributes', () => {
    const targetDate = '2026-12-31T23:59:59.000Z'
    const editor = createEditor({
      extensions: [StarterKit, CountdownNode],
    })
    editor.commands.insertContent({
      type: 'countdown',
      attrs: { targetDate, title: 'Test Countdown' },
    })
    expect(editor.getHTML()).toContain('data-type="countdown"')
    expect(editor.getHTML()).toContain(`data-target-date="${targetDate}"`)
    expect(editor.getHTML()).toContain('data-title="Test Countdown"')
  })
})
