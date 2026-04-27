import { describe, expect, it } from 'vitest'

import { extractLeadingNoteTitle } from '../lib/noteTitle'

const block = (name: string, textContent: string, isTextblock = true) => ({
  isTextblock,
  type: { name },
  textContent,
})

describe('note title extraction', () => {
  it('uses the first document block as the note title source', () => {
    expect(extractLeadingNoteTitle({ firstChild: block('heading', ' 标题 ') })).toBe('标题')
    expect(extractLeadingNoteTitle({ firstChild: block('paragraph', '第一行') })).toBe('第一行')
  })

  it('does not scan later body paragraphs when the leading block is empty', () => {
    expect(extractLeadingNoteTitle({ firstChild: block('paragraph', '') })).toBeNull()
  })

  it('ignores non-title block types at the top of the document', () => {
    expect(extractLeadingNoteTitle({ firstChild: block('image', '图片标题', false) })).toBeNull()
    expect(extractLeadingNoteTitle({ firstChild: block('codeBlock', 'const title = body') })).toBeNull()
  })
})
