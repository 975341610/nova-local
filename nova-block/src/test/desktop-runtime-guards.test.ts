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

    expect(editorSource).toContain("const autosaveDelayMs = window.electron?.ipcInvoke ? 250 : 3000;")
    expect(canvasSource).toContain("}, window.electron?.ipcInvoke ? 0 : 650);")
  })

  it('keeps heavy editor HTML serialization out of the synchronous onUpdate typing path', () => {
    const editorPath = path.resolve(__dirname, '../components/novablock/NovaBlockEditor.tsx')
    const editorSource = fs.readFileSync(editorPath, 'utf8')
    const onUpdateStart = editorSource.indexOf('onUpdate: ({ editor }) => {')
    const onCreateStart = editorSource.indexOf('onCreate: ({ editor }) => {')
    const onUpdateBody = editorSource.slice(onUpdateStart, onCreateStart)

    expect(onUpdateBody).not.toContain('const html = editor.getHTML();')
    expect(onUpdateBody).toContain('liveContentTimerRef.current = window.setTimeout')
  })

  it('keeps note titles separate from body content during live content updates', () => {
    const editorPath = path.resolve(__dirname, '../components/novablock/NovaBlockEditor.tsx')
    const editorSource = fs.readFileSync(editorPath, 'utf8')
    const onUpdateStart = editorSource.indexOf('onUpdate: ({ editor }) => {')
    const onCreateStart = editorSource.indexOf('onCreate: ({ editor }) => {')
    const onUpdateBody = editorSource.slice(onUpdateStart, onCreateStart)
    const flushDraftStart = editorSource.indexOf('const flushCurrentEditorDraft = useCallback')
    const scheduleStart = editorSource.indexOf('const timerRef = useRef<any>(null);', flushDraftStart)
    const flushDraftBody = editorSource.slice(flushDraftStart, scheduleStart)

    expect(onUpdateBody).not.toContain('extractLeadingNoteTitle')
    expect(onUpdateBody).not.toContain('nextAutoTitle')
    expect(flushDraftBody).toContain('title: nextDraft.title,')
  })

  it('protects optimistic sidebar titles from stale vault refreshes while a save is pending', () => {
    const appPath = path.resolve(__dirname, '../App.tsx')
    const appSource = fs.readFileSync(appPath, 'utf8')

    expect(appSource).toContain('if (previous && hasPendingNoteSave(note.id))')
    expect(appSource).toContain('title: previous.title,')
    expect(appSource).toContain('is_title_manually_edited: previous.is_title_manually_edited,')
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

  it('routes spellcheck popup opening through ProseMirror document positions instead of capture-phase DOM listeners', () => {
    const editorPath = path.resolve(__dirname, '../components/novablock/NovaBlockEditor.tsx')
    const spellcheckPath = path.resolve(__dirname, '../components/novablock/extensions/AISpellcheck.ts')
    const editorSource = fs.readFileSync(editorPath, 'utf8')
    const spellcheckSource = fs.readFileSync(spellcheckPath, 'utf8')

    expect(editorSource).toContain('const [editorViewReadyToken, setEditorViewReadyToken] = useState(0);')
    expect(editorSource).toContain('setEditorViewReadyToken((value) => value + 1);')
    expect(editorSource).toContain('SPELLCHECK_SUGGESTION_REQUEST_EVENT')
    expect(editorSource).not.toContain('handleSpellcheckMarkerMouseDown')
    expect(editorSource).not.toContain("editorDom.addEventListener('mousedown'")
    expect(spellcheckSource).toContain('handleClick(view, pos)')
    expect(spellcheckSource).toContain('resolveSpellcheckPopupRequest(storage.errors, pos')
    expect(spellcheckSource).not.toContain('pointerdown: (view, event) => {')
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

  it('uses the in-app confirm flow for clearing stickers instead of native window.confirm', () => {
    const editorHeaderPath = path.resolve(__dirname, '../components/editor/EditorHeader.tsx')
    const confirmCompatPath = path.resolve(__dirname, '../lib/confirmCompat.ts')
    const editorHeaderSource = fs.readFileSync(editorHeaderPath, 'utf8')
    const confirmCompatSource = fs.readFileSync(confirmCompatPath, 'utf8')

    expect(editorHeaderSource).toContain('confirmCompat({')
    expect(editorHeaderSource).not.toContain('window.confirm(')
    expect(confirmCompatSource).toContain('export async function confirmCompat')
  })

  it('restores editor focus after sticker mode is turned off', () => {
    const editorPath = path.resolve(__dirname, '../components/novablock/NovaBlockEditor.tsx')
    const editorSource = fs.readFileSync(editorPath, 'utf8')

    expect(editorSource).toContain('const restoreEditorFocusAfterStickerMode = useCallback(() => {')
    expect(editorSource).toContain('if (previousStickerModeRef.current && !isStickerMode) {')
    expect(editorSource).toContain('editor.chain().focus().run();')
  })

  it('does not attach a save-time tooltip popup to the editor status indicator', () => {
    const editorHeaderPath = path.resolve(__dirname, '../components/editor/EditorHeader.tsx')
    const editorPath = path.resolve(__dirname, '../components/novablock/NovaBlockEditor.tsx')
    const editorHeaderSource = fs.readFileSync(editorHeaderPath, 'utf8')
    const editorSource = fs.readFileSync(editorPath, 'utf8')

    expect(editorHeaderSource).not.toContain('title={lastSavedAt ?')
    expect(editorSource).not.toContain('fixed bottom-12 left-1/2 -translate-x-1/2')
  })

  it('uses static tree rows and keeps the collapse button fully inside the viewport', () => {
    const treeNodeItemPath = path.resolve(__dirname, '../components/sidebar/TreeNodeItem.tsx')
    const sidebarTreePath = path.resolve(__dirname, '../components/sidebar/SidebarTree.tsx')
    const treeNodeItemSource = fs.readFileSync(treeNodeItemPath, 'utf8')
    const sidebarTreeSource = fs.readFileSync(sidebarTreePath, 'utf8')

    expect(treeNodeItemSource).not.toContain('motion.div')
    expect(treeNodeItemSource).not.toContain('transition-all duration-300')
    expect(sidebarTreeSource).not.toContain('-right-3')
  })

  it('keeps desktop auth tokens in the main process and exposes only allowlisted IPC', () => {
    const preloadPath = path.resolve(__dirname, '../../../electron/preload.js')
    const mainPath = path.resolve(__dirname, '../../../electron/main.js')
    const preloadSource = fs.readFileSync(preloadPath, 'utf8')
    const mainSource = fs.readFileSync(mainPath, 'utf8')

    expect(preloadSource).toContain('const ALLOWED_IPC_CHANNELS = new Set([')
    expect(preloadSource).toContain('if (!ALLOWED_IPC_CHANNELS.has(channel))')
    expect(preloadSource).toContain("'system:open-file'")
    expect(preloadSource).toContain("'system:switch-data-path'")
    expect(preloadSource).toContain("'system:import-data'")
    expect(preloadSource).toContain("'system:update'")
    expect(preloadSource).toContain("'system:restart'")
    expect(preloadSource).toContain("'ai:update-ollama'")
    expect(preloadSource).toContain("'desktop:api-request'")
    expect(preloadSource).not.toContain('getDesktopAuthToken')
    expect(preloadSource).not.toContain("'desktop:get-auth-token'")
    expect(mainSource).toContain("ipcMain.handle('system:open-file'")
    expect(mainSource).toContain("ipcMain.handle('system:switch-data-path'")
    expect(mainSource).toContain("ipcMain.handle('system:import-data'")
    expect(mainSource).toContain("ipcMain.handle('system:update'")
    expect(mainSource).toContain("ipcMain.handle('system:restart'")
    expect(mainSource).toContain("ipcMain.handle('ai:update-ollama'")
    expect(mainSource).toContain("ipcMain.handle('desktop:api-request'")
    expect(mainSource).not.toContain("['system:open-file', { method: 'POST', path: '/system/open-file' }]")
    expect(mainSource).not.toContain("['ai:update-ollama', { method: 'POST', path: '/ai/update-ollama' }]")
    expect(mainSource).not.toContain("ipcMain.handle('desktop:get-auth-token'")
    expect(mainSource).toContain("ipcMain.handle('desktop:get-backend-base-url'")
  })

  it('refreshes vault watcher changes incrementally before falling back to full reloads', () => {
    const appPath = path.resolve(__dirname, '../App.tsx')
    const preloadPath = path.resolve(__dirname, '../../../electron/preload.js')
    const mainPath = path.resolve(__dirname, '../../../electron/main.js')
    const fsBridgePath = path.resolve(__dirname, '../../../electron/fsBridge.js')
    const appSource = fs.readFileSync(appPath, 'utf8')
    const preloadSource = fs.readFileSync(preloadPath, 'utf8')
    const mainSource = fs.readFileSync(mainPath, 'utf8')
    const fsBridgeSource = fs.readFileSync(fsBridgePath, 'utf8')

    expect(appSource).toContain('const handleVaultChanged = useCallback')
    expect(appSource).toContain('api.getChangedNotes(changedFilenames)')
    expect(appSource).toContain('handleVaultChanged(payload)')
    expect(preloadSource).toContain("'notes:changed'")
    expect(mainSource).toContain("ipcMain.handle('notes:changed'")
    expect(fsBridgeSource).toContain('async function getNotesByPaths')
  })

  it('redirects legacy file:// API media requests back to the local backend', () => {
    const mainPath = path.resolve(__dirname, '../../../electron/main.js')
    const mainSource = fs.readFileSync(mainPath, 'utf8')

    expect(mainSource).toContain('webRequest.onBeforeRequest')
    expect(mainSource).toContain('legacyApiMatch')
    expect(mainSource).toContain('redirectURL: `${BACKEND_ORIGIN}/api${legacyApiMatch[1] || \'\'}')
  })

  it('does not keep dummy note property API implementations in the frontend client', () => {
    const apiPath = path.resolve(__dirname, '../lib/api.ts')
    const apiSource = fs.readFileSync(apiPath, 'utf8')

    expect(apiSource).not.toContain('Dummy updateNoteProperty')
    expect(apiSource).toContain("`/notes/${noteId}/properties/${propertyId}`")
  })

  it('keeps URL normalization and HTML sanitization outside the main API client module', () => {
    const apiPath = path.resolve(__dirname, '../lib/api.ts')
    const apiUrlPath = path.resolve(__dirname, '../lib/apiUrl.ts')
    const apiSource = fs.readFileSync(apiPath, 'utf8')
    const apiUrlSource = fs.readFileSync(apiUrlPath, 'utf8')

    expect(apiSource).toContain("from './apiUrl'")
    expect(apiSource).not.toContain("import DOMPurify from 'dompurify'")
    expect(apiUrlSource).toContain('sanitizeLegacyApiUrlsInHtml')
    expect(apiUrlSource).toContain('normalizeLegacyApiPath')
  })

  it('keeps upload hashing and multipart upload flow outside the main API client module', () => {
    const apiPath = path.resolve(__dirname, '../lib/api.ts')
    const uploadPath = path.resolve(__dirname, '../lib/apiUpload.ts')
    const apiSource = fs.readFileSync(apiPath, 'utf8')
    const uploadSource = fs.readFileSync(uploadPath, 'utf8')

    expect(apiSource).toContain("from './apiUpload'")
    expect(apiSource).not.toContain('const digestSha256')
    expect(apiSource).not.toContain('media/upload/chunk')
    expect(uploadSource).toContain('export const uploadFiles')
    expect(uploadSource).toContain('export const uploadMusicFile')
  })

  it('keeps IPC and fetch transport plumbing outside the main API client module', () => {
    const apiPath = path.resolve(__dirname, '../lib/api.ts')
    const transportPath = path.resolve(__dirname, '../lib/apiTransport.ts')
    const apiSource = fs.readFileSync(apiPath, 'utf8')
    const transportSource = fs.readFileSync(transportPath, 'utf8')

    expect(apiSource).toContain("from './apiTransport'")
    expect(apiSource).not.toContain('DESKTOP_API_CHANNELS')
    expect(apiSource).not.toContain('async function invoke')
    expect(transportSource).toContain('export async function invoke')
    expect(transportSource).toContain('desktop:api-request')
  })

  it('queues revision snapshots outside the desktop local note write critical path', () => {
    const mainPath = path.resolve(__dirname, '../../../electron/main.js')
    const mainSource = fs.readFileSync(mainPath, 'utf8')
    const updateHandlerStart = mainSource.indexOf("ipcMain.handle('notes:update'")
    const updateHandlerEnd = mainSource.indexOf("ipcMain.handle('notes:delete'", updateHandlerStart)
    const updateHandler = mainSource.slice(updateHandlerStart, updateHandlerEnd)

    expect(mainSource).toContain('async function captureRevisionSnapshotBeforeLocalUpdate')
    expect(mainSource).toContain('function scheduleRevisionSnapshotAfterLocalUpdate')
    expect(mainSource).toContain('function enqueueRevisionSnapshot')
    expect(mainSource).toContain('function persistRevisionSnapshotQueue')
    expect(mainSource).toContain("source: 'pre-save'")
    expect(mainSource).toContain("source: 'stable'")
    expect(mainSource).toContain('const REVISION_FINAL_SNAPSHOT_DELAY_MS = 3_000')
    expect(updateHandler).toContain('void captureRevisionSnapshotBeforeLocalUpdate(noteId, input);')
    expect(updateHandler).not.toContain('await captureRevisionSnapshotBeforeLocalUpdate')
    expect(updateHandler.indexOf('scheduleRevisionSnapshotAfterLocalUpdate(noteId, updated)')).toBeGreaterThan(
      updateHandler.indexOf('fsBridge.updateNote(noteId, input)'),
    )
    expect(updateHandler).not.toContain("path: '/notes/' + noteId + '/snapshot'")
    expect(updateHandler).not.toContain('[notes:update] auto-snapshot')

    const closeHandlerStart = mainSource.indexOf("mainWindow.on('close'")
    const closeHandlerEnd = mainSource.indexOf("mainWindow.on('closed'", closeHandlerStart)
    const closeHandler = mainSource.slice(closeHandlerStart, closeHandlerEnd)
    expect(closeHandler).not.toContain('await flushPendingRevisionSnapshotTimersWithTimeout()')
    expect(closeHandler).toContain('persistRevisionSnapshotQueue();')
  })

  it('keeps Electron high-DPI rendering enabled for mixed-resolution monitors', () => {
    const mainPath = path.resolve(__dirname, '../../../electron/main.js')
    const mainSource = fs.readFileSync(mainPath, 'utf8')

    expect(mainSource).toContain("app.commandLine.appendSwitch('high-dpi-support', '1')")
    expect(mainSource).toContain("app.commandLine.appendSwitch('enable-use-zoom-for-dsf', 'true')")
    expect(mainSource).not.toContain("app.commandLine.appendSwitch('force-device-scale-factor'")
  })
})
