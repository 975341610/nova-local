import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

function collectSourceFiles(dir: string, sink: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'test') continue
      collectSourceFiles(fullPath, sink)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      sink.push(fullPath)
    }
  }
  return sink
}

describe('desktop runtime guards', () => {
  it('does not call native window.prompt anywhere in app source', () => {
    const srcRoot = path.resolve(__dirname, '..')
    const files = collectSourceFiles(srcRoot)
    const promptUsers = files.filter((file) => {
      if (file.endsWith(path.join('lib', 'promptCompat.ts'))) {
        return false
      }
      return fs.readFileSync(file, 'utf8').includes('window.prompt(')
    })

    expect(promptUsers).toEqual([])
  })

  it('uses near-real-time desktop autosave delays', () => {
    const editorPath = path.resolve(__dirname, '../components/novablock/NovaBlockEditor.tsx')
    const canvasPath = path.resolve(__dirname, '../components/canvas/CanvasEditor.tsx')
    const editorSource = fs.readFileSync(editorPath, 'utf8')
    const canvasSource = fs.readFileSync(canvasPath, 'utf8')

    expect(editorSource).toContain("const autosaveDelayMs = window.electron?.ipcInvoke ? 0 : 3000;")
    expect(canvasSource).toContain("}, window.electron?.ipcInvoke ? 0 : 650);")
  })

  it('guards editor view access behind a safe helper so startup does not white-screen before mount', () => {
    const editorPath = path.resolve(__dirname, '../components/novablock/NovaBlockEditor.tsx')
    const editorSource = fs.readFileSync(editorPath, 'utf8')

    expect(editorSource).toContain('const getEditorViewDom = useCallback(() => {')
    expect(editorSource).not.toContain('editor?.view?.dom')
  })

  it('does not trigger a fresh spellcheck request from the click handler when clicking a red underline', () => {
    const spellcheckPath = path.resolve(__dirname, '../components/novablock/extensions/AISpellcheck.ts')
    const spellcheckSource = fs.readFileSync(spellcheckPath, 'utf8')

    expect(spellcheckSource).not.toContain('void api.spellcheck(paragraphText)')
  })

  it('routes spellcheck popup opening through a capture-phase editor mousedown listener that rebinds when the editor instance changes', () => {
    const editorPath = path.resolve(__dirname, '../components/novablock/NovaBlockEditor.tsx')
    const spellcheckPath = path.resolve(__dirname, '../components/novablock/extensions/AISpellcheck.ts')
    const editorSource = fs.readFileSync(editorPath, 'utf8')
    const spellcheckSource = fs.readFileSync(spellcheckPath, 'utf8')

    expect(editorSource).toContain('const [editorViewReadyToken, setEditorViewReadyToken] = useState(0);')
    expect(editorSource).toContain('setEditorViewReadyToken((value) => value + 1);')
    expect(editorSource).toContain("editorDom.addEventListener('mousedown', handleSpellcheckMarkerMouseDown, true)")
    expect(editorSource).toContain("editorDom.removeEventListener('mousedown', handleSpellcheckMarkerMouseDown, true)")
    expect(editorSource).toContain('}, [getEditorViewDom, note?.id, editor, editorViewReadyToken]);')
    expect(editorSource).toContain('parseSpellcheckErrorFromTarget')
    expect(editorSource).toContain('findSpellcheckMarkerFromTarget')
    expect(spellcheckSource).not.toContain('pointerdown: (view, event) => {')
    expect(spellcheckSource).not.toContain('handleClick: (view, pos, _event) => {')
    expect(spellcheckSource).not.toContain('click: (view, event) => {')
  })

  it('disables native browser spellcheck so only the AI underline pipeline is active', () => {
    const editorPath = path.resolve(__dirname, '../components/novablock/NovaBlockEditor.tsx')
    const mainPath = path.resolve(__dirname, '../../../electron/main.js')
    const editorSource = fs.readFileSync(editorPath, 'utf8')
    const mainSource = fs.readFileSync(mainPath, 'utf8')

    expect(mainSource).toContain('spellcheck: false,')
    expect(editorSource).toContain("spellcheck: 'false'")
    expect(editorSource).toContain("autocorrect: 'off'")
    expect(editorSource).toContain("autocapitalize: 'off'")
  })
})
