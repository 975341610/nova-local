import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const sourceRoot = path.resolve(__dirname, '..')

describe('QingZhi advanced table', () => {
  it('exposes an advanced table slash command and table toolbar actions', () => {
    const editorSource = fs.readFileSync(
      path.resolve(sourceRoot, 'components/novablock/NovaBlockEditor.tsx'),
      'utf8',
    )

    expect(editorSource).toContain("label: '高级表格'")
    expect(editorSource).toContain('qz-advanced-table-toolbar')
    expect(editorSource).toContain('mergeCells')
    expect(editorSource).toContain('splitCell')
    expect(editorSource).toContain('toggleHeaderRow')
    expect(editorSource).toContain('toggleHeaderColumn')
    expect(editorSource).toContain('setCellAttribute')
  })

  it('persists cell background and alignment attributes in table cells', () => {
    const extensionSource = fs.readFileSync(
      path.resolve(sourceRoot, 'lib/tiptapExtensions.ts'),
      'utf8',
    )

    expect(extensionSource).toContain('backgroundColor')
    expect(extensionSource).toContain('textAlign')
    expect(extensionSource).toContain('data-qz-cell-bg')
    expect(extensionSource).toContain('data-qz-cell-align')
  })
})
