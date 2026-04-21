import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { NovaBlockEditor } from './components/novablock/NovaBlockEditor'
import { CanvasEditor } from './components/canvas/CanvasEditor'
import { SidebarTree } from './components/sidebar/SidebarTree'
import CommandPalette from './components/search/CommandPalette'
import { SettingsDialog } from './components/SettingsDialog'
import { TemplatePicker } from './components/editor/TemplatePicker'
import { applyThemeConfig, getThemeConfig } from './lib/themeUtils'
import type { Note, NoteTemplate } from './lib/types'
import { api } from './lib/api'
import { extractLinkedNoteIds, getNotesNeedingFilenameSync, shouldRenameNoteFile } from './lib/noteSync'
import { searchIndex, type SearchableNote } from './lib/searchIndex'
import { buildSearchableText } from './lib/searchUtils'
import { migrateLegacyNotes, parseLegacyNotes, shouldRunLegacyMigration } from './lib/legacyLocalMigration'
import { AnimatePresence, motion } from 'framer-motion'
import { MusicProvider, useMusicControls } from './contexts/MusicContext'
import { HabitProvider } from './contexts/HabitContext'
import { TodoProvider } from './contexts/TodoContext'
import { AIProvider } from './contexts/AIContext'
import { FloatingMusicCapsule } from './components/widgets/FloatingMusicCapsule'
import { PlaylistPopover } from './components/widgets/PlaylistPopover'

function MusicGlobalUI() {
  const { playlistPopoverAnchor, closePlaylist } = useMusicControls()

  return (
    <AnimatePresence>
      {playlistPopoverAnchor && (
        <PlaylistPopover
          onClose={closePlaylist}
          portal
          anchorRect={playlistPopoverAnchor}
        />
      )}
    </AnimatePresence>
  )
}

function mergeNote(existing: Note | undefined, incoming: Note): Note {
  return {
    ...(existing ?? {}),
    ...incoming,
    content: incoming.content !== undefined ? incoming.content : existing?.content,
    background_paper: incoming.background_paper ?? existing?.background_paper ?? 'none',
    sort_key: incoming.sort_key ?? existing?.sort_key ?? 'm',
    stickers: incoming.stickers !== undefined ? incoming.stickers : (existing?.stickers ?? []),
    sticky_notes: incoming.sticky_notes !== undefined ? incoming.sticky_notes : (existing?.sticky_notes ?? []),
  }
}

function pickCurrentNoteId(notes: Note[], preferredId?: number | null) {
  if (preferredId && notes.some(note => note.id === preferredId)) {
    return preferredId
  }
  return notes.find(note => !note.is_folder)?.id ?? notes[0]?.id ?? null
}

const LEGACY_MIGRATION_FLAG = 'nova-block-vault-migration-completed'

