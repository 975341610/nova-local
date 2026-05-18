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

  it('opens advanced table tools only from explicit table interactions', () => {
    const editorSource = fs.readFileSync(
      path.resolve(sourceRoot, 'components/novablock/NovaBlockEditor.tsx'),
      'utf8',
    )

    expect(editorSource).toContain('CellSelection')
    expect(editorSource).toContain('showAdvancedTableToolbar')
    expect(editorSource).toContain('shouldShowAdvancedTableToolbar')
    expect(editorSource).toContain('handleAdvancedTableContextMenu')
    expect(editorSource).not.toContain("shouldShow={({ editor }) => editor.isActive('table')}")
  })

  it('lets users choose advanced table size before insertion', () => {
    const editorSource = fs.readFileSync(
      path.resolve(sourceRoot, 'components/novablock/NovaBlockEditor.tsx'),
      'utf8',
    )

    expect(editorSource).toContain('open-advanced-table-size-picker')
    expect(editorSource).toContain('advancedTableSize')
    expect(editorSource).toContain('qz-table-size-picker')
    expect(editorSource).toContain('insertAdvancedTableWithSize')
  })

  it('adds visible selection feedback for dragged table cell ranges', () => {
    const styleSource = fs.readFileSync(
      path.resolve(sourceRoot, 'styles/qingzhi-refine-v34.css'),
      'utf8',
    )

    expect(styleSource).toContain('.qz-editor-writing-surface .novablock-editor td.selectedCell')
    expect(styleSource).toContain('box-shadow: inset 0 0 0 2px')
    expect(styleSource).toContain('background: rgba(37, 99, 235')
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
