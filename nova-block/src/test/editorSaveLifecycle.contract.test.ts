import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sourceRoot = resolve(__dirname, '..')
const editorPath = resolve(sourceRoot, 'components/novablock/NovaBlockEditor.tsx')
const hookPath = resolve(sourceRoot, 'components/novablock/hooks/useEditorSaveLifecycle.ts')

describe('editor save lifecycle extraction', () => {
  it('keeps app close and page-hide save flushing outside NovaBlockEditor', () => {
    const editorSource = readFileSync(editorPath, 'utf8')

    expect(existsSync(hookPath)).toBe(true)
    expect(editorSource).toContain('useEditorSaveLifecycle')
    expect(editorSource).not.toContain("addEventListener('beforeunload'")
    expect(editorSource).not.toContain("addEventListener('pagehide'")
    expect(editorSource).not.toContain('finishBeforeAppClose')

    const hookSource = readFileSync(hookPath, 'utf8')
    expect(hookSource).toContain('export function useEditorSaveLifecycle')
    expect(hookSource).toContain("addEventListener('beforeunload'")
    expect(hookSource).toContain("addEventListener('pagehide'")
    expect(hookSource).toContain('onBeforeAppClose')
    expect(hookSource).toContain('finishBeforeAppClose')
  })
})
