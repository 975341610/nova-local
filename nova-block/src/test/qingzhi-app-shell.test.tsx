// @vitest-environment jsdom

import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../components/sidebar/SidebarTree', () => ({
  SidebarTree: ({ isCollapsed }: { isCollapsed: boolean }) => (
    <aside data-testid="qingzhi-sidebar-region" data-collapsed={String(isCollapsed)} />
  ),
}))

vi.mock('../components/widgets/QuickActionsBar', () => ({
  QuickActionsBar: () => <div data-testid="qingzhi-floating-quick-actions" />,
}))

vi.mock('../components/novablock/NovaBlockEditor', () => ({
  default: () => <div data-testid="mock-editor" />,
  NovaBlockEditor: () => <div data-testid="mock-editor" />,
}))

vi.mock('../components/canvas/CanvasEditor', () => ({ CanvasEditor: () => <div /> }))
vi.mock('../components/search/CommandPalette', () => ({ default: () => null }))
vi.mock('../components/reader/ReaderMode', () => ({ ReaderMode: () => null }))
vi.mock('../components/graph/GraphView', () => ({ GraphView: () => null }))
vi.mock('../components/graph/ConceptOrbit', () => ({ ConceptOrbit: () => null }))
vi.mock('../components/panels/MarginNotesPanel', () => ({ MarginNotesPanel: () => null }))
vi.mock('../components/timeline/TimelineView', () => ({ TimelineView: () => null }))
vi.mock('../components/panels/RichSummaryCardsPanel', () => ({ RichSummaryCardsPanel: () => null }))
vi.mock('../components/daily/DailyNotesPanel', () => ({ DailyNotesPanel: () => null }))
vi.mock('../components/SettingsDialog', () => ({
  SettingsDialog: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="settings-dialog" /> : null),
}))
vi.mock('../components/inspector/InspectorPanel', () => ({
  InspectorPanel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../components/widgets/FloatingMusicCapsule', () => ({ FloatingMusicCapsule: () => null }))
vi.mock('../components/editor/TemplatePicker', () => ({ TemplatePicker: () => null }))
vi.mock('../components/panels/TaskMirror', () => ({ TaskMirror: () => null }))
vi.mock('../components/panels/AskMyNotesPanel', () => ({ AskMyNotesPanel: () => null }))
vi.mock('../components/panels/DailyRecapPanel', () => ({ DailyRecapPanel: () => null }))
vi.mock('../components/panels/VaultExportDialog', () => ({ VaultExportDialog: () => null }))
vi.mock('../components/widgets/CadenceMeter', () => ({ CadenceMeter: () => null }))
vi.mock('../components/whiteboard/WhiteboardEditorHost', () => ({ WhiteboardEditorHost: () => null }))

const {
  ambientToggleMock,
  ambientStopMock,
  ambientSetVolumeMock,
  pomodoroPauseMock,
  pomodoroStartMock,
  pomodoroResetMock,
  pomodoroSetDurationsMock,
} = vi.hoisted(() => ({
  ambientToggleMock: vi.fn(),
  ambientStopMock: vi.fn(),
  ambientSetVolumeMock: vi.fn(),
  pomodoroPauseMock: vi.fn(),
  pomodoroStartMock: vi.fn(),
  pomodoroResetMock: vi.fn(),
  pomodoroSetDurationsMock: vi.fn(),
}))

vi.mock('../contexts/AIContext', () => ({ AIProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, useAI: () => ({}) }))
vi.mock('../contexts/MusicContext', () => ({
  MusicProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMusicControls: () => ({ playlistPopoverAnchor: null, closePlaylist: vi.fn() }),
}))
vi.mock('../contexts/HabitContext', () => ({ HabitProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../contexts/TodoContext', () => ({ TodoProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../contexts/AmbientSoundContext', () => ({
  AmbientSoundProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AMBIENT_LIST: [
    { id: 'rain', label: 'Rain', hint: 'Rain ambience', icon: 'rain' },
  ],
  useAmbientSound: () => ({ activeId: null, volume: 0.4, toggle: ambientToggleMock, setVolume: ambientSetVolumeMock, stop: ambientStopMock }),
}))
vi.mock('../contexts/PomodoroContext', () => ({
  PomodoroProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePomodoro: () => ({
    phase: 'idle',
    remaining: 1500,
    total: 1500,
    progress: 0,
    isRunning: false,
    pause: pomodoroPauseMock,
    start: pomodoroStartMock,
    reset: pomodoroResetMock,
    focusMin: 25,
    breakMin: 5,
    longBreakMin: 15,
    longBreakEvery: 4,
    completedFocusSessions: 0,
    currentCycle: 1,
    isLongBreak: false,
    setDurations: pomodoroSetDurationsMock,
  }),
}))

const { useNoteStoreMock } = vi.hoisted(() => {
  const noteState = {
    notes: [],
    currentNoteId: null,
    setCurrentNoteId: vi.fn(),
    loadNotes: vi.fn(),
    addNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    duplicateNote: vi.fn(),
    moveNote: vi.fn(),
  }

  const useNoteStoreMock = (selector?: (state: typeof noteState) => unknown) => (
    selector ? selector(noteState) : noteState
  )
  useNoteStoreMock.getState = () => noteState

  return { useNoteStoreMock }
})

vi.mock('../store/useNoteStore', () => ({
  useNoteStore: useNoteStoreMock,
}))

import App from '../App'

const appSourcePath = resolve(__dirname, '../App.tsx')

describe('QingZhi V9 app shell', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('style')
    ambientToggleMock.mockReset()
    ambientStopMock.mockReset()
    ambientSetVolumeMock.mockReset()
    pomodoroPauseMock.mockReset()
    pomodoroStartMock.mockReset()
    pomodoroResetMock.mockReset()
    pomodoroSetDurationsMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('uses the approved shell: topbar, one left sidebar, one editor region, no middle note list', () => {
    render(<App />)

    expect(screen.getByTestId('qingzhi-app-shell')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-topbar')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-logo-toggle')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-sidebar-region')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-editor-region')).toBeTruthy()
    expect(screen.queryByTestId('qingzhi-middle-note-list')).toBeNull()
  })

  it('keeps the QingZhi logo as the sidebar toggle', () => {
    render(<App />)

    expect(screen.getByTestId('qingzhi-sidebar-region').getAttribute('data-collapsed')).toBe('false')
    fireEvent.click(screen.getByTestId('qingzhi-logo-toggle'))
    expect(screen.getByTestId('qingzhi-sidebar-region').getAttribute('data-collapsed')).toBe('true')
  })

  it('shows four fixed topbar actions, a more button, avatar, and window controls', () => {
    render(<App />)

    for (const id of ['daily', 'command', 'reader', 'inspect']) {
      expect(screen.getByTestId(`qingzhi-topbar-pin-${id}`)).toBeTruthy()
      expect(screen.getByTestId(`qingzhi-topbar-pin-icon-${id}`)).toBeTruthy()
    }

    expect(screen.getByTestId('qingzhi-topbar-more')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-topbar-avatar')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-topbar-avatar-img').getAttribute('src')).toContain('/assets/qingzhi/avatar/default.webp')
    expect(screen.getByTestId('qingzhi-window-minimize')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-window-maximize')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-window-close')).toBeTruthy()
  })

  it('keeps the inspect entry as a toggle instead of one-way open', () => {
    const appSource = readFileSync(appSourcePath, 'utf8')

    expect(appSource).toContain("run: () => setIsInspectorOpen((open) => !open)")
    expect(appSource).toContain("onOpenInspector={() => setIsInspectorOpen((open) => !open)}")
  })

  it('exposes a drag region and overflow entries for pomodoro and white noise', () => {
    render(<App />)

    expect(screen.getByTestId('qingzhi-topbar-drag')).toBeTruthy()

    fireEvent.click(screen.getByTestId('qingzhi-topbar-more'))
    expect(screen.getByTestId('qingzhi-topbar-overflow-pomodoro')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-topbar-overflow-ambient')).toBeTruthy()
  })

  it('opens runtime settings panels instead of immediately executing pomodoro or ambient actions', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('qingzhi-topbar-more'))
    fireEvent.click(screen.getByTestId('qingzhi-topbar-overflow-pomodoro'))

    expect(screen.getByTestId('qingzhi-topbar-pomodoro-panel')).toBeTruthy()
    expect(pomodoroStartMock).not.toHaveBeenCalled()
    expect(pomodoroResetMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('qingzhi-topbar-more'))
    fireEvent.click(screen.getByTestId('qingzhi-topbar-overflow-ambient'))

    expect(screen.getByTestId('qingzhi-topbar-ambient-panel')).toBeTruthy()
    expect(ambientToggleMock).not.toHaveBeenCalled()
    expect(ambientStopMock).not.toHaveBeenCalled()
  })

  it('lets opened runtime panels trigger pomodoro and ambient controls', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('qingzhi-topbar-more'))
    fireEvent.click(screen.getByTestId('qingzhi-topbar-overflow-pomodoro'))
    fireEvent.click(screen.getByTestId('qingzhi-pomodoro-start'))
    fireEvent.click(screen.getByTestId('qingzhi-pomodoro-reset'))
    fireEvent.change(screen.getByTestId('qingzhi-pomodoro-focus-input'), { target: { value: '30' } })
    fireEvent.change(screen.getByTestId('qingzhi-pomodoro-break-input'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('qingzhi-pomodoro-apply'))

    expect(pomodoroStartMock).toHaveBeenCalledTimes(1)
    expect(pomodoroResetMock).toHaveBeenCalledTimes(1)
    expect(pomodoroSetDurationsMock).toHaveBeenCalledWith(30, 10, 15, 4)

    fireEvent.click(screen.getByTestId('qingzhi-topbar-more'))
    fireEvent.click(screen.getByTestId('qingzhi-topbar-overflow-ambient'))
    fireEvent.click(screen.getByTestId('qingzhi-ambient-scene-rain'))
    fireEvent.change(screen.getByTestId('qingzhi-ambient-volume'), { target: { value: '0.7' } })
    fireEvent.click(screen.getByTestId('qingzhi-ambient-stop'))

    expect(ambientToggleMock).toHaveBeenCalledWith('rain')
    expect(ambientSetVolumeMock).toHaveBeenCalledWith(0.7)
    expect(ambientStopMock).toHaveBeenCalledTimes(1)
  })

  it('shows full pomodoro workflow settings in the topbar panel', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('qingzhi-topbar-more'))
    fireEvent.click(screen.getByTestId('qingzhi-topbar-overflow-pomodoro'))

    expect(screen.getByTestId('qingzhi-pomodoro-long-break-input')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-pomodoro-cycle-input')).toBeTruthy()
    expect(screen.getAllByText(/长休/).length).toBeGreaterThan(0)

    fireEvent.change(screen.getByTestId('qingzhi-pomodoro-focus-input'), { target: { value: '30' } })
    fireEvent.change(screen.getByTestId('qingzhi-pomodoro-break-input'), { target: { value: '8' } })
    fireEvent.change(screen.getByTestId('qingzhi-pomodoro-long-break-input'), { target: { value: '20' } })
    fireEvent.change(screen.getByTestId('qingzhi-pomodoro-cycle-input'), { target: { value: '4' } })
    fireEvent.click(screen.getByTestId('qingzhi-pomodoro-apply'))

    expect(pomodoroSetDurationsMock).toHaveBeenCalledWith(30, 8, 20, 4)
  })
})
