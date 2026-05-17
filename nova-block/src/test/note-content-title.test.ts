import { describe, expect, it } from 'vitest'

import { stripLeadingDuplicateTitleBlockFromHtml } from '../lib/noteContentTitle'

describe('note content title separation', () => {
  it('removes only a leading h1 that exactly duplicates the separate note title', () => {
    expect(stripLeadingDuplicateTitleBlockFromHtml('<h1>导论</h1><p>正文</p>', '导论')).toBe('<p>正文</p>')
  })

  it('keeps a leading paragraph even when it matches the title because it is body content', () => {
    expect(stripLeadingDuplicateTitleBlockFromHtml('<p>导论</p><p>正文</p>', '导论')).toBe('<p>导论</p><p>正文</p>')
  })

  it('keeps headings that do not match the separate note title', () => {
    expect(stripLeadingDuplicateTitleBlockFromHtml('<h1>章节标题</h1><p>正文</p>', '全文标题')).toBe('<h1>章节标题</h1><p>正文</p>')
  })

  it('leaves an empty paragraph when the old document only contained the duplicated h1', () => {
    expect(stripLeadingDuplicateTitleBlockFromHtml('<h1>空笔记</h1>', '空笔记')).toBe('<p></p>')
  })
})