function App() {
  const [theme] = useState<'dark' | 'light'>('light')
  const [notes, setNotes] = useState<Note[]>([])
  const [currentNoteId, setCurrentNoteId] = useState<number | null>(null)
  const [activeView, setActiveView] = useState<'notes'>('notes')
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [templateModal, setTemplateModal] = useState<{
    isOpen: boolean
    mode: 'select' | 'save'
    parentId: string | null
  }>({ isOpen: false, mode: 'select', parentId: null })
  const notesRef = useRef<Note[]>([])
  const renameTimersRef = useRef<Map<number, number>>(new Map())

  const toggleSidebar = (collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed)
  }

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    return () => {
      for (const timerId of renameTimersRef.current.values()) {
        clearTimeout(timerId)
      }
      renameTimersRef.current.clear()
    }
  }, [])

  const applyNotePatch = useCallback((targetId: number, patch: Partial<Note>) => {
    const nextId = typeof patch.id === 'number' ? patch.id : targetId

    setNotes(prev => prev.map(note => (
      note.id === targetId
        ? mergeNote(note, {
            ...patch,
            id: nextId,
          } as Note)
        : note
    )))

    if (nextId !== targetId) {
      setCurrentNoteId(prev => prev === targetId ? nextId : prev)
    }
  }, [])

  const scheduleFileRename = useCallback((noteLike: Partial<Note>) => {
    if (typeof noteLike.id !== 'number') {
      return
    }

    if (!shouldRenameNoteFile(noteLike)) {
      const existingTimer = renameTimersRef.current.get(noteLike.id)
      if (existingTimer) {
        clearTimeout(existingTimer)
        renameTimersRef.current.delete(noteLike.id)
      }
      return
    }

    const existingTimer = renameTimersRef.current.get(noteLike.id)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timerId = window.setTimeout(async () => {
      renameTimersRef.current.delete(noteLike.id!)

      const latest = notesRef.current.find(note => (
        note.id === noteLike.id ||
        (noteLike.file_path ? note.file_path === noteLike.file_path : false)
      ))

      if (!latest || !shouldRenameNoteFile(latest)) {
        return
      }

      try {
        const renamed = await api.updateNote(latest.id, {
          title: latest.title,
          file_path: latest.file_path,
          is_title_manually_edited: latest.is_title_manually_edited,
          rename_file: true,
        })
        applyNotePatch(latest.id, renamed)
      } catch (err) {
        console.error('Failed to sync filename with note title:', err)
      }
    }, 900)

    renameTimersRef.current.set(noteLike.id, timerId)
  }, [applyNotePatch])

  const retrySaveByFilePath = useCallback(async (failedId: number, payload: Partial<Note>) => {
    if (!payload.file_path) {
      return null
    }

    const latestNotes = await api.listNotes()
    const matched = latestNotes.find(note => note.file_path === payload.file_path)
    if (!matched) {
      return null
    }

    applyNotePatch(failedId, matched)
    const retried = await api.updateNote(matched.id, {
      ...payload,
      file_path: matched.file_path,
    })
    return retried
  }, [applyNotePatch])

  useEffect(() => {
    for (const note of getNotesNeedingFilenameSync(notes)) {
      scheduleFileRename(note)
    }
  }, [notes, scheduleFileRename])

  const loadNotes = useCallback(async (preferredId?: number | null) => {
    let loadedNotes = await api.listNotes(true)
    let nextPreferredId = preferredId ?? null

    const legacyNotes = parseLegacyNotes(localStorage.getItem('nova-block-notes'))
    if (shouldRunLegacyMigration(legacyNotes, loadedNotes, localStorage.getItem(LEGACY_MIGRATION_FLAG) === '1')) {
      const migration = await migrateLegacyNotes(legacyNotes, {
        createFolder: api.createFolder,
        createNote: api.createNote,
        updateNote: api.updateNote,
      })

      const legacyCurrentNoteId = localStorage.getItem('nova-block-current-note-id')
      if (legacyCurrentNoteId) {
        nextPreferredId = migration.idMap.get(parseInt(legacyCurrentNoteId, 10)) ?? nextPreferredId
      }

      localStorage.setItem(LEGACY_MIGRATION_FLAG, '1')
      loadedNotes = await api.listNotes(true)
    }

    setNotes(prev => loadedNotes.map(note => mergeNote(prev.find(item => item.id === note.id), note)))
    setCurrentNoteId(prev => pickCurrentNoteId(loadedNotes, nextPreferredId ?? prev))

    // 构建全文搜索索引
    searchIndex.buildIndex(
      loadedNotes
        .filter((n) => !n.is_folder)
        .map((n) => ({
          id: n.id,
          title: n.title,
          content: buildSearchableText(n),
          tags: n.tags || [],
          type: n.type,
        }))
    )

    return loadedNotes
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsCommandPaletteOpen(prev => !prev)
      }
    }

    const handleSelectNoteEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ noteId?: number | string }>
      const noteId = customEvent.detail?.noteId
      if (noteId) {
        setCurrentNoteId(Number(noteId))
        setActiveView('notes')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('nova-select-note', handleSelectNoteEvent)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('nova-select-note', handleSelectNoteEvent)
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('nova-block-current-note-id')
    const preferredId = saved ? parseInt(saved, 10) : null

    loadNotes(preferredId).catch(err => {
      console.error('Failed to load notes from backend:', err)
    })
  }, [loadNotes])

  useEffect(() => {
    if (!window.electron?.onVaultChanged) {
      return
    }

    const unsubscribe = window.electron.onVaultChanged(() => {
      loadNotes(currentNoteId).catch(err => {
        console.error('Failed to refresh notes after vault change:', err)
      })
    })

    return () => {
      unsubscribe?.()
    }
  }, [currentNoteId, loadNotes])

  useEffect(() => {
    // @ts-ignore
    window.novaNotes = notes
    window.dispatchEvent(new Event('nova-notes-updated'))
  }, [notes])

  useEffect(() => {
    if (currentNoteId === null) {
      localStorage.removeItem('nova-block-current-note-id')
      return
    }
    localStorage.setItem('nova-block-current-note-id', currentNoteId.toString())
  }, [currentNoteId])

  useEffect(() => {
    const root = window.document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  useEffect(() => {
    applyThemeConfig(getThemeConfig())
  }, [])

  const currentNote = useMemo(() => {
    if (currentNoteId === null) {
      return null
    }
    return notes.find(note => note.id === currentNoteId) || null
  }, [notes, currentNoteId])

  const loadNoteContent = useCallback(async (noteId: number) => {
    const note = notes.find(item => item.id === noteId)
    if (!note || note.is_folder || note.content !== undefined) {
      return
    }

    try {
      const fullNote = await api.getNote(noteId)
      setNotes(prev => prev.map(item => item.id === noteId ? mergeNote(item, fullNote) : item))
    } catch (err) {
      console.error('Failed to load note content:', err)
    }
  }, [notes])

  useEffect(() => {
    if (activeView === 'notes' && currentNoteId !== null) {
      loadNoteContent(currentNoteId)
    }
  }, [activeView, currentNoteId, loadNoteContent])

  const treeNodes = useMemo(() => {
    return notes.map(note => ({
      id: note.id.toString(),
      parentId: note.parent_id ? note.parent_id.toString() : null,
      sortKey: note.sort_key || 'm',
      title: note.title,
      isFolder: note.is_folder,
    }))
  }, [notes])

  const handleSelectNode = (id: string) => {
    const noteId = parseInt(id, 10)
    if (!Number.isNaN(noteId)) {
      setCurrentNoteId(noteId)
      setActiveView('notes')
    }
  }

  const handleAddNote = async (parentId: string | null, type: 'file' | 'folder' | 'canvas' = 'file') => {
    const isFolder = type === 'folder'
    const isCanvas = type === 'canvas'

    try {
      const nextParentId = parentId ? parseInt(parentId, 10) : null
      const created = isFolder
        ? await api.createFolder({
            title: '无标题文件夹',
            notebook_id: null,
            parent_id: nextParentId,
            tags: [],
            type: 'note',
          })
        : await api.createNote({
            title: isCanvas ? '无标题画布' : '无标题笔记',
            icon: isCanvas ? '🎨' : '📝',
            content: isCanvas
              ? JSON.stringify({ version: 'v1', nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } })
              : '<p></p>',
            type: isCanvas ? 'canvas' : 'note',
            tags: [],
            notebook_id: null,
            parent_id: nextParentId,
            is_folder: false,
            is_title_manually_edited: false,
            background_paper: 'none',
            sort_key: 'm',
            stickers: [],
            sticky_notes: [],
          })

      const nextNote = mergeNote(undefined, created)
      setNotes(prev => [...prev, nextNote])

      // 增量添加全文搜索索引
      if (!nextNote.is_folder) {
        searchIndex.addNote({
          id: nextNote.id,
          title: nextNote.title,
          content: buildSearchableText(nextNote),
          tags: nextNote.tags || [],
          type: nextNote.type,
        })
      }

      if (!isFolder) {
        setCurrentNoteId(nextNote.id)
        setActiveView('notes')
      }
    } catch (err) {
      console.error('Failed to create note:', err)
    }
  }

  const handleNodeMove = async (nodeId: string, parentId: string | null, sortKey: string) => {
    const noteId = parseInt(nodeId, 10)
    const nextParentId = parentId ? parseInt(parentId, 10) : null

    setNotes(prev => prev.map(note => (
      note.id === noteId ? { ...note, parent_id: nextParentId, sort_key: sortKey } : note
    )))

    try {
      const updated = await api.updateNote(noteId, { parent_id: nextParentId, sort_key: sortKey })
      setNotes(prev => prev.map(note => note.id === noteId ? mergeNote(note, updated) : note))
    } catch (err) {
      console.error('Failed to move note:', err)
      await loadNotes(currentNoteId)
    }
  }

  const handleNodeRename = async (nodeId: string, newTitle: string) => {
    const noteId = parseInt(nodeId, 10)

    try {
      const updated = await api.updateNote(noteId, {
        title: newTitle,
        is_title_manually_edited: true,
        rename_file: true,
      })
      setNotes(prev => prev.map(note => note.id === noteId ? mergeNote(note, updated) : note))
    } catch (err) {
      console.error('Failed to rename note:', err)
    }
  }

  const handleNodeDelete = async (nodeId: string, deleteChildren: boolean) => {
    const idToDelete = parseInt(nodeId, 10)
    const snapshot = notes
    const nodeToDelete = snapshot.find(note => note.id === idToDelete)

    if (!nodeToDelete) {
      return
    }

    try {
      if (deleteChildren) {
        await api.deleteNote(idToDelete)

        const getDescendants = (parent: number, nodesList: Note[]): number[] => {
          const children = nodesList.filter(note => note.parent_id === parent)
          return children.reduce((acc, child) => [...acc, child.id, ...getDescendants(child.id, nodesList)], [] as number[])
        }

        const idsToRemove = new Set([idToDelete, ...getDescendants(idToDelete, snapshot)])
        const remaining = snapshot.filter(note => !idsToRemove.has(note.id))

        // 移除索引
        idsToRemove.forEach(id => searchIndex.removeNote(id))

        setNotes(remaining)
        setCurrentNoteId(prev => idsToRemove.has(prev ?? -1) ? pickCurrentNoteId(remaining) : prev)
        return
      }

      const nextParentId = nodeToDelete.parent_id ?? null
      const directChildren = snapshot.filter(note => note.parent_id === idToDelete)

      await Promise.all(directChildren.map(child => (
        api.updateNote(child.id, { parent_id: nextParentId, sort_key: child.sort_key })
      )))
      await api.deleteNote(idToDelete)

      // 移除索引
      searchIndex.removeNote(idToDelete)

      const remaining = snapshot
        .filter(note => note.id !== idToDelete)
        .map(note => note.parent_id === idToDelete ? { ...note, parent_id: nextParentId } : note)

      setNotes(remaining)
      setCurrentNoteId(prev => prev === idToDelete ? pickCurrentNoteId(remaining, nextParentId) : prev)
    } catch (err) {
      console.error('Failed to delete note:', err)
      await loadNotes(currentNoteId)
    }
  }

  const handleNodeDuplicate = async (nodeId: string) => {
    const idToDuplicate = parseInt(nodeId, 10)
    const snapshot = notes

    const duplicateRecursive = async (originalId: number, newParentId: number | null, isRoot: boolean) => {
      const original = snapshot.find(note => note.id === originalId)
      if (!original) {
        return null
      }

      const created = original.is_folder
        ? await api.createFolder({
            title: isRoot ? `${original.title} (副本)` : original.title,
            notebook_id: original.notebook_id,
            parent_id: newParentId,
            tags: original.tags,
            type: original.type,
          })
        : await api.createNote({
            title: isRoot ? `${original.title} (副本)` : original.title,
            content: original.content ?? '',
            notebook_id: original.notebook_id,
            icon: original.icon,
            parent_id: newParentId,
            is_title_manually_edited: true,
            tags: original.tags,
            type: original.type,
            is_folder: false,
            background_paper: original.background_paper,
            sort_key: original.sort_key,
            stickers: original.stickers,
            sticky_notes: original.sticky_notes,
          })

      const children = snapshot.filter(note => note.parent_id === originalId)
      for (const child of children) {
        await duplicateRecursive(child.id, created.id, false)
      }

      return created
    }

    try {
      const original = snapshot.find(note => note.id === idToDuplicate)
      const duplicatedRoot = await duplicateRecursive(idToDuplicate, original?.parent_id ?? null, true)
      await loadNotes(duplicatedRoot?.id ?? currentNoteId)
    } catch (err) {
      console.error('Failed to duplicate note tree:', err)
    }
  }

  const handleTemplateCreate = (parentId: string | null) => {
    setTemplateModal({ isOpen: true, mode: 'select', parentId })
  }

  const handleSaveAsTemplate = () => {
    setTemplateModal({ isOpen: true, mode: 'save', parentId: null })
  }

  const handleSelectTemplate = async (template: NoteTemplate) => {
    try {
      const created = await api.createNote({
        title: template.name,
        icon: template.icon || '📝',
        content: template.content,
        tags: [],
        notebook_id: null,
        parent_id: templateModal.parentId ? parseInt(templateModal.parentId, 10) : null,
        is_title_manually_edited: false,
        type: 'note',
        is_folder: false,
        background_paper: 'none',
        sort_key: 'm',
        stickers: [],
        sticky_notes: [],
      })

      const nextNote = mergeNote(undefined, created)
      setNotes(prev => [...prev, nextNote])
      setCurrentNoteId(nextNote.id)
      setActiveView('notes')
      setTemplateModal(prev => ({ ...prev, isOpen: false }))
    } catch (err) {
      console.error('Failed to create note from template:', err)
    }
  }

  const handleSaveTemplate = async (name: string) => {
    if (!currentNote) return

    try {
      await api.createTemplate({
        name,
        content: currentNote.content || '',
        icon: currentNote.icon,
        category: '用户模板',
      })
      console.log('Template saved successfully')
    } catch (err) {
      console.error('Failed to save template:', err)
    }
  }

  const handleSave = async (payload: Partial<Note>) => {
    const targetId = typeof payload.id === 'number' ? payload.id : currentNoteId
    if (targetId === null) {
      return
    }

    const persistedNote = notesRef.current.find(note => (
      note.id === targetId ||
      (payload.file_path ? note.file_path === payload.file_path : false)
    ))

    const payloadWithFilePath = {
      ...payload,
      ...(payload.file_path === undefined && persistedNote?.file_path
        ? { file_path: persistedNote.file_path }
        : {}),
    }

    const computedLinks = payloadWithFilePath.links ?? (
      payloadWithFilePath.content !== undefined ? extractLinkedNoteIds(payloadWithFilePath.content) : undefined
    )
    const shouldSkipRenameSync = Boolean((payloadWithFilePath as Partial<Note> & { rename_file?: boolean }).rename_file)

    const optimisticPatch = {
      ...payloadWithFilePath,
      id: targetId,
      ...(computedLinks !== undefined ? { links: computedLinks } : {}),
      updated_at: new Date().toISOString(),
    } as Note

    applyNotePatch(targetId, optimisticPatch)

    try {
      const updated = await api.updateNote(targetId, payloadWithFilePath)
      applyNotePatch(targetId, updated)

      // 增量更新全文搜索索引
      if (!updated.is_folder) {
        searchIndex.updateNote({
          id: updated.id,
          title: updated.title,
          content: buildSearchableText(updated),
          tags: updated.tags || [],
          type: updated.type,
        })
      }

      if (!shouldSkipRenameSync) {
        scheduleFileRename(updated)
      }
      return updated
    } catch (err) {
      if (err instanceof Error && /note\s+\d+\s+not found/i.test(err.message) && payloadWithFilePath.file_path) {
        try {
          const recovered = await retrySaveByFilePath(targetId, payloadWithFilePath)
          if (recovered) {
            applyNotePatch(targetId, recovered)
            if (!shouldSkipRenameSync) {
              scheduleFileRename(recovered)
            }
            return recovered
          }
        } catch (retryErr) {
          console.error('Failed to recover stale note id during save:', retryErr)
        }
      }
      console.error('Failed to save note:', err)
    }
  }

  const handleLiveChange = useCallback((payload: Partial<Note>) => {
    const targetId = typeof payload.id === 'number' ? payload.id : currentNoteId
    if (targetId === null) {
      return
    }

    const computedLinks = payload.links ?? (
      payload.content !== undefined ? extractLinkedNoteIds(payload.content) : undefined
    )

    applyNotePatch(targetId, {
      ...payload,
      id: targetId,
      ...(computedLinks !== undefined ? { links: computedLinks } : {}),
      updated_at: new Date().toISOString(),
    })
  }, [applyNotePatch, currentNoteId])

  return (
    <AIProvider>
      <MusicProvider>
        <HabitProvider>
          <TodoProvider>
            <div className="flex h-screen w-full bg-background text-foreground font-sans selection:bg-primary/30 overflow-hidden relative theme-transition">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(var(--primary),0.05),transparent_70%)] pointer-events-none z-0" />
              <div className="absolute inset-0 opacity-[0.4] pointer-events-none z-0" style={{ backgroundImage: 'var(--paper-texture)' }} />

              <SidebarTree
                initialNodes={treeNodes}
                notes={notes}
                selectedNodeId={currentNoteId?.toString() ?? null}
                onNodeSelect={handleSelectNode}
                onNodeAdd={handleAddNote}
                onNodeMove={handleNodeMove}
                onNodeRename={handleNodeRename}
                onNodeDelete={handleNodeDelete}
                onNodeDuplicate={handleNodeDuplicate}
                onTemplateCreate={handleTemplateCreate}
                onQuickSearchOpen={() => setIsCommandPaletteOpen(true)}
                onSettingsOpen={() => setIsSettingsOpen(true)}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={toggleSidebar}
              />

              <motion.main
                initial={false}
                animate={{
                  scale: isSidebarCollapsed ? 1 : 0.98,
                  borderRadius: isSidebarCollapsed ? '0px' : '24px',
                  x: 0,
                }}
                transition={{
                  duration: 0.5,
                  ease: [0.32, 0.72, 0, 1],
                }}
                className="flex-1 h-full relative overflow-hidden flex flex-col z-10 bg-background shadow-[0_0_50px_rgba(0,0,0,0.1)] origin-left"
              >
                {!isSidebarCollapsed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/5 z-50 pointer-events-none"
                  />
                )}

                <AnimatePresence mode="wait">
                  <motion.div
                    key={`note-${currentNoteId ?? 'empty'}`}
                    initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -10, filter: 'blur(10px)' }}
                    transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                    className="flex-1 h-full"
                  >
                  {currentNote ? (
                    currentNote.type === 'canvas' ? (
                      <CanvasEditor
                        note={currentNote}
                        notes={notes}
                        onSave={handleSave}
                        onNotify={(text, tone) => console.log(`[NovaNotify] ${tone}: ${text}`)}
                      />
                    ) : (
                      <NovaBlockEditor
                        note={currentNote}
                        onLiveChange={handleLiveChange}
                        onSave={handleSave}
                        onNotify={(text, tone) => console.log(`[NovaNotify] ${tone}: ${text}`)}
                        onSaveAsTemplate={handleSaveAsTemplate}
                      />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      还没有可编辑的笔记，先在左侧创建一篇。
                    </div>
                  )}
                  </motion.div>
                </AnimatePresence>

                <div className="h-px w-full bg-gradient-to-r from-transparent via-white/5 to-transparent absolute bottom-0 left-0" />
              </motion.main>

              <CommandPalette
                isOpen={isCommandPaletteOpen}
                onClose={() => setIsCommandPaletteOpen(false)}
                notes={notes}
                onSelectNote={(note) => handleSelectNode(note.id.toString())}
              />

              <SettingsDialog
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
              />

              <div className="fixed top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent z-50 pointer-events-none" />
              <FloatingMusicCapsule />
              <MusicGlobalUI />

              <TemplatePicker
                isOpen={templateModal.isOpen}
                mode={templateModal.mode}
                onClose={() => setTemplateModal(prev => ({ ...prev, isOpen: false }))}
                onSelect={handleSelectTemplate}
                onSave={handleSaveTemplate}
              />
            </div>
          </TodoProvider>
        </HabitProvider>
      </MusicProvider>
    </AIProvider>
  )
}

export default App
