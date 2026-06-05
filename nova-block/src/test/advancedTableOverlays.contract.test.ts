import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const sourceRoot = path.resolve(__dirname, '..')

describe('advanced table overlay extraction', () => {
  it('keeps advanced table floating UI outside NovaBlockEditor', () => {
    const componentPath = path.resolve(sourceRoot, 'components/novablock/components/AdvancedTableOverlays.tsx')
    const editorPath = path.resolve(sourceRoot, 'components/novablock/NovaBlockEditor.tsx')

    expect(fs.existsSync(componentPath)).toBe(true)

    const componentSource = fs.readFileSync(componentPath, 'utf8')
    const editorSource = fs.readFileSync(editorPath, 'utf8')

    expect(componentSource).toContain('export function AdvancedTableToolbar')
    expect(componentSource).toContain('export function AdvancedTableEdgeControls')
    expect(componentSource).toContain('export function AdvancedTableSizePicker')
    expect(componentSource).toContain('qz-advanced-table-toolbar')
    expect(componentSource).toContain('qz-table-edge-controls')
    expect(componentSource).toContain('qz-table-size-picker')

    expect(editorSource).toContain('AdvancedTableToolbar')
    expect(editorSource).toContain('AdvancedTableEdgeControls')
    expect(editorSource).toContain('AdvancedTableSizePicker')
    expect(editorSource).not.toContain('mergeCells().run()')
    expect(editorSource).not.toContain('edge.dots.map')
    expect(editorSource).not.toContain('qz-table-size-picker-title')
  })
})
