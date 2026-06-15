import { describe, expect, it } from 'vitest'

import { isSafeEditorLinkHref } from '../../lib/novablock/editorLinkSecurity'

describe('editor link security', () => {
  it('allows normal web and mail links', () => {
    expect(isSafeEditorLinkHref('https://example.com')).toBe(true)
    expect(isSafeEditorLinkHref('http://example.com/path')).toBe(true)
    expect(isSafeEditorLinkHref('mailto:hello@example.com')).toBe(true)
  })

  it('rejects empty, script, file and internal block navigation protocols', () => {
    expect(isSafeEditorLinkHref('')).toBe(false)
    expect(isSafeEditorLinkHref('   ')).toBe(false)
    expect(isSafeEditorLinkHref('javascript:alert(1)')).toBe(false)
    expect(isSafeEditorLinkHref('file:///C:/secret.txt')).toBe(false)
    expect(isSafeEditorLinkHref('nova://block?note=1&block=abc')).toBe(false)
  })
})
