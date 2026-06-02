import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { NovaBlockEditor } from './components/novablock/NovaBlockEditor'
import { CanvasEditor } from './components/canvas/CanvasEditor'
import { SidebarTree } from './components/sidebar/SidebarTree'
import CommandPalette, { type PaletteAction } from './components/search/CommandPalette'
import { SettingsDialog } from './components/SettingsDialog'
import { TemplatePicker } from './components/editor/TemplatePicker'
import { applyThemeConfig, getThemeConfig } from './lib/themeUtils'
import type { Note, NoteTemplate } from './lib/types'
import { api } from './lib/api'
import { extractLinkedNoteIds, getNotesNeedingFilenameSync, shouldRenameNoteFile } from './lib/noteSync'
import { searchIndex } from './lib/searchIndex'
import { buildSearchableText } from './lib/searchUtils'
import { recordOpen } from './lib/novablock/openHistory'
import { generateSequenceAfter } from './lib/novablock/sortKeyGen'
import { bulkMoveSerially } from './lib/novablock/bulkMove'
import { applyVaultChange } from './lib/novablock/applyVaultChange'
import { migrateLegacyNotes, parseLegacyNotes, shouldRunLegacyMigration } from './lib/legacyLocalMigration'
import { AnimatePresence, motion } from 'framer-motion'
import { MusicProvider, useMusicControls } from './contexts/MusicContext'
import { HabitProvider } from './contexts/HabitContext'
import { TodoProvider } from './contexts/TodoContext'
import { AIProvider } from './contexts/AIContext'
import { AMBIENT_LIST, AmbientSoundProvider, useAmbientSound } from './contexts/AmbientSoundContext'
import { PomodoroProvider, usePomodoro } from './contexts/PomodoroContext'
import { FloatingMusicCapsule } from './components/widgets/FloatingMusicCapsule'
import { PlaylistPopover } from './components/widgets/PlaylistPopover'
import { QuickActionsBar } from './components/widgets/QuickActionsBar'
import { CadenceMeter } from './components/widgets/CadenceMeter'
import { WhiteboardEditorHost } from './components/whiteboard/WhiteboardEditorHost'
import { ReaderMode } from './components/reader/ReaderMode'
import { GraphView } from './components/graph/GraphView'
import { ConceptOrbit } from './components/graph/ConceptOrbit'
import { DailyNotesPanel } from './components/daily/DailyNotesPanel'
import { TaskMirror } from './components/panels/TaskMirror'
import { AskMyNotesPanel } from './components/panels/AskMyNotesPanel'
import { DailyRecapPanel } from './components/panels/DailyRecapPanel'
import { VaultExportDialog } from './components/panels/VaultExportDialog'
import { MarginNotesPanel } from './components/panels/MarginNotesPanel'
import { RichSummaryCardsPanel } from './components/panels/RichSummaryCardsPanel'
import { TimelineView } from './components/timeline/TimelineView'
import { buildDailyNoteContent, formatDailyTitle } from './lib/dailyNotes'
import { buildJournalProperties, parseDailyTitle as parseJournalDailyTitle } from './lib/journal'
import { InspectorPanel } from './components/inspector/InspectorPanel'
import { useNovaTheme, THEME_META, THEME_LIST } from './contexts/ThemeContext'
import { buildCorpus, findBacklinks } from './lib/backlinks'
import { chooseCurrentNoteIdAfterRefresh } from './lib/currentNoteRefresh'
import { suggestTags, suggestTitle } from './lib/autoTag'
import {
  BookOpen as BookOpenIcon,
  Share2 as Share2Icon,
  Calendar as CalendarIcon,
  Settings as SettingsIcon,
  Command as CommandIcon,
  Plus as PlusIcon,
  Sparkles as SparklesIcon,
  FileText as FileTextIcon,
  Tags as TagsIcon,
  Clock as ClockIcon,
  Bookmark as BookmarkIcon,
  CheckSquare as CheckSquareIcon,
  MessageSquare as MessageSquareIcon,
  Activity as ActivityIcon,
  Download as DownloadIcon,
  Link2 as Link2Icon,
  Wand2 as Wand2Icon,
  PanelRight as PanelRightIcon,
  MoreHorizontal as MoreHorizontalIcon,
  Waves as WavesIcon,
  Play as PlayIcon,
  Pause as PauseIcon,
  RotateCcw as RotateCcwIcon,
  Minus as MinimizeIcon,
  Square as MaximizeIcon,
  X as CloseIcon,
} from 'lucide-react'
import { useNoteStore } from './store/useNoteStore'
import {
  applyQingzhiSettings,
  QINGZHI_SETTINGS_EVENT,
  readQingzhiSettings,
  type QingzhiSettings,
  type QingzhiTopbarActionId,
} from './lib/qingzhiSettings'
import { clearPendingBlockJump } from './lib/novablock/blockLinks'

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

function QingzhiTopbarAvatar() {
  const defaultAvatar = '/assets/qingzhi/avatar/default.webp'
  const fallbackAvatar = '/assets/qingzhi/avatar/default.png'
  const [src, setSrc] = useState(() => readQingzhiSettings().avatarSrc || defaultAvatar)
  const [failedFallback, setFailedFallback] = useState(false)

  useEffect(() => {
    const update = () => {
      setFailedFallback(false)
      setSrc(readQingzhiSettings().avatarSrc || defaultAvatar)
    }
    window.addEventListener(QINGZHI_SETTINGS_EVENT, update)
    return () => window.removeEventListener(QINGZHI_SETTINGS_EVENT, update)
  }, [])

  if (failedFallback) {
    return <span data-testid="qingzhi-topbar-avatar-fallback">知</span>
  }

  return (
    <img
      data-testid="qingzhi-topbar-avatar-img"
      src={src}
      alt=""
      onError={() => {
        if (src !== fallbackAvatar) setSrc(fallbackAvatar)
        else setFailedFallback(true)
      }}
    />
  )
}

function QingzhiBrandMark() {
  const defaultLogo = '/assets/qingzhi/logo-mark.png'
  const fallbackLogo = '/assets/qingzhi/logo-mark.webp'
  const [src, setSrc] = useState(() => readQingzhiSettings().brandLogoSrc || defaultLogo)
  const [failedFallback, setFailedFallback] = useState(false)

  useEffect(() => {
    const update = () => {
      setFailedFallback(false)
      setSrc(readQingzhiSettings().brandLogoSrc || defaultLogo)
    }
    window.addEventListener(QINGZHI_SETTINGS_EVENT, update)
    return () => window.removeEventListener(QINGZHI_SETTINGS_EVENT, update)
  }, [])

  if (failedFallback) {
    return <span className="qz-brand-mark-fallback">知</span>
  }

  return (
    <img
      data-testid="qingzhi-brand-logo-img"
      src={src}
      alt=""
      onError={() => {
        if (src !== fallbackLogo) setSrc(fallbackLogo)
        else setFailedFallback(true)
      }}
    />
  )
}

