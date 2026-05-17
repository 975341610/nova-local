// @vitest-environment jsdom

import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../contexts/ThemeContext', () => ({
  THEME_META: {
    qingzhi: { label: '清知', hint: '宣纸 · 玉色 · 暖金', icon: '知' },
  },
  useNovaTheme: () => ({ theme: 'qingzhi', cycleTheme: vi.fn() }),
}))

vi.mock('../contexts/PomodoroContext', () => ({
  usePomodoro: () => ({
    phase: 'idle',
    remaining: 25 * 60,
    progress: 0,
    isRunning: false,
    start: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    focusMin: 25,
    breakMin: 5,
    setDurations: vi.fn(),
  }),
}))

vi.mock('../contexts/AmbientSoundContext', () => ({
  AMBIENT_LIST: [],
  useAmbientSound: () => ({
    current: null,
    volume: 0.4,
    isPlaying: false,
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
  }),
}))

import { QuickActionsBar } from '../components/widgets/QuickActionsBar'

describe('QingZhi QuickActionsBar', () => {
  afterEach(() => {
    cleanup()
  })

  it('uses QingZhi compact dock chrome instead of the old Nova toolbar label', () => {
    render(
      <QuickActionsBar
        onOpenReader={vi.fn()}
        onOpenGraph={vi.fn()}
        onOpenDaily={vi.fn()}
        onOpenCommand={vi.fn()}
        onOpenInspector={vi.fn()}
        onOpenAsk={vi.fn()}
        onOpenTaskMirror={vi.fn()}
        onOpenRecap={vi.fn()}
        onOpenExport={vi.fn()}
        onOpenTimeline={vi.fn()}
        hasActiveNote={true}
      />,
    )

    expect(screen.getByTestId('qingzhi-quick-actions')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-quick-actions').getAttribute('aria-label')).toBe('清知快捷入口')
    expect(screen.queryByLabelText('Nova 快速入口')).toBeNull()

    const requiredActions = [
      'command',
      'daily',
      'graph',
      'reader',
      'ask',
      'task-mirror',
      'recap',
      'timeline',
      'export',
      'pomodoro',
      'ambient',
      'theme',
      'inspector',
    ]

    for (const action of requiredActions) {
      expect(screen.getByTestId(`qingzhi-quick-action-${action}`)).toBeTruthy()
    }
  })

  it('keeps the primary quick actions wired to their callbacks', () => {
    const onOpenCommand = vi.fn()
    const onOpenDaily = vi.fn()
    const onOpenGraph = vi.fn()
    const onOpenReader = vi.fn()

    render(
      <QuickActionsBar
        onOpenReader={onOpenReader}
        onOpenGraph={onOpenGraph}
        onOpenDaily={onOpenDaily}
        onOpenCommand={onOpenCommand}
        hasActiveNote={true}
      />,
    )

    fireEvent.click(screen.getByTestId('qingzhi-quick-action-command'))
    expect(onOpenCommand).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('qingzhi-quick-action-daily'))
    expect(onOpenDaily).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('qingzhi-quick-action-graph'))
    expect(onOpenGraph).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('qingzhi-quick-action-reader'))
    expect(onOpenReader).toHaveBeenCalledTimes(1)
  })
})
