import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = resolve(__dirname, '..')
const editorPath = resolve(sourceRoot, 'components/novablock/NovaBlockEditor.tsx')
const hookPath = resolve(sourceRoot, 'components/novablock/hooks/useDocumentPreviewSuspension.ts')

describe('document preview suspension extraction', () => {
  it('keeps document preview suspend/resume ownership outside NovaBlockEditor', () => {
    const editorSource = readFileSync(editorPath, 'utf8')

    expect(existsSync(hookPath)).toBe(true)
    expect(editorSource).toContain('useDocumentPreviewSuspension')
    expect(editorSource).not.toContain('qzDocumentPreviewSuspended')
    expect(editorSource).not.toContain('qz:document-preview-suspend')
    expect(editorSource).not.toContain('qz:document-preview-resume')

    const hookSource = readFileSync(hookPath, 'utf8')
    expect(hookSource).toContain('export function useDocumentPreviewSuspension')
    expect(hookSource).toContain('qzDocumentPreviewSuspended')
    expect(hookSource).toContain('qz:document-preview-suspend')
    expect(hookSource).toContain('qz:document-preview-resume')
  })
})
