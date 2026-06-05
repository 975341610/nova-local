import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const sourceRoot = path.resolve(__dirname, '..')

describe('block link picker extraction', () => {
  it('keeps block-link picker UI in a dedicated component', () => {
    const componentPath = path.resolve(sourceRoot, 'components/novablock/components/BlockLinkPicker.tsx')
    const editorPath = path.resolve(sourceRoot, 'components/novablock/NovaBlockEditor.tsx')

    expect(fs.existsSync(componentPath)).toBe(true)

    const componentSource = fs.readFileSync(componentPath, 'utf8')
    const editorSource = fs.readFileSync(editorPath, 'utf8')

    expect(componentSource).toContain('export function BlockLinkPicker')
    expect(componentSource).toContain('data-testid="qingzhi-block-link-picker"')
    expect(componentSource).toContain('qz-block-link-picker-list')
    expect(componentSource).toContain('暂无可链接块')
    expect(componentSource).toContain('createPortal')

    expect(editorSource).toContain('BlockLinkPicker')
    expect(editorSource).toContain('openBlockLinkPicker')
    expect(editorSource).toContain('applyBlockLinkTarget')
    expect(editorSource).not.toContain('className="qz-block-link-picker"')
    expect(editorSource).not.toContain('qz-block-link-picker-empty')
  })
})
