import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('NovaBlockEditor link security', () => {
  it('keeps normal link marks constrained to safe browser protocols', () => {
    const sourcePath = path.resolve(__dirname, '../../components/novablock/NovaBlockEditor.tsx')
    const source = fs.readFileSync(sourcePath, 'utf8')
    const linkConfigStart = source.indexOf('Link.configure({')
    const linkConfigEnd = source.indexOf('}),', linkConfigStart)
    const linkConfig = source.slice(linkConfigStart, linkConfigEnd)

    expect(linkConfigStart).toBeGreaterThanOrEqual(0)
    expect(linkConfig).toContain("protocols: ['http', 'https', 'mailto']")
    expect(linkConfig).toContain('isSafeEditorLinkHref')
    expect(linkConfig).not.toContain('nova:')
    expect(linkConfig).not.toContain('javascript:')
  })
})
