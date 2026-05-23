import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = resolve(__dirname, '..')
const editorPath = resolve(projectRoot, 'components/novablock/NovaBlockEditor.tsx')
const mainPath = resolve(projectRoot, '../../electron/main.js')
const preloadPath = resolve(projectRoot, '../../electron/preload.js')
const refineCssPath = resolve(projectRoot, 'styles/qingzhi-refine-v34.css')
const revisionServicePath = resolve(projectRoot, '../../backend/services/revision_service.py')
const routesPath = resolve(projectRoot, '../../backend/api/routes.py')

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start === -1 || end === -1) {
    return ''
  }
  return source.slice(start, end)
}

describe('autosave regressions', () => {
  it('re-arms note autosave from the typing onUpdate path instead of only the first dirty transition', () => {
    const editorSource = readFileSync(editorPath, 'utf8')
    const onUpdateBody = sliceBetween(editorSource, 'onUpdate: ({ editor }) => {', 'onCreate: ({ editor }) => {')
    const autosaveEffectBody = sliceBetween(editorSource, 'const autosaveDelayMs = window.electron?.ipcInvoke ? 250 : 3000;', 'const [blockMenuPos, setBlockMenuPos]')

    expect(editorSource).toContain('const scheduleAutosave = useCallback((expectedNoteId?: number | string | null) => {')
    expect(onUpdateBody).toContain('scheduleAutosave(updateNoteId);')
    expect(autosaveEffectBody).not.toContain("}, [autosaveDelayMs, handleSave, isDirty]);")
  })

  it('flushes the live editor HTML through a shared draft helper before visibility, switch, and close saves', () => {
    const editorSource = readFileSync(editorPath, 'utf8')

    expect(editorSource).toContain('const flushCurrentEditorDraft = useCallback((expectedNoteId?: number | string | null) => {')
    expect(editorSource).toContain('const nextContent = editor?.getHTML() ?? currentDraft.content ?? \'\';')
    expect(editorSource).toContain('const draftSnapshot = flushCurrentEditorDraft();')
    expect(editorSource).toContain('void handleSave(draftSnapshot.content, draftSnapshot.note);')
  })

  it('flushes the previous note through the shared save path before switching editors', () => {
    const editorSource = readFileSync(editorPath, 'utf8')
    const switchEffectBody = sliceBetween(editorSource, 'if (note.id !== prevNoteId) {', 'replaceEditorContentWithoutAutosave(')

    expect(switchEffectBody).toContain('const shouldFlushPreviousDraft = isDirtyRef.current || isDirty;')
    expect(switchEffectBody).toContain('const draftSnapshot = shouldFlushPreviousDraft ? flushCurrentEditorDraft(prevNoteId) : null;')
    expect(switchEffectBody).toContain('onLiveChange?.({')
    expect(switchEffectBody).toContain('handleSaveRef.current?.(')
  })

  it('does not mark a clean previous note as modified when merely opening another note', () => {
    const editorSource = readFileSync(editorPath, 'utf8')
    const switchEffectBody = sliceBetween(editorSource, 'if (note.id !== prevNoteId) {', 'replaceEditorContentWithoutAutosave(')

    expect(switchEffectBody).not.toContain('const draftSnapshot = flushCurrentEditorDraft(prevNoteId);')
    expect(switchEffectBody).toContain('const shouldFlushPreviousDraft = isDirtyRef.current || isDirty;')
    expect(switchEffectBody).toContain('currentDraft: shouldFlushPreviousDraft ? draftSnapshot?.note ?? latestNoteRef.current : null,')
  })

  it('does not pre-bind latestNoteRef to the incoming note before the previous note switch flush runs', () => {
    const editorSource = readFileSync(editorPath, 'utf8')

    expect(editorSource).not.toContain('latestNoteRef.current = syncLatestDraftWithIncomingNote(')
    expect(editorSource).not.toContain("useEffect(() => {\n    latestNoteRef.current = syncLatestDraftWithIncomingNote")
  })

  it('binds delayed live updates and autosaves to the note id that was active when typing happened', () => {
    const editorSource = readFileSync(editorPath, 'utf8')
    const onUpdateBody = sliceBetween(editorSource, 'onUpdate: ({ editor }) => {', 'onCreate: ({ editor }) => {')

    expect(onUpdateBody).toContain('const updateNoteId = latestNoteRef.current?.id;')
    expect(onUpdateBody).toContain('flushCurrentEditorDraft(updateNoteId);')
    expect(onUpdateBody).toContain('scheduleAutosave(updateNoteId);')
    expect(editorSource).toContain('const scheduleAutosave = useCallback((expectedNoteId?: number | string | null) => {')
    expect(editorSource).toContain('const draftSnapshot = flushCurrentEditorDraft(expectedNoteId);')
  })

  it('does not autosave content replacements that come from switching or reloading notes', () => {
    const editorSource = readFileSync(editorPath, 'utf8')
    const onUpdateBody = sliceBetween(editorSource, 'onUpdate: ({ editor }) => {', 'onCreate: ({ editor }) => {')

    expect(editorSource).toContain('const isProgrammaticContentUpdateRef = useRef(false);')
    expect(onUpdateBody).toContain('if (isProgrammaticContentUpdateRef.current) {')
    expect(editorSource).toContain('const replaceEditorContentWithoutAutosave = useCallback((content: string) => {')
    expect(editorSource).not.toContain('replaceEditorContentWithoutHistory(\n        editor,')
  })

  it('does not rely on async React dirty state when closing immediately after typing', () => {
    const editorSource = readFileSync(editorPath, 'utf8')
    const onUpdateBody = sliceBetween(editorSource, 'onUpdate: ({ editor }) => {', 'onCreate: ({ editor }) => {')
    const closeFlushBody = sliceBetween(editorSource, 'const unsubscribeBeforeClose = window.electron?.onBeforeAppClose?.(async () => {', 'window.electron?.finishBeforeAppClose?.();')

    expect(editorSource).toContain('const isDirtyRef = useRef(false);')
    expect(onUpdateBody).toContain('isDirtyRef.current = true;')
    expect(closeFlushBody).toContain('if (draftSnapshot) {')
    expect(closeFlushBody).toContain('Promise.resolve(handleSave(draftSnapshot.content, draftSnapshot.note))')
    expect(closeFlushBody).not.toContain('isDirty || queuedPayloadRef.current.length > 0')
  })

  it('waits for queued saves to drain before reporting close flush completion', () => {
    const editorSource = readFileSync(editorPath, 'utf8')

    expect(editorSource).toContain('const saveDrainResolversRef = useRef<Array<() => void>>([]);')
    expect(editorSource).toContain('const waitForSaveDrain = () => {')
    expect(editorSource).toContain('return waitForSaveDrain();')
    expect(editorSource).toContain('resolveSaveDrain();')
  })

  it('keeps content saves fast by moving revision snapshots out of close and save waits', () => {
    const mainSource = readFileSync(mainPath, 'utf8')
    const preloadSource = readFileSync(preloadPath, 'utf8')

    expect(mainSource).toContain('const CLOSE_WINDOW_RENDERER_FLUSH_TIMEOUT_MS = 5_000;')
    expect(mainSource).not.toContain('const CLOSE_REVISION_FLUSH_TIMEOUT_MS = 5_000;')
    expect(mainSource).not.toContain('await captureRevisionSnapshotBeforeLocalUpdate')
    expect(mainSource).not.toContain('await flushPendingRevisionSnapshotTimersWithTimeout()')
    expect(mainSource).toContain('const REVISION_SNAPSHOT_QUEUE_PATH')
    expect(mainSource).toContain('setRevisionSnapshotStatus(noteId,')
    expect(preloadSource).toContain('onRevisionSnapshotStatus')
  })

  it('keeps revision snapshot status per note so switching notes cannot leave a stale queued badge', () => {
    const editorSource = readFileSync(editorPath, 'utf8')
    const subscriptionBody = sliceBetween(editorSource, 'window.electron?.onRevisionSnapshotStatus?.((payload: RevisionSnapshotStatus) => {', 'return () => unsubscribe?.();')

    expect(editorSource).toContain('const revisionSnapshotStatusByNoteRef = useRef<Record<number, RevisionSnapshotStatus | null>>({});')
    expect(editorSource).toContain('const activeRevisionNoteIdRef = useRef<number | null>')
    expect(editorSource).toContain('revisionSnapshotStatusByNoteRef.current[activeNoteId] ?? null')
    expect(subscriptionBody).toContain('revisionSnapshotStatusByNoteRef.current[payload.noteId] = payload;')
    expect(subscriptionBody).toContain('activeRevisionNoteIdRef.current === payload.noteId')
    expect(subscriptionBody).toContain('revisionSnapshotStatusByNoteRef.current[payload.noteId] = null;')
  })

  it('keeps topbar and editor toolbar above block handles and advanced table edge overlays', () => {
    const refineCss = readFileSync(refineCssPath, 'utf8')

    expect(refineCss).toContain('.qz-topbar {\n  z-index: 1000 !important;')
    expect(refineCss).toContain('.qz-editor-toprail {\n  position: relative !important;\n  z-index: 900 !important;')
    expect(refineCss).toContain('.qz-editor-toolbar-row {\n  position: sticky !important;')
    expect(refineCss).toContain('z-index: 910 !important;')
    expect(refineCss).toContain('.qz-custom-block-handle {\n')
    expect(refineCss).toContain('z-index: 25 !important;')
    expect(refineCss).toContain('.qz-table-edge-controls {\n  position: fixed !important;\n  inset: 0 !important;\n  z-index: 20 !important;')
    expect(refineCss).toContain('.qz-table-edge-button {\n  z-index: 21 !important;')
    expect(refineCss).toContain('.qz-table-edge-select-zone {\n  z-index: 20 !important;')
  })

  it('keeps version history list queries metadata-only so opening history stays fast', () => {
    const revisionService = readFileSync(revisionServicePath, 'utf8')
    const listBody = sliceBetween(revisionService, 'def list_revisions(', 'def get_revision(')

    expect(listBody).toContain('load_only(')
    expect(listBody).toContain('NoteRevision.title_snapshot')
    expect(listBody).toContain('NoteRevision.byte_size')
    expect(listBody).not.toContain('NoteRevision.content_gz')
  })

  it('does not scan the vault before listing revisions or snapshotting payload content', () => {
    const routesSource = readFileSync(routesPath, 'utf8')
    const listBody = sliceBetween(routesSource, 'def list_note_revisions_api(', '@router.get("/notes/{note_id}/revisions/{revision_id}")')
    const snapshotBody = sliceBetween(routesSource, 'def capture_note_snapshot_api(', '@router.get("/media/music-library")')

    expect(listBody).toContain('rows = revision_service.list_revisions(db, note_id)')
    expect(listBody).not.toContain('get_note(db, note_id)')
    expect(snapshotBody).toContain('has_payload_content = False')
    expect(snapshotBody).toContain('if not has_payload_content:')
    expect(snapshotBody.indexOf('if not has_payload_content:')).toBeLessThan(snapshotBody.indexOf('existing = get_note(db, note_id)'))
  })

  it('quarantines corrupt revision snapshot queue files and persists the queue through a temp file', () => {
    const mainSource = readFileSync(mainPath, 'utf8')
    const loadBody = sliceBetween(mainSource, 'function loadRevisionSnapshotQueue()', 'function persistRevisionSnapshotQueue()')
    const persistBody = sliceBetween(mainSource, 'function persistRevisionSnapshotQueue()', 'function setRevisionSnapshotStatus(')

    expect(loadBody).toContain('revision-snapshot-queue.corrupt-')
    expect(loadBody).toContain('fs.renameSync(REVISION_SNAPSHOT_QUEUE_PATH, corruptPath)')
    expect(loadBody).toContain('revisionSnapshotQueue.splice(0, revisionSnapshotQueue.length);')
    expect(persistBody).toContain('tmpPath')
    expect(persistBody).toContain('backupPath')
    expect(persistBody).toContain('fs.writeFileSync(tmpPath')
    expect(persistBody).toContain('fs.renameSync(tmpPath, REVISION_SNAPSHOT_QUEUE_PATH)')
  })

  it('keeps revision history previews readable on the Qingzhi light background', () => {
    const drawerPath = resolve(projectRoot, 'components/editor/RevisionHistoryDrawer.tsx')
    const drawerSource = readFileSync(drawerPath, 'utf8')
    const refineCss = readFileSync(refineCssPath, 'utf8')

    expect(drawerSource).toContain('className="qz-revision-preview nv-reader-html max-w-none"')
    expect(drawerSource).not.toContain('dark:prose-invert')
    expect(refineCss).toContain('.qz-revision-preview {')
    expect(refineCss).toContain('color: var(--nv-color-text, #2b2b2b) !important;')
    expect(refineCss).toContain('opacity: 1 !important;')
    expect(refineCss).toContain('.qz-revision-preview :where(h1, h2, h3, h4, h5, h6, p, li, blockquote, td, th, span, strong, em)')
  })
})
