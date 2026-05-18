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
    expect(editorSource).toContain('TextSelection')
    expect(editorSource).toContain('showAdvancedTableToolbar')
    expect(editorSource).toContain('shouldShowAdvancedTableToolbar')
    expect(editorSource).toContain('openAdvancedTableToolbarAtPoint')
    expect(editorSource).toContain('handleAdvancedTableContextMenu')
    expect(editorSource).toContain('handleAdvancedTableEditorContextMenu')
    expect(editorSource).toContain('handleDOMEvents')
    expect(editorSource).toContain('posAtCoords')
    expect(editorSource).toContain('TextSelection.near')
    expect(editorSource).toContain('event.button === 0')
    expect(editorSource).not.toContain("shouldShow={({ editor }) => editor.isActive('table')}")
  })

  it('moves row and column operations to table edge controls', () => {
    const editorSource = fs.readFileSync(
      path.resolve(sourceRoot, 'components/novablock/NovaBlockEditor.tsx'),
      'utf8',
    )
    const styleSource = fs.readFileSync(
      path.resolve(sourceRoot, 'styles/qingzhi-refine-v34.css'),
      'utf8',
    )

    expect(editorSource).toContain('advancedTableEdgeIntent')
    expect(editorSource).toContain('handleAdvancedTableMouseMove')
    expect(editorSource).toContain('insertAdvancedTableEdge')
    expect(editorSource).toContain('selectAdvancedTableEdge')
    expect(editorSource).toContain('CellSelection.rowSelection')
    expect(editorSource).toContain('CellSelection.colSelection')
    expect(editorSource).toContain('qz-table-edge-controls')
    expect(editorSource).toContain('qz-table-edge-select-zone')
    expect(editorSource).toContain('qz-table-edge-add-button')
    expect(styleSource).toContain('.qz-table-edge-controls')
    expect(styleSource).toContain('.qz-table-insert-line')
    expect(styleSource).toContain('.qz-table-edge-select-zone')
    expect(styleSource).toContain('rgba(128, 168, 156')
    expect(editorSource).not.toContain('title="添加列"')
    expect(editorSource).not.toContain('title="添加行"')
    expect(editorSource).not.toContain('title="删除列"')
    expect(editorSource).not.toContain('title="删除行"')
  })

  it('keeps toolbar focused on formatting, clearing cells, and hover color choices', () => {
    const editorSource = fs.readFileSync(
      path.resolve(sourceRoot, 'components/novablock/NovaBlockEditor.tsx'),
      'utf8',
    )
    const styleSource = fs.readFileSync(
      path.resolve(sourceRoot, 'styles/qingzhi-refine-v34.css'),
      'utf8',
    )

    expect(editorSource).toContain('clearCurrentTableCell')
    expect(editorSource).toContain('qz-advanced-table-clear-cell')
    expect(editorSource).toContain('qz-advanced-table-text-popover')
    expect(editorSource).toContain('qz-advanced-table-color-menu')
    expect(editorSource).not.toContain('qz-advanced-table-toolbar flex overflow-hidden')
    expect(styleSource).toContain('overflow: visible !important')
    expect(styleSource).toContain('.qz-advanced-table-color-popover:hover .qz-advanced-table-color-menu')
    expect(styleSource).toContain('.qz-advanced-table-text-popover:hover .qz-advanced-table-text-menu')
  })

  it('keeps native column resizing reachable while table edge controls are active', () => {
    const styleSource = fs.readFileSync(
      path.resolve(sourceRoot, 'styles/qingzhi-refine-v34.css'),
      'utf8',
    )

    expect(styleSource).toContain('.qz-editor-writing-surface .novablock-editor .column-resize-handle')
    expect(styleSource).toContain('cursor: col-resize')
    expect(styleSource).toContain('pointer-events: auto')
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
