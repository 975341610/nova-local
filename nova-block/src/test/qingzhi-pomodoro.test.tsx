// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PomodoroProvider, usePomodoro } from '../contexts/PomodoroContext'

function Probe() {
  const pomodoro = usePomodoro()
  return (
    <div>
      <div data-testid="phase">{pomodoro.phase}</div>
      <div data-testid="remaining">{String(pomodoro.remaining)}</div>
      <div data-testid="completed-focus">{String(pomodoro.completedFocusSessions)}</div>
      <div data-testid="current-cycle">{String(pomodoro.currentCycle)}</div>
      <div data-testid="is-long-break">{String(pomodoro.isLongBreak)}</div>
      <button data-testid="start" onClick={pomodoro.start}>start</button>
      <button data-testid="reset" onClick={pomodoro.reset}>reset</button>
      <button data-testid="apply" onClick={() => pomodoro.setDurations(1, 1, 2, 4)}>apply</button>
    </div>
  )
}

describe('Pomodoro workflow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('tracks completed focus sessions and upgrades every fourth rest into a long break', () => {
    render(
      <PomodoroProvider>
        <Probe />
      </PomodoroProvider>,
    )

    fireEvent.click(screen.getByTestId('apply'))
    fireEvent.click(screen.getByTestId('start'))

    expect(screen.getByTestId('phase').textContent).toBe('focus')

    for (let index = 0; index < 4; index += 1) {
      act(() => {
        vi.advanceTimersByTime(60_000)
      })

      expect(screen.getByTestId('completed-focus').textContent).toBe(String(index + 1))
      expect(screen.getByTestId('phase').textContent).toBe('break')

      if (index === 3) {
        expect(screen.getByTestId('is-long-break').textContent).toBe('true')
        expect(screen.getByTestId('remaining').textContent).toBe('120')
      } else {
        expect(screen.getByTestId('is-long-break').textContent).toBe('false')
        expect(screen.getByTestId('remaining').textContent).toBe('60')
      }

      act(() => {
        vi.advanceTimersByTime(Number(screen.getByTestId('remaining').textContent) * 1000)
      })

      if (index < 3) {
        expect(screen.getByTestId('phase').textContent).toBe('focus')
      }
    }
  })

  it('reset returns the workflow to idle and clears completed sessions', () => {
    render(
      <PomodoroProvider>
        <Probe />
      </PomodoroProvider>,
    )

    fireEvent.click(screen.getByTestId('apply'))
    fireEvent.click(screen.getByTestId('start'))

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(screen.getByTestId('completed-focus').textContent).toBe('1')

    fireEvent.click(screen.getByTestId('reset'))

    expect(screen.getByTestId('phase').textContent).toBe('idle')
    expect(screen.getByTestId('completed-focus').textContent).toBe('0')
    expect(screen.getByTestId('current-cycle').textContent).toBe('1')
    expect(screen.getByTestId('is-long-break').textContent).toBe('false')
  })
})