function formatPomodoroRemaining(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.max(0, seconds % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function QingzhiDotMatrixTime({ value }: { value: string }) {
  return (
    <span className="qz-dot-matrix" aria-label={value}>
      {value.split('').map((char, index) => (
        <span
          key={`${char}-${index}`}
          className={`qz-dot-matrix-cell ${char === ':' ? 'qz-dot-matrix-cell-colon' : ''}`}
          aria-hidden="true"
          data-char={char}
        >
          {char}
        </span>
      ))}
    </span>
  )
}

function QingzhiTopbarRuntimeStatus({
  onOpenPanel,
}: {
  onOpenPanel: (panel: 'pomodoro' | 'ambient') => void
}) {
  const pomodoro = usePomodoro()
  const ambient = useAmbientSound()
  const activeAmbient = AMBIENT_LIST.find((item) => item.id === ambient.activeId)

  if (!pomodoro.isRunning && !activeAmbient) return null

  return (
    <div data-testid="qingzhi-topbar-status" className="qz-topbar-status">
      {pomodoro.isRunning && (
        <div data-testid="qingzhi-topbar-pomodoro-chip" className="qz-topbar-status-chip qz-topbar-status-chip-pomodoro">
          <button
            type="button"
            className="qz-topbar-status-chip-main"
            title="打开番茄钟面板"
            onClick={() => onOpenPanel('pomodoro')}
          >
            <span className="qz-topbar-status-chip-label">
              {pomodoro.phase === 'focus' ? `专注 ${pomodoro.currentCycle}/${pomodoro.longBreakEvery}` : pomodoro.isLongBreak ? '长休' : '短休'}
            </span>
            <QingzhiDotMatrixTime value={formatPomodoroRemaining(pomodoro.remaining)} />
          </button>
          <button
            type="button"
            className="qz-topbar-status-chip-close"
            title="关闭番茄钟"
            aria-label="关闭番茄钟"
            onClick={(event) => {
              event.stopPropagation()
              pomodoro.reset()
            }}
          >
            ×
          </button>
        </div>
      )}
      {activeAmbient && (
        <div data-testid="qingzhi-topbar-ambient-chip" className="qz-topbar-status-chip qz-topbar-status-chip-ambient">
          <button
            type="button"
            className="qz-topbar-status-chip-main"
            title="打开白噪音面板"
            onClick={() => onOpenPanel('ambient')}
          >
            <WavesIcon size={13} strokeWidth={2} />
            <span className="qz-topbar-status-chip-label">{activeAmbient.label}</span>
          </button>
          <button
            type="button"
            className="qz-topbar-status-chip-close"
            title="关闭白噪音"
            aria-label="关闭白噪音"
            onClick={(event) => {
              event.stopPropagation()
              ambient.stop()
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

function QingzhiTopbarOverflowRuntimeActions({
  onOpenPanel,
}: {
  onOpenPanel: (panel: 'pomodoro' | 'ambient') => void
}) {
  const pomodoro = usePomodoro()
  const ambient = useAmbientSound()

  return (
    <>
      <div className="qz-topbar-overflow-sep" />
      <button
        type="button"
        data-testid="qingzhi-topbar-overflow-pomodoro"
        className="qz-topbar-overflow-item"
        title="打开番茄钟面板"
        onClick={() => onOpenPanel('pomodoro')}
      >
        <ClockIcon size={14} strokeWidth={2.1} />
        <span>{pomodoro.isRunning ? `番茄钟 · ${formatPomodoroRemaining(pomodoro.remaining)}` : '番茄钟'}</span>
      </button>
      <button
        type="button"
        data-testid="qingzhi-topbar-overflow-ambient"
        className="qz-topbar-overflow-item"
        title="打开白噪音面板"
        onClick={() => onOpenPanel('ambient')}
      >
        <WavesIcon size={14} strokeWidth={2.1} />
        <span>{ambient.activeId ? `白噪音 · ${AMBIENT_LIST.find((item) => item.id === ambient.activeId)?.label ?? ''}` : '白噪音'}</span>
      </button>
    </>
  )
}

function QingzhiTopbarPomodoroPanel({
  onClose,
}: {
  onClose: () => void
}) {
  const {
    phase,
    remaining,
    isRunning,
    start,
    pause,
    reset,
    focusMin,
    breakMin,
    longBreakMin,
    longBreakEvery,
    completedFocusSessions,
    currentCycle,
    isLongBreak,
    setDurations,
  } = usePomodoro()
  const [focusInput, setFocusInput] = useState(String(focusMin))
  const [breakInput, setBreakInput] = useState(String(breakMin))
  const [longBreakInput, setLongBreakInput] = useState(String(longBreakMin))
  const [cycleInput, setCycleInput] = useState(String(longBreakEvery))

  useEffect(() => {
    setFocusInput(String(focusMin))
    setBreakInput(String(breakMin))
    setLongBreakInput(String(longBreakMin))
    setCycleInput(String(longBreakEvery))
  }, [focusMin, breakMin, longBreakMin, longBreakEvery])

  const phaseLabel = phase === 'idle'
    ? '准备开始'
    : phase === 'focus'
      ? `专注 ${currentCycle}/${longBreakEvery}`
      : isLongBreak
        ? '长休中'
        : '短休中'

  const workflowHint = phase === 'idle'
    ? `${focusMin} 分钟专注 / ${breakMin} 分钟短休 / ${longBreakMin} 分钟长休`
    : phase === 'focus'
      ? `第 ${currentCycle}/${longBreakEvery} 轮专注，完成后自动进入休息`
      : isLongBreak
        ? `已完成 ${completedFocusSessions} 轮专注，正在长休`
        : `已完成 ${completedFocusSessions} 轮专注，正在短休`

  return (
    <motion.div
      key="qingzhi-topbar-pomodoro-panel"
      data-testid="qingzhi-topbar-pomodoro-panel"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.16 }}
      className="qz-topbar-runtime-panel"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="qz-topbar-runtime-panel-head">
        <div>
          <div className="qz-topbar-runtime-title">番茄钟</div>
          <div className="qz-topbar-runtime-subtle">{workflowHint}</div>
        </div>
        <button type="button" className="qz-topbar-runtime-dismiss" onClick={onClose} aria-label="关闭番茄钟面板">×</button>
      </div>

      <div className="qz-topbar-runtime-display">
        <QingzhiDotMatrixTime value={formatPomodoroRemaining(remaining)} />
      </div>

      <div className="qz-topbar-runtime-subtle" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>{phaseLabel}</span>
        <span>完成 {completedFocusSessions} 轮</span>
      </div>

      <div className="qz-topbar-runtime-actions">
        <button
          type="button"
          data-testid="qingzhi-pomodoro-start"
          className="qz-topbar-runtime-btn"
          onClick={() => {
            if (isRunning) pause()
            else start()
          }}
        >
          {isRunning ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
          <span>{isRunning ? '暂停' : phase === 'idle' ? '开始专注' : '继续'}</span>
        </button>
        <button type="button" data-testid="qingzhi-pomodoro-reset" className="qz-topbar-runtime-btn" onClick={reset}>
          <RotateCcwIcon size={13} />
          <span>重置</span>
        </button>
      </div>

      <div className="qz-topbar-runtime-settings">
        <label>
          <span>专注</span>
          <input data-testid="qingzhi-pomodoro-focus-input" type="number" min={1} max={120} value={focusInput} onChange={(e) => setFocusInput(e.target.value)} />
        </label>
        <label>
          <span>短休</span>
          <input data-testid="qingzhi-pomodoro-break-input" type="number" min={1} max={60} value={breakInput} onChange={(e) => setBreakInput(e.target.value)} />
        </label>
        <label>
          <span>长休</span>
          <input data-testid="qingzhi-pomodoro-long-break-input" type="number" min={1} max={90} value={longBreakInput} onChange={(e) => setLongBreakInput(e.target.value)} />
        </label>
        <label>
          <span>轮次</span>
          <input data-testid="qingzhi-pomodoro-cycle-input" type="number" min={2} max={8} value={cycleInput} onChange={(e) => setCycleInput(e.target.value)} />
        </label>
        <button
          type="button"
          data-testid="qingzhi-pomodoro-apply"
          className="qz-topbar-runtime-btn qz-topbar-runtime-btn-ghost"
          onClick={() => setDurations(
            parseInt(focusInput || '25', 10),
            parseInt(breakInput || '5', 10),
            parseInt(longBreakInput || '15', 10),
            parseInt(cycleInput || '4', 10),
          )}
        >
          应用
        </button>
      </div>
    </motion.div>
  )
}
function QingzhiTopbarAmbientPanel({
  onClose,
}: {
  onClose: () => void
}) {
  const { activeId, volume, toggle, setVolume, stop } = useAmbientSound()

  return (
    <motion.div
      key="qingzhi-topbar-ambient-panel"
      data-testid="qingzhi-topbar-ambient-panel"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.16 }}
      className="qz-topbar-runtime-panel"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="qz-topbar-runtime-panel-head">
        <div>
          <div className="qz-topbar-runtime-title">白噪音</div>
          <div className="qz-topbar-runtime-subtle">{activeId ? '正在播放环境声' : '选择一个场景开始播放'}</div>
        </div>
        <button type="button" className="qz-topbar-runtime-dismiss" onClick={onClose} aria-label="关闭白噪音面板">×</button>
      </div>

      <div className="qz-topbar-runtime-scene-grid">
        {AMBIENT_LIST.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`qingzhi-ambient-scene-${item.id}`}
            className="qz-topbar-runtime-scene"
            data-active={String(activeId === item.id)}
            onClick={() => toggle(item.id)}
            title={item.hint}
          >
            <span className="qz-topbar-runtime-scene-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="qz-topbar-runtime-settings">
        <label className="qz-topbar-runtime-range">
          <span>音量</span>
          <input data-testid="qingzhi-ambient-volume" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} />
        </label>
        <button type="button" data-testid="qingzhi-ambient-stop" className="qz-topbar-runtime-btn qz-topbar-runtime-btn-ghost" onClick={stop}>
          停止播放
        </button>
      </div>
    </motion.div>
  )
}

export function mergeNote(existing: Note | undefined, incoming: Note): Note {
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

export function nextNoteSaveSequence(sequenceMap: Map<number, number>, noteId: number) {
  const nextSequence = (sequenceMap.get(noteId) ?? 0) + 1
  sequenceMap.set(noteId, nextSequence)
  return nextSequence
}

export function isLatestNoteSaveSequence(sequenceMap: Map<number, number>, noteId: number, sequence: number) {
  return (sequenceMap.get(noteId) ?? 0) === sequence
}

export function updatePendingNoteSaveCount(pendingMap: Map<number, number>, noteId: number, delta: number) {
  const nextCount = Math.max(0, (pendingMap.get(noteId) ?? 0) + delta)
  if (nextCount === 0) {
    pendingMap.delete(noteId)
  } else {
    pendingMap.set(noteId, nextCount)
  }
  return nextCount
}

export function pickCurrentNoteId(notes: Note[], preferredId?: number | null) {
  if (preferredId && notes.some(note => note.id === preferredId)) {
    return preferredId
  }
  // 稳定性修复：只有在确实没选中任何笔记时才默认跳转到第一个
  return notes.find(note => !note.is_folder)?.id ?? notes[0]?.id ?? null
}

const LEGACY_MIGRATION_FLAG = 'nova-block-vault-migration-completed'

type VaultChangePayload = {
  eventType?: string
  filename?: string | null
}

const normalizeVaultChangePath = (filename: string | null | undefined) => (
  filename ? filename.replace(/\//g, '\\').toLowerCase() : ''
)

function App() {
  const [theme] = useState<'dark' | 'light'>('light')
  const notes = useNoteStore((state) => state.notes)
  const setNotes = useNoteStore((state) => state.setNotes)
  const currentNoteId = useNoteStore((state) => state.currentNoteId)
  const setCurrentNoteId = useNoteStore((state) => state.setCurrentNoteId)
  const updateNote = useNoteStore((state) => state.updateNote)

  const [activeView, setActiveView] = useState<'notes'>('notes')
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [appToast, setAppToast] = useState<{ text: string; tone: 'success' | 'error' | 'info' } | null>(null)
  const appToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isReaderOpen, setIsReaderOpen] = useState(false)
  const [isGraphOpen, setIsGraphOpen] = useState(false)
  const [isConceptOrbitOpen, setIsConceptOrbitOpen] = useState(false)
  const [isMarginOpen, setIsMarginOpen] = useState(false)
  const [isRichSummaryOpen, setIsRichSummaryOpen] = useState(false)
  const [isTimelineOpen, setIsTimelineOpen] = useState(false)
  const [isDailyOpen, setIsDailyOpen] = useState(false)
  const [isInspectorOpen, setIsInspectorOpen] = useState(false)
  const [isTypewriterOn, setIsTypewriterOn] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isTopbarOverflowOpen, setIsTopbarOverflowOpen] = useState(false)
  const [openTopbarRuntimePanel, setOpenTopbarRuntimePanel] = useState<null | 'pomodoro' | 'ambient'>(null)
  const topbarOverflowRef = useRef<HTMLDivElement | null>(null)
  const [isTaskMirrorOpen, setIsTaskMirrorOpen] = useState(false)
  const [isAskOpen, setIsAskOpen] = useState(false)
  const [isRecapOpen, setIsRecapOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [qingzhiSettings, setQingzhiSettings] = useState<QingzhiSettings>(() => readQingzhiSettings())
  const [qingzhiEmptyState, setQingzhiEmptyState] = useState<'notes' | 'night'>('notes')
  const [pageTurnKey, setPageTurnKey] = useState(0)
  const [pageTurnDir, setPageTurnDir] = useState<1 | -1>(1)
  const [templateModal, setTemplateModal] = useState<{
    isOpen: boolean
    mode: 'select' | 'save'
    parentId: string | null
  }>({ isOpen: false, mode: 'select', parentId: null })
  const renameTimersRef = useRef<Map<number, number>>(new Map())
  const saveSequenceRef = useRef<Map<number, number>>(new Map())
  const pendingSaveCountsRef = useRef<Map<number, number>>(new Map())
  const protectedCurrentNoteIdRef = useRef<number | null>(null)
  // Round 5 · Bug D: 批量移动期间抑制 vault watcher 的删除操作,
  // 避免 chokidar 事件(unlink 旧路径)在 backend 尚未完成文件移动时误删笔记。
  const vaultDeleteSuppressedIdsRef = useRef<Set<number>>(new Set())

  const toggleSidebar = (collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed)
  }

  useEffect(() => {
    applyQingzhiSettings(qingzhiSettings)
  }, [qingzhiSettings])

  useEffect(() => {
    const handleSettingsChange = (event: Event) => {
      setQingzhiSettings((event as CustomEvent<QingzhiSettings>).detail ?? readQingzhiSettings())
    }
    window.addEventListener(QINGZHI_SETTINGS_EVENT, handleSettingsChange)
    return () => window.removeEventListener(QINGZHI_SETTINGS_EVENT, handleSettingsChange)
  }, [])

  useEffect(() => {
    if (!isTopbarOverflowOpen && !openTopbarRuntimePanel) return
    const handleClickOutside = (event: MouseEvent) => {
      if (topbarOverflowRef.current && !topbarOverflowRef.current.contains(event.target as Node)) {
        setIsTopbarOverflowOpen(false)
        setOpenTopbarRuntimePanel(null)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [isTopbarOverflowOpen, openTopbarRuntimePanel])

  const qingzhiTopbarActions = useMemo(() => [
    { id: 'daily', label: '日历', hint: '打开 Daily Notes', Icon: CalendarIcon, run: () => setIsDailyOpen(true) },
    { id: 'command', label: '命令面板', hint: '打开命令面板', Icon: CommandIcon, run: () => setIsCommandPaletteOpen(true) },
    { id: 'reader', label: '阅读', hint: '进入阅读模式', Icon: BookOpenIcon, run: () => setIsReaderOpen(true) },
    { id: 'inspect', label: '检视', hint: '打开检视面板', Icon: PanelRightIcon, run: () => setIsInspectorOpen((open) => !open) },
    { id: 'graph', label: '图谱', hint: '打开 Graph View', Icon: Share2Icon, run: () => setIsGraphOpen(true) },
    { id: 'ask', label: 'AI 灵感', hint: 'Ask My Notes', Icon: MessageSquareIcon, run: () => setIsAskOpen(true) },
    { id: 'task-mirror', label: '任务', hint: '打开任务镜像', Icon: CheckSquareIcon, run: () => setIsTaskMirrorOpen(true) },
    { id: 'recap', label: '回顾', hint: '打开每日回顾', Icon: ActivityIcon, run: () => setIsRecapOpen(true) },
    { id: 'timeline', label: '时间轴', hint: '打开时间轴', Icon: ClockIcon, run: () => setIsTimelineOpen(true) },
    { id: 'export', label: '导出', hint: '导出静态站点', Icon: DownloadIcon, run: () => setIsExportOpen(true) },
    { id: 'concept-orbit', label: '概念轨道', hint: '打开 Concept Orbit', Icon: SparklesIcon, run: () => setIsConceptOrbitOpen(true) },
    { id: 'rich-summary', label: '摘要卡片', hint: '打开 Rich Summary', Icon: FileTextIcon, run: () => setIsRichSummaryOpen(true) },
    { id: 'settings', label: '设置', hint: '打开设置', Icon: SettingsIcon, run: () => setIsSettingsOpen(true) },
  ], [])

  const qingzhiActionById = useMemo(
    () => new Map(qingzhiTopbarActions.map((action) => [action.id, action])),
    [qingzhiTopbarActions],
  )
  const qingzhiPinnedTopbarActions = useMemo(
    () => qingzhiSettings.topbarPins
      .map((id) => qingzhiActionById.get(id))
      .filter((action): action is NonNullable<typeof action> => Boolean(action)),
    [qingzhiActionById, qingzhiSettings.topbarPins],
  )

  const notifyApp = useCallback((text: string, tone: 'success' | 'error' | 'info' = 'info') => {
    console.log(`[NovaNotify] ${tone}: ${text}`)
    setAppToast({ text, tone })
    if (appToastTimerRef.current) {
      clearTimeout(appToastTimerRef.current)
    }
    appToastTimerRef.current = setTimeout(() => {
      setAppToast(null)
      appToastTimerRef.current = null
    }, tone === 'error' ? 5200 : 3600)
  }, [])

  useEffect(() => (
    () => {
      if (appToastTimerRef.current) {
        clearTimeout(appToastTimerRef.current)
      }
    }
  ), [])
  const qingzhiOverflowTopbarActions = useMemo(
    () => qingzhiTopbarActions.filter((action) => !qingzhiSettings.topbarPins.includes(action.id as QingzhiTopbarActionId)),
    [qingzhiSettings.topbarPins, qingzhiTopbarActions],
  )

  const handleWindowControl = useCallback((action: 'minimize' | 'maximize' | 'close') => {
    void window.electron?.ipcInvoke?.('desktop:window-control', { action }).catch((error: unknown) => {
      console.warn('[qingzhi] window control unavailable', action, error)
    })
  }, [])

  const qingzhiEmptyCopy = qingzhiEmptyState === 'night'
    ? {
        title: '夜深了，先把脑海里的微光存下来',
        body: '清知会把这一点灵感守在宣纸里，等你明天继续展开。',
        sticker: '/assets/qingzhi/stickers/13-hmm.webp',
      }
    : {
        title: '让清知陪你写下第一片叶子',
        body: '从左侧新建一篇笔记，或用命令面板把脑海里的线索变成卡片。',
        sticker: '/assets/qingzhi/stickers/16-welcome.webp',
      }

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
    const existing = useNoteStore.getState().notes.find(n => n.id === targetId)
    
    updateNote(targetId, {
      ...patch,
      ...(existing ? mergeNote(existing, patch as Note) : {}),
      id: nextId,
    })

    if (nextId !== targetId) {
      setCurrentNoteId(prev => (prev === targetId ? nextId : prev) as any)
    }
  }, [updateNote, setCurrentNoteId])

  const hasPendingNoteSave = useCallback((noteId: number) => {
    return (pendingSaveCountsRef.current.get(noteId) ?? 0) > 0
  }, [])

  const commitPersistedNote = useCallback((targetId: number, updated: Note) => {
    applyNotePatch(targetId, updated)

    if (!updated.is_folder) {
      searchIndex.updateNote({
        id: updated.id,
        title: updated.title,
        content: buildSearchableText(updated),
        tags: updated.tags || [],
        type: updated.type ?? 'note',
      })
    }
  }, [applyNotePatch])

  const scheduleFileRename = useCallback((noteLike: Partial<Note>, delayMs = 900) => {
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

      const latest = useNoteStore.getState().notes.find(note => (
        note.id === noteLike.id ||
        (noteLike.file_path ? note.file_path === noteLike.file_path : false)
      ))

      if (!latest || !shouldRenameNoteFile(latest)) {
        return
      }

      if (hasPendingNoteSave(latest.id)) {
        scheduleFileRename(latest, 180)
        return
      }

      const sequence = nextNoteSaveSequence(saveSequenceRef.current, latest.id)
      updatePendingNoteSaveCount(pendingSaveCountsRef.current, latest.id, 1)

      try {
        const renamed = await api.updateNote(latest.id, {
          title: latest.title,
          file_path: latest.file_path,
          is_title_manually_edited: latest.is_title_manually_edited,
          rename_file: true,
        })
        if (isLatestNoteSaveSequence(saveSequenceRef.current, latest.id, sequence)) {
          commitPersistedNote(latest.id, renamed)
        }
      } catch (err) {
        console.error('Failed to sync filename with note title:', err)
      } finally {
        updatePendingNoteSaveCount(pendingSaveCountsRef.current, latest.id, -1)
      }
    }, delayMs)

    renameTimersRef.current.set(noteLike.id, timerId)
  }, [commitPersistedNote, hasPendingNoteSave])

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
      if ((pendingSaveCountsRef.current.get(note.id) ?? 0) > 0) continue
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

    const prevNotes = useNoteStore.getState().notes
    setNotes(loadedNotes.map(note => {
      const previous = prevNotes.find(item => item.id === note.id)
      const merged = mergeNote(previous, note)

      if (previous && hasPendingNoteSave(note.id)) {
        return {
          ...merged,
          title: previous.title,
          content: previous.content ?? merged.content,
          is_title_manually_edited: previous.is_title_manually_edited,
        }
      }

      return merged
    }))
    
    // 稳定性核心修复：只要当前 ID 还在列表中，就绝对不改变它
    setCurrentNoteId((prev: number | null) => {
      return chooseCurrentNoteIdAfterRefresh({
        previousId: prev,
        preferredId: nextPreferredId,
        protectedId: protectedCurrentNoteIdRef.current,
        notes: loadedNotes,
        pickFallback: pickCurrentNoteId,
      });
    })

    // 构建全文搜索索引
    searchIndex.buildIndex(
      loadedNotes
        .filter((n) => !n.is_folder)
        .map((n) => ({
          id: n.id,
          title: n.title,
          content: buildSearchableText(n),
          tags: n.tags || [],
          type: n.type ?? 'note',
        }))
    )

    return loadedNotes
  }, [hasPendingNoteSave])

  const handleVaultChanged = useCallback(async (payload: VaultChangePayload | VaultChangePayload[]) => {
    const changes = (Array.isArray(payload) ? payload : [payload]).filter(Boolean)
    // ─── Round 5 · Bug D 诊断日志 ───
    console.group('%c[VaultWatcher]', 'color:#e91e63;font-weight:bold', new Date().toISOString())
    console.log('raw payload:', JSON.stringify(changes, null, 2))
    // ─── end diag header ───
    if (changes.length === 0) {
      console.log('empty changes, skipping')
      console.groupEnd()
      return
    }

    const shouldReloadAll = changes.some(change => (
      !change.filename ||
      change.eventType === 'addDir' ||
      change.eventType === 'unlinkDir'
    ))
    if (shouldReloadAll) {
      console.log('[VaultWatcher] shouldReloadAll=true → loadNotes')
      console.groupEnd()
      await loadNotes(currentNoteId)
      return
    }

    const deletedPaths = new Set(
      changes
        .filter(change => change.eventType === 'unlink')
        .map(change => normalizeVaultChangePath(change.filename))
        .filter(Boolean),
    )
    const changedFilenames = changes
      .filter(change => change.eventType !== 'unlink' && change.filename)
      .map(change => change.filename as string)

    const changedNotes = changedFilenames.length > 0
      ? await api.getChangedNotes(changedFilenames)
      : []

    // ─── Round 5 · Bug D 诊断日志 (续) ───
    console.log('[VaultWatcher] deletedPaths:', [...deletedPaths])
    console.log('[VaultWatcher] changedFilenames:', changedFilenames)
    console.log('[VaultWatcher] changedNotes (from backend):', changedNotes.map(n => ({ id: n.id, file_path: (n as any).file_path, title: n.title })))
    const previousNotes = useNoteStore.getState().notes
    console.log('[VaultWatcher] previousNotes count:', previousNotes.length, 'ids:', previousNotes.map(n => n.id))
    console.log('[VaultWatcher] suppressedIds:', [...vaultDeleteSuppressedIdsRef.current])
    // ─── end diag ───

    // Round 5 · Bug D: 将正在被批量移动的笔记 id 加入 changedIds,
    // 这样即使 chokidar 的 unlink 先于 add/change 到达,也不会误删。
    const suppressedIds = vaultDeleteSuppressedIdsRef.current

    const nextNotes = applyVaultChange<Note>({
      previousNotes,
      changedNotes,
      deletedPaths,
      normalizePath: normalizeVaultChangePath,
      merger: (previous, incoming) => {
        const merged = mergeNote(previous as Note | undefined, incoming as Note)
        if (previous && hasPendingNoteSave(previous.id)) {
          return {
            ...merged,
            title: previous.title,
            content: previous.content ?? merged.content,
            is_title_manually_edited: previous.is_title_manually_edited,
          }
        }
        return merged
      },
      // Round 5 · Bug D: 传入 suppressedIds,这些笔记即使匹配 deletedPaths 也不删
      suppressedIds,
    })

    // ─── Round 5 · Bug D 诊断: 结果对比 ───
    const removedNotes = previousNotes.filter(p => !nextNotes.some(n => n.id === p.id))
    const addedNotes = nextNotes.filter(n => !previousNotes.some(p => p.id === n.id))
    if (removedNotes.length > 0) {
      console.warn('[VaultWatcher] ⚠️ NOTES REMOVED:', removedNotes.map(n => ({ id: n.id, file_path: n.file_path, title: n.title })))
    }
    if (addedNotes.length > 0) {
      console.log('[VaultWatcher] notes added:', addedNotes.map(n => ({ id: n.id, file_path: n.file_path, title: n.title })))
    }
    console.log('[VaultWatcher] nextNotes count:', nextNotes.length)
    console.groupEnd()
    // ─── end diag ───

    setNotes(nextNotes)
    for (const removed of previousNotes) {
      if (!nextNotes.some(note => note.id === removed.id)) {
        searchIndex.removeNote(removed.id)
      }
    }
    for (const note of changedNotes) {
      if (!note.is_folder) {
        searchIndex.updateNote({
          id: note.id,
          title: note.title,
          content: buildSearchableText(note),
          tags: note.tags || [],
          type: note.type ?? 'note',
        })
      }
    }
    setCurrentNoteId(prev => {
      return chooseCurrentNoteIdAfterRefresh({
        previousId: prev,
        fallbackId: currentNoteId,
        protectedId: protectedCurrentNoteIdRef.current,
        notes: nextNotes,
        pickFallback: pickCurrentNoteId,
      })
    })
  }, [currentNoteId, hasPendingNoteSave, loadNotes, setCurrentNoteId, setNotes])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsCommandPaletteOpen(prev => !prev)
      }
    }

    const handleSelectNoteEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ noteId?: number | string; blockId?: string; blockLabel?: string }>
      const noteId = customEvent.detail?.noteId
      if (noteId) {
        const numericNoteId = Number(noteId)
        const targetNote = useNoteStore.getState().notes.find(note => (
          Number(note.id) === numericNoteId &&
          !note.deleted_at &&
          !note.is_folder
        ))
        if (!targetNote) {
          clearPendingBlockJump()
          window.dispatchEvent(new CustomEvent('nova:block-jump-failed', {
            detail: {
              reason: 'missing-note',
              noteId: numericNoteId,
              blockId: customEvent.detail?.blockId,
              blockLabel: customEvent.detail?.blockLabel,
            },
          }))
          return
        }
        protectedCurrentNoteIdRef.current = null
        setCurrentNoteId(numericNoteId)
        setActiveView('notes')
      }
    }

    const handleNotesInvalidateEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ noteId?: number | string }>
      const noteId = Number(customEvent.detail?.noteId)
      if (!Number.isFinite(noteId)) {
        return
      }
      protectedCurrentNoteIdRef.current = noteId
      setCurrentNoteId(noteId)
      setActiveView('notes')
      loadNotes(noteId).catch(err => {
        console.error('Failed to reload notes after invalidation:', err)
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('nova-select-note', handleSelectNoteEvent)
    window.addEventListener('nova:notes-invalidate', handleNotesInvalidateEvent)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('nova-select-note', handleSelectNoteEvent)
      window.removeEventListener('nova:notes-invalidate', handleNotesInvalidateEvent)
    }
  }, [loadNotes])

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

    const unsubscribe = window.electron.onVaultChanged((payload) => {
      handleVaultChanged(payload).catch(err => {
        console.error('Failed to refresh notes after vault change:', err)
      })
    })

    return () => {
      unsubscribe?.()
    }
  }, [handleVaultChanged])

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

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (isTypewriterOn) {
      document.body.dataset.typewriter = 'true'
    } else {
      delete document.body.dataset.typewriter
    }
  }, [isTypewriterOn])

  // 全局快捷键：⌘K 打开命令面板；⌘⇧R 阅读模式；⌘⇧G 图谱；⌘⇧D Daily Notes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      const key = e.key.toLowerCase()
      if (key === 'k' && !e.shiftKey) {
        e.preventDefault()
        setIsCommandPaletteOpen((v) => !v)
      } else if (key === 'f' && !e.shiftKey && !e.altKey) {
        // v0.21.3 · ⌘F / Ctrl+F 快速进入全局搜索
        e.preventDefault()
        setIsCommandPaletteOpen(true)
      } else if (e.shiftKey && key === 'r') {
        e.preventDefault()
        setIsReaderOpen((v) => !v)
      } else if (e.shiftKey && key === 'g') {
        e.preventDefault()
        setIsGraphOpen((v) => !v)
      } else if (e.shiftKey && key === 'd') {
        e.preventDefault()
        setIsDailyOpen((v) => !v)
      } else if (!e.shiftKey && (key === '.' || e.code === 'Period')) {
        e.preventDefault()
        setIsInspectorOpen((v) => !v)
      } else if (!e.shiftKey && key === 't') {
        // ⌘T 打字机模式（非 ⌘⇧T）
        e.preventDefault()
        setIsTypewriterOn((v) => !v)
      } else if (e.shiftKey && key === 'm') {
        // ⌘⇧M 任务镜像
        e.preventDefault()
        setIsTaskMirrorOpen((v) => !v)
      } else if (e.shiftKey && key === 'a') {
        // ⌘⇧A Ask My Notes
        e.preventDefault()
        setIsAskOpen((v) => !v)
      } else if (e.shiftKey && key === 'e') {
        // ⌘⇧E 导出静态站
        e.preventDefault()
        setIsExportOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // B5 翻页：Alt + ← / → 按笔记列表切换，rotateY 动画
  useEffect(() => {
    const onArrow = (e: KeyboardEvent) => {
      if (!e.altKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      // ignore when typing in inputs
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const currentNotes = useNoteStore.getState().notes.filter(n => !n.is_folder)
      if (currentNotes.length === 0) return
      const curId = useNoteStore.getState().currentNoteId
      const idx = currentNotes.findIndex(n => n.id === curId)
      if (idx === -1) return
      e.preventDefault()
      const dir = e.key === 'ArrowRight' ? 1 : -1
      const nextIdx = (idx + dir + currentNotes.length) % currentNotes.length
      setPageTurnDir(dir as 1 | -1)
      setPageTurnKey(k => k + 1)
      setCurrentNoteId(currentNotes[nextIdx].id)
    }
    window.addEventListener('keydown', onArrow)
    return () => window.removeEventListener('keydown', onArrow)
  }, [setCurrentNoteId])

  const currentNote = useMemo(() => {
    if (currentNoteId === null) {
      return null
    }
    return notes.find(note => note.id === currentNoteId) || null
  }, [notes, currentNoteId])

  const isCanvasNote = useMemo(() => {
    if (!currentNote) return false
    if (currentNote.type === 'canvas') return true
    
    // 兜底检测内容特征
    const content = currentNote.content?.trim()
    if (content?.startsWith('{') && content?.endsWith('}')) {
      try {
        const parsed = JSON.parse(content)
        return parsed && typeof parsed === 'object' && Array.isArray(parsed.nodes)
      } catch {
        return false
      }
    }
    return false
  }, [currentNote])

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

  const handleSelectNode = (id: string) => {
    const noteId = parseInt(id, 10)
    if (!Number.isNaN(noteId)) {
      protectedCurrentNoteIdRef.current = null
      setCurrentNoteId(noteId)
      setActiveView('notes')
      // F2c · 记录最近打开时间(用于侧边栏"最近打开"排序)
      recordOpen(String(noteId))
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
          type: nextNote.type ?? 'note',
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

  const handleCreateDailyNote = useCallback(async (title: string, content: string) => {
    try {
      const dailyDate = parseJournalDailyTitle(title)?.dateKey || formatDailyTitle(new Date())
      const created = await api.createNote({
        title,
        icon: '📅',
        content,
        type: 'note',
        tags: ['daily'],
        notebook_id: null,
        parent_id: null,
        is_folder: false,
        is_title_manually_edited: true,
        background_paper: 'none',
        sort_key: 'm',
        stickers: [],
        sticky_notes: [],
        properties: buildJournalProperties('daily', dailyDate),
      })
      const nextNote = mergeNote(undefined, created)
      setNotes(prev => [...prev, nextNote])
      if (!nextNote.is_folder) {
        searchIndex.addNote({
          id: nextNote.id,
          title: nextNote.title,
          content: buildSearchableText(nextNote),
          tags: nextNote.tags || [],
          type: nextNote.type ?? 'note',
        })
      }
      return nextNote
    } catch (err) {
      console.error('Failed to create daily note:', err)
      return null
    }
  }, [setNotes])

  const handleNodeMove = async (nodeId: string, parentId: string | null, sortKey: string) => {
    const noteId = parseInt(nodeId, 10)
    const nextParentId = parentId ? parseInt(parentId, 10) : null

    setNotes(prev => prev.map(note => (
      note.id === noteId ? { ...note, parent_id: nextParentId, sort_key: sortKey } : note
    )))

    // Round 5 · Bug D: 单条移动也需要抑制 vault watcher 删除
    vaultDeleteSuppressedIdsRef.current.add(noteId)

    try {
      const updated = await api.updateNote(noteId, { parent_id: nextParentId, sort_key: sortKey })
      setNotes(prev => prev.map(note => note.id === noteId ? mergeNote(note, updated) : note))
    } catch (err) {
      console.error('Failed to move note:', err)
      await loadNotes(currentNoteId)
    } finally {
      setTimeout(() => {
        vaultDeleteSuppressedIdsRef.current.delete(noteId)
      }, 3000)
    }
  }

  const handleNodesBulkMove = async (nodeIds: string[], parentId: string | null) => {
    if (!nodeIds || nodeIds.length === 0) return
    const numericIds = nodeIds.map(id => parseInt(id, 10)).filter(n => !Number.isNaN(n))
    if (numericIds.length === 0) return
    const nextParentId = parentId ? parseInt(parentId, 10) : null

    const snapshot = useNoteStore.getState().notes
    // Compute starting sort_key after the last existing sibling under the new parent
    const siblings = snapshot
      .filter(n => (n.parent_id ?? null) === nextParentId && !numericIds.includes(n.id))
      .sort((a, b) => (a.sort_key ?? 'm').localeCompare(b.sort_key ?? 'm'))
    const lastKey = siblings.length > 0 ? (siblings[siblings.length - 1].sort_key ?? 'm') : null

    // Generate strictly-increasing sort keys after lastKey to avoid collision with existing siblings
    // (Bug-fix: prior `${prev ?? 'm'}m` produced keys colliding with existing 'm'/'mm', causing UI to lose items.)
    const sortKeys = generateSequenceAfter(lastKey, numericIds.length)
    const assignments: Array<{ id: number; sortKey: string }> = numericIds.map((id, i) => ({
      id,
      sortKey: sortKeys[i],
    }))

    // Optimistic update
    const lookup = new Map(assignments.map(a => [a.id, a.sortKey]))
    setNotes(prev => prev.map(note => (
      lookup.has(note.id)
        ? { ...note, parent_id: nextParentId, sort_key: lookup.get(note.id)! }
        : note
    )))

    // Round 5 · Bug D: 在批量移动期间抑制 vault watcher 对这些笔记的删除
    for (const id of numericIds) {
      vaultDeleteSuppressedIdsRef.current.add(id)
    }
    console.log('[BulkMove] suppressing vault delete for ids:', numericIds)

    // Round 3 · Bug C: 串行调用 api.updateNote 而非 Promise.all。
    // 原因: chokidar vault-watcher 在并发期间可能触发 reload,读取到只提交了一半的状态,
    // 已移动节点会"瞬现即消失"。串行 + 把 server 响应 merge 回 store 可保证视图一致。
    try {
      const ids = assignments.map(a => a.id)
      const keys = assignments.map(a => a.sortKey)
      const merged = await bulkMoveSerially(api, ids, nextParentId, keys)
      if (merged.length > 0) {
        const mergedById = new Map<number, Note>()
        for (const m of merged) {
          if (m && typeof (m as Note).id === 'number') {
            mergedById.set((m as Note).id, m as Note)
          }
        }
        setNotes(prev => prev.map(note => {
          const fresh = mergedById.get(note.id)
          return fresh ? mergeNote(note, fresh) : note
        }))
      }
    } catch (err) {
      console.error('Failed to bulk move notes:', err)
      await loadNotes(currentNoteId)
    } finally {
      // Round 5 · Bug D: 移动完成后延迟释放抑制,给 chokidar 事件队列排空的时间
      setTimeout(() => {
        for (const id of numericIds) {
          vaultDeleteSuppressedIdsRef.current.delete(id)
        }
        console.log('[BulkMove] released vault delete suppression for ids:', numericIds)
      }, 3000)
    }
  }

  const handleNodesBulkDelete = async (nodeIds: string[]) => {
    if (!nodeIds || nodeIds.length === 0) return
    const numericIds = nodeIds.map(id => parseInt(id, 10)).filter(n => !Number.isNaN(n))
    if (numericIds.length === 0) return

    const snapshot = useNoteStore.getState().notes

    const getDescendants = (parent: number, nodesList: Note[]): number[] => {
      const children = nodesList.filter(note => note.parent_id === parent)
      return children.reduce((acc, child) => [...acc, child.id, ...getDescendants(child.id, nodesList)], [] as number[])
    }

    const idsToRemove = new Set<number>()
    numericIds.forEach(id => {
      idsToRemove.add(id)
      getDescendants(id, snapshot).forEach(d => idsToRemove.add(d))
    })

    // Optimistic remove
    const remaining = snapshot.filter(note => !idsToRemove.has(note.id))
    idsToRemove.forEach(id => searchIndex.removeNote(id))
    setNotes(remaining)
    setCurrentNoteId(prev => idsToRemove.has(prev ?? -1) ? pickCurrentNoteId(remaining) : prev)

    try {
      await Promise.all(numericIds.map(id => api.deleteNote(id)))
    } catch (err) {
      console.error('Failed to bulk delete notes:', err)
      await loadNotes(currentNoteId)
    }
  }

  const handleNodeRename = async (nodeId: string, newTitle: string) => {
    const noteId = parseInt(nodeId, 10)
    const existing = useNoteStore.getState().notes.find(note => note.id === noteId)
    const sequence = nextNoteSaveSequence(saveSequenceRef.current, noteId)
    updatePendingNoteSaveCount(pendingSaveCountsRef.current, noteId, 1)

    if (existing) {
      applyNotePatch(noteId, {
        id: noteId,
        title: newTitle,
        is_title_manually_edited: true,
        updated_at: new Date().toISOString(),
      })
    }

    try {
      const updated = await api.updateNote(noteId, {
        title: newTitle,
        file_path: existing?.file_path,
        is_title_manually_edited: true,
        rename_file: true,
      })
      if (isLatestNoteSaveSequence(saveSequenceRef.current, noteId, sequence)) {
        commitPersistedNote(noteId, updated)
      }
    } catch (err) {
      console.error('Failed to rename note:', err)
    } finally {
      updatePendingNoteSaveCount(pendingSaveCountsRef.current, noteId, -1)
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

  const handleSave = useCallback(async (payload: Partial<Note>) => {
    const targetId = typeof payload.id === 'number' ? payload.id : currentNoteId
    if (targetId === null) {
      return
    }

    const persistedNote = useNoteStore.getState().notes.find(note => (
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
    const saveSequence = nextNoteSaveSequence(saveSequenceRef.current, targetId)

    const optimisticPatch = {
      ...payloadWithFilePath,
      id: targetId,
      ...(computedLinks !== undefined ? { links: computedLinks } : {}),
      updated_at: new Date().toISOString(),
    } as Note

    updatePendingNoteSaveCount(pendingSaveCountsRef.current, targetId, 1)
    applyNotePatch(targetId, optimisticPatch)

    try {
      const updated = await api.updateNote(targetId, payloadWithFilePath)
      if (isLatestNoteSaveSequence(saveSequenceRef.current, targetId, saveSequence)) {
        commitPersistedNote(targetId, updated)
        if (!shouldSkipRenameSync) {
          scheduleFileRename(updated)
        }
      }
      return updated
    } catch (err) {
      if (err instanceof Error && /note\s+\d+\s+not found/i.test(err.message) && payloadWithFilePath.file_path) {
        try {
          const recovered = await retrySaveByFilePath(targetId, payloadWithFilePath)
          if (recovered) {
            if (isLatestNoteSaveSequence(saveSequenceRef.current, targetId, saveSequence)) {
              commitPersistedNote(targetId, recovered)
              if (!shouldSkipRenameSync) {
                scheduleFileRename(recovered)
              }
            }
            return recovered
          }
        } catch (retryErr) {
          console.error('Failed to recover stale note id during save:', retryErr)
        }
      }
      console.error('Failed to save note:', err)
    } finally {
      updatePendingNoteSaveCount(pendingSaveCountsRef.current, targetId, -1)
    }
  }, [
    currentNoteId,
    applyNotePatch,
    commitPersistedNote,
    scheduleFileRename,
    retrySaveByFilePath,
  ])

  const handleLiveChange = useCallback((payload: Partial<Note>) => {
    const targetId = typeof payload.id === 'number' ? payload.id : currentNoteId
    if (targetId === null) {
      return
    }

    const existing = useNoteStore.getState().notes.find(note => note.id === targetId)
    const computedLinks = payload.links ?? (
      payload.content !== undefined ? extractLinkedNoteIds(payload.content) : undefined
    )

    if (
      existing &&
      payload.content === undefined &&
      computedLinks === undefined &&
      (payload.title === undefined || payload.title === existing.title) &&
      (payload.is_title_manually_edited === undefined || payload.is_title_manually_edited === existing.is_title_manually_edited)
    ) {
      return
    }

    applyNotePatch(targetId, {
      ...payload,
      id: targetId,
      ...(computedLinks !== undefined ? { links: computedLinks } : {}),
      updated_at: new Date().toISOString(),
    })
  }, [applyNotePatch, currentNoteId])

  const paletteActions: PaletteAction[] = useMemo(() => {
    const openTodayDaily = async () => {
      const key = formatDailyTitle(new Date())
      const existing = notes.find(n => (n.title ?? '').startsWith(key) && !n.is_folder)
      if (existing) {
        setCurrentNoteId(existing.id)
        setActiveView('notes')
        return
      }
      const created = await handleCreateDailyNote(key, buildDailyNoteContent(new Date()))
      if (created) {
        setCurrentNoteId(created.id)
        setActiveView('notes')
      }
    }

    return [
      {
        id: 'new-note',
        label: '新建笔记',
        hint: '在当前文件夹创建一篇空白笔记',
        keywords: ['create', 'new', 'note', '新建', '笔记'],
        icon: PlusIcon,
        run: () => handleAddNote(null, 'file'),
      },
      {
        id: 'new-canvas',
        label: '新建画布',
        hint: '无限画布 (Canvas)',
        keywords: ['canvas', 'whiteboard', '画布'],
        icon: SparklesIcon,
        run: () => handleAddNote(null, 'canvas'),
      },
      {
        id: 'open-daily',
        label: '打开 Daily Notes 日历',
        hint: '按日期浏览或创建每日笔记',
        keywords: ['daily', 'calendar', '日历', '每日'],
        icon: CalendarIcon,
        run: () => setIsDailyOpen(true),
      },
      {
        id: 'today-daily',
        label: '打开今天的 Daily Note',
        hint: '若不存在会自动创建',
        keywords: ['today', '今天', 'daily'],
        icon: CalendarIcon,
        run: () => { void openTodayDaily() },
      },
      {
        id: 'open-graph',
        label: '打开 Graph View',
        hint: '可视化笔记之间的链接网络',
        keywords: ['graph', 'network', '图谱', '链接'],
        icon: Share2Icon,
        run: () => setIsGraphOpen(true),
      },
      {
        id: 'open-concept-orbit',
        label: '打开概念轨道 · Concept Orbit',
        hint: '以当前笔记为中心的同心环图',
        keywords: ['orbit', 'concept', 'ring', '轨道', '概念', '同心'],
        icon: Share2Icon,
        run: () => setIsConceptOrbitOpen(true),
      },
      {
        id: 'open-margin-notes',
        label: '边栏批注 · Margin Notes',
        hint: '为当前笔记维护右侧批注条(本地保存)',
        keywords: ['margin', 'annotation', 'note', 'sidebar', '批注', '边栏', '注释'],
        icon: MessageSquareIcon,
        run: () => setIsMarginOpen(true),
      },
      {
        id: 'open-timeline',
        label: '时间轴 · Timeline',
        hint: '按月份浏览所有笔记',
        keywords: ['timeline', 'time', 'date', '时间轴', '时间线', '按时间'],
        icon: ClockIcon,
        run: () => setIsTimelineOpen(true),
      },
      {
        id: 'open-rich-summary',
        label: '出链摘要卡 · Rich Summary',
        hint: '当前笔记出链的富媒体摘要网格',
        keywords: ['summary', 'card', 'link', 'rich', '摘要', '出链', '卡片'],
        icon: FileTextIcon,
        run: () => setIsRichSummaryOpen(true),
      },
      {
        id: 'open-reader',
        label: '切换阅读模式',
        hint: '沉浸式阅读当前笔记',
        keywords: ['reader', 'read', '阅读'],
        icon: BookOpenIcon,
        run: () => setIsReaderOpen(true),
      },
      {
        id: 'open-settings',
        label: '打开设置',
        keywords: ['settings', 'preferences', '设置'],
        icon: SettingsIcon,
        run: () => setIsSettingsOpen(true),
      },
      {
        id: 'open-ask',
        label: 'Ask My Notes · 向笔记提问',
        hint: '基于本地 TF-IDF 的语义检索',
        keywords: ['ask', 'rag', 'search', '提问', '问答'],
        icon: MessageSquareIcon,
        run: () => setIsAskOpen(true),
      },
      {
        id: 'open-task-mirror',
        label: '任务镜像 · 汇总所有 Todo',
        hint: '跨笔记聚合 task list',
        keywords: ['task', 'mirror', 'todo', '任务'],
        icon: CheckSquareIcon,
        run: () => setIsTaskMirrorOpen(true),
      },
      {
        id: 'open-recap',
        label: '周回顾 · Daily Recap',
        hint: '最近 7 天 Daily Notes 摘要',
        keywords: ['recap', 'weekly', '回顾', '总结'],
        icon: ActivityIcon,
        run: () => setIsRecapOpen(true),
      },
      {
        id: 'export-vault',
        label: '导出为静态站点',
        hint: '一键生成独立 HTML + 搜索',
        keywords: ['export', 'static', 'vault', '导出', '发布'],
        icon: DownloadIcon,
        run: () => setIsExportOpen(true),
      },
    ]
  }, [handleAddNote, handleCreateDailyNote, notes, setCurrentNoteId])

  return (
    <AIProvider>
      <MusicProvider>
        <HabitProvider>
          <TodoProvider>
            <AmbientSoundProvider>
              <PomodoroProvider>
            <div
              data-testid="qingzhi-app-shell"
              className="qz-app-shell flex h-screen w-full bg-background text-foreground font-sans selection:bg-primary/30 overflow-hidden relative theme-transition"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(var(--primary),0.05),transparent_70%)] pointer-events-none z-0" />
              <div className="absolute inset-0 opacity-[0.4] pointer-events-none z-0" style={{ backgroundImage: 'var(--paper-texture)' }} />

              <header data-testid="qingzhi-topbar" className="qz-topbar absolute top-0 left-0 right-0 z-30 px-4">
                <button
                  type="button"
                  data-testid="qingzhi-logo-toggle"
                  className="qz-logo-toggle"
                  aria-label={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
                  aria-pressed={isSidebarCollapsed}
                  title="点击清知 Logo 收起/展开侧边栏"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
                >
                  <span className="qz-brand-mark" aria-hidden="true">
                    <QingzhiBrandMark />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-sm font-semibold tracking-[0.16em]">清知</span>
                    <span className="block text-[10px] text-[var(--nv-color-fg-muted)]">QingZhi Notes</span>
                  </span>
                </button>
                <div data-testid="qingzhi-topbar-drag" className="qz-topbar-drag" />
                <div ref={topbarOverflowRef} className="qz-topbar-right text-[11px] text-[var(--nv-color-fg-muted)]">
                  <QingzhiTopbarRuntimeStatus
                    onOpenPanel={(panel) => {
                      setIsTopbarOverflowOpen(false)
                      setOpenTopbarRuntimePanel(panel)
                    }}
                  />
                  {qingzhiPinnedTopbarActions.map((action) => {
                    const Icon = action.Icon
                    return (
                      <button
                        key={action.id}
                        type="button"
                        data-testid={`qingzhi-topbar-pin-${action.id}`}
                        className="qz-topbar-pin"
                        title={action.hint}
                        aria-label={action.label}
                        onClick={action.run}
                      >
                        <span
                          className="qz-topbar-pin-icon"
                          data-testid={`qingzhi-topbar-pin-icon-${action.id}`}
                          aria-hidden="true"
                        >
                          <Icon size={15} strokeWidth={2.1} />
                        </span>
                        <span
                          className="qz-topbar-pin-label"
                          data-testid={`qingzhi-topbar-pin-label-${action.id}`}
                        >
                          {action.label}
                        </span>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    data-testid="qingzhi-topbar-more"
                    className="qz-topbar-more"
                    title="更多功能"
                    aria-label="更多功能"
                    onClick={() => {
                      setOpenTopbarRuntimePanel(null)
                      setIsTopbarOverflowOpen((open) => !open)
                    }}
                  >
                    <MoreHorizontalIcon size={15} strokeWidth={2.2} />
                    <span>更多</span>
                  </button>
                  {isTopbarOverflowOpen && (
                    <div className="qz-topbar-overflow-panel">
                      {qingzhiOverflowTopbarActions.map((action) => {
                        const Icon = action.Icon
                        return (
                          <button
                            key={action.id}
                            type="button"
                            className="qz-topbar-overflow-item"
                            title={action.hint}
                            onClick={() => {
                              action.run()
                              setIsTopbarOverflowOpen(false)
                            }}
                          >
                            <Icon size={14} strokeWidth={2.1} />
                            <span>{action.label}</span>
                          </button>
                        )
                      })}
                      <QingzhiTopbarOverflowRuntimeActions
                        onOpenPanel={(panel) => {
                          setIsTopbarOverflowOpen(false)
                          setOpenTopbarRuntimePanel(panel)
                        }}
                      />
                    </div>
                  )}
                  <AnimatePresence>
                    {openTopbarRuntimePanel === 'pomodoro' && (
                      <QingzhiTopbarPomodoroPanel onClose={() => setOpenTopbarRuntimePanel(null)} />
                    )}
                    {openTopbarRuntimePanel === 'ambient' && (
                      <QingzhiTopbarAmbientPanel onClose={() => setOpenTopbarRuntimePanel(null)} />
                    )}
                  </AnimatePresence>
                  <button
                    type="button"
                    data-testid="qingzhi-topbar-avatar"
                    className="qz-topbar-avatar"
                    title="个人与设置"
                    aria-label="个人与设置"
                    onClick={() => setIsSettingsOpen(true)}
                  >
                    <QingzhiTopbarAvatar />
                  </button>
                  <div className="qz-window-controls" data-testid="qingzhi-window-controls">
                    <button
                      type="button"
                      data-testid="qingzhi-window-minimize"
                      className="qz-window-control"
                      title="最小化"
                      aria-label="最小化"
                      onClick={() => handleWindowControl('minimize')}
                    >
                      <MinimizeIcon size={14} />
                    </button>
                    <button
                      type="button"
                      data-testid="qingzhi-window-maximize"
                      className="qz-window-control"
                      title="最大化"
                      aria-label="最大化"
                      onClick={() => handleWindowControl('maximize')}
                    >
                      <MaximizeIcon size={13} />
                    </button>
                    <button
                      type="button"
                      data-testid="qingzhi-window-close"
                      className="qz-window-control qz-window-control-danger"
                      title="关闭"
                      aria-label="关闭"
                      onClick={() => handleWindowControl('close')}
                    >
                      <CloseIcon size={14} />
                    </button>
                  </div>
                </div>
              </header>

              <SidebarTree
                selectedNodeId={currentNoteId?.toString() ?? null}
                onNodeSelect={handleSelectNode}
                onNodeAdd={handleAddNote}
                onNodeMove={handleNodeMove}
                onNodeRename={handleNodeRename}
                onNodeDelete={handleNodeDelete}
                onNodeDuplicate={handleNodeDuplicate}
                onNodesBulkMove={handleNodesBulkMove}
                onNodesBulkDelete={handleNodesBulkDelete}
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
                className="flex-1 h-full relative overflow-hidden flex flex-col z-10 bg-background shadow-[0_0_50px_rgba(0,0,0,0.1)] origin-left pt-14"
              >
                <QuickActionsBar
                  onOpenReader={() => setIsReaderOpen(true)}
                  onOpenGraph={() => setIsGraphOpen(true)}
                  onOpenDaily={() => setIsDailyOpen(true)}
                  onOpenCommand={() => setIsCommandPaletteOpen(true)}
                  onOpenInspector={() => setIsInspectorOpen((open) => !open)}
                  onOpenAsk={() => setIsAskOpen(true)}
                  onOpenTaskMirror={() => setIsTaskMirrorOpen(true)}
                  onOpenRecap={() => setIsRecapOpen(true)}
                  onOpenExport={() => setIsExportOpen(true)}
                  onOpenTimeline={() => setIsTimelineOpen(true)}
                  hasActiveNote={Boolean(currentNote) && !isCanvasNote}
                />
                <AnimatePresence>
                  {isTypewriterOn && (
                    <motion.div
                      key="typewriter-pill"
                      className="nv-typewriter-indicator"
                      initial={{ opacity: 0, y: 12, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 12, scale: 0.9 }}
                      transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}
                    >
                      <span aria-hidden>⌨︎</span>
                      <span>打字机模式 · ⌘T 退出</span>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                    key={`editor-container-${pageTurnKey}`}
                    initial={{ opacity: 0, y: 10, rotateY: pageTurnDir * 40, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, rotateY: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -10, rotateY: pageTurnDir * -40, filter: 'blur(10px)' }}
                    transition={{ duration: 0.46, ease: [0.23, 1, 0.32, 1] }}
                    style={{ transformPerspective: 1600, transformOrigin: pageTurnDir === 1 ? 'left center' : 'right center' }}
                    className="flex-1 h-full"
                    data-testid="qingzhi-editor-region"
                  >
                  {currentNote ? (
                    isCanvasNote ? (
                      <CanvasEditor
                        note={currentNote}
                        onSave={handleSave}
                        onNotify={notifyApp}
                      />
                    ) : (
                      <NovaBlockEditor
                        note={currentNote}
                        onLiveChange={handleLiveChange}
                        onSave={handleSave}
                        onNotify={notifyApp}
                        onSaveAsTemplate={handleSaveAsTemplate}
                        onOpenMarginNotes={() => setIsMarginOpen(true)}
                        isTypewriterOn={isTypewriterOn}
                        onToggleTypewriter={() => setIsTypewriterOn((v) => !v)}
                      />
                    )
                  ) : (
                    <div
                      data-testid="qingzhi-empty-state"
                      data-empty-state={qingzhiEmptyState}
                      className="qz-empty-state px-8"
                    >
                      <div className="max-w-md rounded-[28px] border border-[var(--nv-color-border)] bg-[var(--nv-glass-bg)] p-8 shadow-[var(--nv-shadow-float)] backdrop-blur-xl">
                        <img
                          src={qingzhiEmptyCopy.sticker}
                          alt="清知情绪贴纸"
                          className="mx-auto mb-5 h-24 w-24 object-contain opacity-90"
                        />
                        <h2 className="text-xl font-semibold text-[var(--nv-color-fg)]">{qingzhiEmptyCopy.title}</h2>
                        <p className="mt-3 text-sm leading-7 text-[var(--nv-color-fg-muted)]">{qingzhiEmptyCopy.body}</p>
                        <div className="mt-6 flex justify-center gap-2">
                          <button
                            type="button"
                            data-testid="qingzhi-empty-state-select-notes"
                            data-empty-state-select="notes"
                            onClick={() => setQingzhiEmptyState('notes')}
                            className={`rounded-full border px-3 py-1 text-xs ${qingzhiEmptyState === 'notes' ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground'}`}
                          >
                            初始灵感
                          </button>
                          <button
                            type="button"
                            data-testid="qingzhi-empty-state-select-night"
                            data-empty-state-select="night"
                            onClick={() => setQingzhiEmptyState('night')}
                            className={`rounded-full border px-3 py-1 text-xs ${qingzhiEmptyState === 'night' ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground'}`}
                          >
                            夜间记录
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  </motion.div>
                </AnimatePresence>

                <div className="h-px w-full bg-gradient-to-r from-transparent via-white/5 to-transparent absolute bottom-0 left-0" />
              </motion.main>

              <CommandPalette
                isOpen={isCommandPaletteOpen}
                onClose={() => setIsCommandPaletteOpen(false)}
                onSelectNote={(note) => handleSelectNode(note.id.toString())}
                actions={paletteActions}
              />

              <ReaderMode
                note={currentNote}
                isOpen={isReaderOpen && Boolean(currentNote) && !isCanvasNote}
                onClose={() => setIsReaderOpen(false)}
              />

              <GraphView
                notes={notes}
                currentNoteId={currentNoteId}
                isOpen={isGraphOpen}
                onClose={() => setIsGraphOpen(false)}
                onSelectNote={(id) => {
                  handleSelectNode(id.toString())
                  setIsGraphOpen(false)
                }}
                onSwitchToOrbit={() => {
                  setIsGraphOpen(false)
                  setIsConceptOrbitOpen(true)
                }}
              />

              <ConceptOrbit
                notes={notes}
                currentNoteId={currentNoteId}
                isOpen={isConceptOrbitOpen}
                onClose={() => setIsConceptOrbitOpen(false)}
                onSelectNote={(id) => {
                  handleSelectNode(id.toString())
                  setIsConceptOrbitOpen(false)
                }}
                onSwitchToGraph={() => {
                  setIsConceptOrbitOpen(false)
                  setIsGraphOpen(true)
                }}
              />

              <MarginNotesPanel
                noteId={currentNoteId}
                noteTitle={currentNote?.title || ''}
                isOpen={isMarginOpen && Boolean(currentNote) && !isCanvasNote}
                onClose={() => setIsMarginOpen(false)}
              />

              <TimelineView
                notes={notes}
                isOpen={isTimelineOpen}
                onClose={() => setIsTimelineOpen(false)}
                onSelectNote={(id) => {
                  handleSelectNode(id.toString())
                  setIsTimelineOpen(false)
                }}
              />

              <RichSummaryCardsPanel
                notes={notes}
                currentNoteId={currentNoteId}
                isOpen={isRichSummaryOpen}
                onClose={() => setIsRichSummaryOpen(false)}
                onSelectNote={(id) => {
                  handleSelectNode(id.toString())
                  setIsRichSummaryOpen(false)
                }}
              />

              <DailyNotesPanel
                notes={notes}
                isOpen={isDailyOpen}
                onClose={() => setIsDailyOpen(false)}
                onOpenNote={(id) => handleSelectNode(id.toString())}
                onCreateDailyNote={handleCreateDailyNote}
              />

              <SettingsDialog
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
              />

              <InspectorPanel
                isOpen={isInspectorOpen}
                onClose={() => setIsInspectorOpen(false)}
                title={currentNote?.title ? `检视 · ${currentNote.title}` : '检视'}
              >
                <NoteInspectorContent
                  note={currentNote}
                  notes={notes}
                  onApplyTags={(tags) => {
                    if (!currentNote) return
                    const merged = Array.from(new Set([...(currentNote.tags ?? []), ...tags]))
                    void handleSave({ id: currentNote.id, tags: merged })
                  }}
                  onApplyTitle={(title) => {
                    if (!currentNote) return
                    void handleSave({ id: currentNote.id, title, is_title_manually_edited: true })
                  }}
                  onOpenNote={(id) => {
                    setIsInspectorOpen(false)
                    handleSelectNode(String(id))
                  }}
                  onSaveAsTemplate={handleSaveAsTemplate}
                  onOpenReader={() => {
                    setIsInspectorOpen(false)
                    setIsReaderOpen(true)
                  }}
                  onOpenGraph={() => {
                    setIsInspectorOpen(false)
                    setIsGraphOpen(true)
                  }}
                />
              </InspectorPanel>

              <div className="fixed top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent z-50 pointer-events-none" />
              <AnimatePresence>
                {appToast && (
                  <motion.div
                    key={`${appToast.tone}-${appToast.text}`}
                    initial={{ opacity: 0, y: -10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className={[
                      'fixed left-1/2 top-24 z-[260] max-w-[min(520px,calc(100vw-48px))] -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm shadow-[0_18px_48px_rgba(43,43,43,0.16)] backdrop-blur-xl',
                      appToast.tone === 'error'
                        ? 'border-rose-200 bg-rose-50/95 text-rose-800'
                        : appToast.tone === 'success'
                          ? 'border-emerald-200 bg-emerald-50/95 text-emerald-800'
                          : 'border-[rgba(200,168,115,0.35)] bg-[rgba(246,243,239,0.96)] text-[var(--nv-color-fg)]',
                    ].join(' ')}
                    role="status"
                    aria-live={appToast.tone === 'error' ? 'assertive' : 'polite'}
                  >
                    {appToast.text}
                  </motion.div>
                )}
              </AnimatePresence>
              <FloatingMusicCapsule />
              <MusicGlobalUI />

              <TemplatePicker
                isOpen={templateModal.isOpen}
                mode={templateModal.mode}
                onClose={() => setTemplateModal(prev => ({ ...prev, isOpen: false }))}
                onSelect={handleSelectTemplate}
                onSave={handleSaveTemplate}
              />

              <TaskMirror
                notes={notes}
                isOpen={isTaskMirrorOpen}
                onClose={() => setIsTaskMirrorOpen(false)}
                onOpenNote={(id) => {
                  setIsTaskMirrorOpen(false)
                  handleSelectNode(String(id))
                }}
              />

              <AskMyNotesPanel
                notes={notes}
                isOpen={isAskOpen}
                onClose={() => setIsAskOpen(false)}
                onOpenNote={(id) => {
                  setIsAskOpen(false)
                  handleSelectNode(String(id))
                }}
              />

              <DailyRecapPanel
                notes={notes}
                isOpen={isRecapOpen}
                onClose={() => setIsRecapOpen(false)}
                onOpenNote={(id) => {
                  setIsRecapOpen(false)
                  handleSelectNode(String(id))
                }}
              />

              <VaultExportDialog
                notes={notes}
                isOpen={isExportOpen}
                onClose={() => setIsExportOpen(false)}
              />

              <CadenceMeter />
              <PomodoroKeybindBridge />
              <WhiteboardEditorHost />
            </div>
              </PomodoroProvider>
            </AmbientSoundProvider>
          </TodoProvider>
        </HabitProvider>
      </MusicProvider>
    </AIProvider>
  )
}

export default App

function PomodoroKeybindBridge() {
  const pom = usePomodoro()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        if (pom.isRunning) pom.pause()
        else pom.start()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pom])
  return null
}

function NoteInspectorContent({
  note,
  notes,
  onSaveAsTemplate,
  onOpenReader,
  onOpenGraph,
  onApplyTags,
  onApplyTitle,
  onOpenNote,
}: {
  note: Note | null
  notes: Note[]
  onSaveAsTemplate: () => void
  onOpenReader: () => void
  onOpenGraph: () => void
  onApplyTags: (tags: string[]) => void
  onApplyTitle: (title: string) => void
  onOpenNote: (id: number) => void
}) {
  const { theme, setTheme } = useNovaTheme()

  const wordCount = useMemo(() => {
    if (!note?.content) return 0
    const txt = note.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return txt ? txt.length : 0
  }, [note?.content])

  const updatedStr = note?.updated_at ? new Date(note.updated_at).toLocaleString() : '—'
  const createdStr = (note as any)?.created_at
    ? new Date((note as any).created_at).toLocaleString()
    : '—'

  // A2 · Smart Backlinks
  const backlinks = useMemo(() => {
    if (!note || note.is_folder) return []
    try {
      const corpus = buildCorpus(notes)
      return findBacklinks(note.id, corpus, 5)
    } catch (err) {
      console.warn('[backlinks] failed', err)
      return []
    }
  }, [note, notes])

  // A3 · Auto-tag / Auto-title
  const tagSuggestions = useMemo(() => {
    if (!note || note.is_folder) return []
    try { return suggestTags(notes, note, 5) } catch { return [] }
  }, [note, notes])
  const titleSuggestion = useMemo(() => {
    if (!note || note.is_folder) return ''
    try { return suggestTitle(note) } catch { return '' }
  }, [note])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section>
        <InspectorSectionTitle>主题氛围</InspectorSectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {THEME_LIST.map((t) => {
            const meta = THEME_META[t]
            const active = t === theme
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className="nv-transition nv-focus-ring"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '10px 6px',
                  borderRadius: 10,
                  border: `1px solid ${
                    active ? 'var(--nv-color-accent)' : 'var(--nv-color-border)'
                  }`,
                  background: active
                    ? 'var(--nv-color-accent-muted)'
                    : 'var(--nv-color-surface-1)',
                  color: active ? 'var(--nv-color-accent-fg)' : 'var(--nv-color-fg)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{meta.icon}</span>
                <span style={{ fontWeight: 600 }}>{meta.label}</span>
                <span style={{ fontSize: 10, color: 'var(--nv-color-fg-subtle)' }}>
                  {meta.hint}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {note && !note.is_folder && (
        <section>
          <InspectorSectionTitle>笔记信息</InspectorSectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
            <InspectorRow icon={<FileTextIcon size={13} />} label="标题">
              {note.title || '未命名'}
            </InspectorRow>
            <InspectorRow icon={<ClockIcon size={13} />} label="更新">
              {updatedStr}
            </InspectorRow>
            <InspectorRow icon={<ClockIcon size={13} />} label="创建">
              {createdStr}
            </InspectorRow>
            <InspectorRow icon={<TagsIcon size={13} />} label="标签">
              {(note.tags ?? []).length > 0 ? (
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                  {(note.tags ?? []).map((t) => (
                    <span key={t} className="nv-chip" style={{ fontSize: 11 }}>
                      #{t}
                    </span>
                  ))}
                </span>
              ) : (
                <span style={{ color: 'var(--nv-color-fg-subtle)' }}>无</span>
              )}
            </InspectorRow>
            <InspectorRow icon={<BookmarkIcon size={13} />} label="字数">
              {wordCount}
            </InspectorRow>
          </div>
        </section>
      )}

      {note && !note.is_folder && (
        <section>
          <InspectorSectionTitle>快速动作</InspectorSectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <InspectorActionBtn onClick={onOpenReader} icon={<BookOpenIcon size={14} />}>
              进入阅读模式 <kbd className="nv-kbd">⌘⇧R</kbd>
            </InspectorActionBtn>
            <InspectorActionBtn onClick={onOpenGraph} icon={<Share2Icon size={14} />}>
              在图谱中查看 <kbd className="nv-kbd">⌘⇧G</kbd>
            </InspectorActionBtn>
            <InspectorActionBtn onClick={onSaveAsTemplate} icon={<SparklesIcon size={14} />}>
              存为模板
            </InspectorActionBtn>
          </div>
        </section>
      )}

      {note && !note.is_folder && (
        <section>
          <InspectorSectionTitle>语义反向链接 · A2</InspectorSectionTitle>
          {backlinks.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--nv-color-fg-subtle)' }}>
              暂无相关笔记 —— 多写一些内容即可显现
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {backlinks.map((b) => (
                <button
                  key={b.noteId}
                  className="nv-backlink-card nv-transition"
                  onClick={() => onOpenNote(b.noteId)}
                  title={`相似度 ${(b.score * 100).toFixed(1)}%`}
                >
                  <div className="nv-backlink-title">
                    <Link2Icon size={11} style={{ opacity: 0.65 }} />
                    <span>{b.title}</span>
                    <span className="nv-backlink-score">{(b.score * 100).toFixed(0)}%</span>
                  </div>
                  <div className="nv-backlink-snippet">{b.snippet}</div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {note && !note.is_folder && (
        <section>
          <InspectorSectionTitle>自动标签 / 标题 · A3</InspectorSectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--nv-color-fg-subtle)', marginBottom: 4 }}>
                建议标签
              </div>
              {tagSuggestions.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--nv-color-fg-subtle)' }}>无建议</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  {tagSuggestions.map((t) => (
                    <span key={t} className="nv-chip" style={{ fontSize: 11 }}>#{t}</span>
                  ))}
                  <button
                    className="nv-transition"
                    onClick={() => onApplyTags(tagSuggestions)}
                    style={{
                      fontSize: 11, padding: '2px 10px', borderRadius: 9,
                      border: '1px solid var(--nv-color-accent)',
                      background: 'var(--nv-color-accent-muted)',
                      color: 'var(--nv-color-accent-fg)', cursor: 'pointer',
                      marginLeft: 'auto',
                    }}
                  >
                    <Wand2Icon size={10} style={{ marginRight: 3, display: 'inline' }} />
                    采用
                  </button>
                </div>
              )}
            </div>
            {titleSuggestion && titleSuggestion !== note.title && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--nv-color-fg-subtle)', marginBottom: 4 }}>
                  建议标题
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{
                    flex: 1, fontSize: 12, padding: '4px 8px',
                    borderRadius: 6, background: 'var(--nv-color-surface-2)',
                    color: 'var(--nv-color-fg)',
                  }}>{titleSuggestion}</span>
                  <button
                    className="nv-transition"
                    onClick={() => onApplyTitle(titleSuggestion)}
                    style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 9,
                      border: '1px solid var(--nv-color-accent)',
                      background: 'var(--nv-color-accent-muted)',
                      color: 'var(--nv-color-accent-fg)', cursor: 'pointer',
                    }}
                  >
                    采用
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section style={{ marginTop: 'auto', paddingTop: 8 }}>
        <InspectorSectionTitle>快捷键</InspectorSectionTitle>
        <ul
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 11.5,
            color: 'var(--nv-color-fg-muted)',
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          <li>
            <kbd className="nv-kbd">⌘K</kbd> 命令面板
          </li>
          <li>
            <kbd className="nv-kbd">⌘.</kbd> 切换检视
          </li>
          <li>
            <kbd className="nv-kbd">⌘⇧R</kbd> 阅读模式
          </li>
          <li>
            <kbd className="nv-kbd">⌘⇧G</kbd> 图谱
          </li>
          <li>
            <kbd className="nv-kbd">⌘⇧D</kbd> Daily Notes
          </li>
        </ul>
      </section>
    </div>
  )
}

function InspectorSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--nv-color-fg-subtle)',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  )
}

function InspectorRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '68px 1fr',
        alignItems: 'baseline',
        gap: 8,
        padding: '4px 0',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          color: 'var(--nv-color-fg-subtle)',
          fontSize: 11.5,
        }}
      >
        {icon}
        {label}
      </span>
      <span style={{ color: 'var(--nv-color-fg)', wordBreak: 'break-word' }}>{children}</span>
    </div>
  )
}

function InspectorActionBtn({
  onClick,
  icon,
  children,
}: {
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="nv-transition nv-focus-ring"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 10,
        border: '1px solid var(--nv-color-border)',
        background: 'var(--nv-color-surface-1)',
        color: 'var(--nv-color-fg)',
        fontSize: 12.5,
        cursor: 'pointer',
        textAlign: 'left',
        justifyContent: 'flex-start',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--nv-color-accent-muted)'
        e.currentTarget.style.borderColor = 'var(--nv-color-accent)'
        e.currentTarget.style.color = 'var(--nv-color-accent-fg)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--nv-color-surface-1)'
        e.currentTarget.style.borderColor = 'var(--nv-color-border)'
        e.currentTarget.style.color = 'var(--nv-color-fg)'
      }}
    >
      <span style={{ display: 'inline-flex', color: 'var(--nv-color-fg-muted)' }}>{icon}</span>
      <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {children}
      </span>
    </button>
  )
}
