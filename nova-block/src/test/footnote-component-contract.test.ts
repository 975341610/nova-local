import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(__dirname, '..')
const footnoteComponent = readFileSync(resolve(projectRoot, 'components/editor/FootnoteComponent.tsx'), 'utf-8')

describe('footnote component positioning contract', () => {
  it('measures the rendered popover against the trigger instead of relying only on estimated coordinates', () => {
    expect(footnoteComponent).toContain("from '@floating-ui/dom'")
    expect(footnoteComponent).toContain('computePosition(')
    expect(footnoteComponent).toContain('autoUpdate(')
    expect(footnoteComponent).toContain('ref={popoverRef}')
  })
})
