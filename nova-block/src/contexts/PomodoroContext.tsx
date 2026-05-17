import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type PomodoroPhase = 'idle' | 'focus' | 'break'

interface PomodoroCtx {
  phase: PomodoroPhase
  remaining: number
  total: number
  progress: number
  start: () => void
  pause: () => void
  reset: () => void
  isRunning: boolean
  focusMin: number
  breakMin: number
  longBreakMin: number
  longBreakEvery: number
  completedFocusSessions: number
  currentCycle: number
  isLongBreak: boolean
  setDurations: (focusMin: number, breakMin: number, longBreakMin?: number, longBreakEvery?: number) => void
}

const PomodoroContext = createContext<PomodoroCtx | null>(null)

const STORAGE_KEY = 'nova.pomodoro.durations'
const DEFAULT_FOCUS_MIN = 25
const DEFAULT_BREAK_MIN = 5
const DEFAULT_LONG_BREAK_MIN = 15
const DEFAULT_LONG_BREAK_EVERY = 4

interface StoredDurations {
  focusMin: number
  breakMin: number
  longBreakMin: number
  longBreakEvery: number
}

function clampMin(value: number, fallback = DEFAULT_FOCUS_MIN): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(120, Math.round(value)))
}

function clampCycle(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LONG_BREAK_EVERY
  return Math.max(2, Math.min(8, Math.round(value)))
}

function loadStored(): StoredDurations {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        focusMin: DEFAULT_FOCUS_MIN,
        breakMin: DEFAULT_BREAK_MIN,
        longBreakMin: DEFAULT_LONG_BREAK_MIN,
        longBreakEvery: DEFAULT_LONG_BREAK_EVERY,
      }
    }

    const parsed = JSON.parse(raw) as Partial<StoredDurations>
    return {
      focusMin: clampMin(parsed.focusMin ?? DEFAULT_FOCUS_MIN, DEFAULT_FOCUS_MIN),
      breakMin: clampMin(parsed.breakMin ?? DEFAULT_BREAK_MIN, DEFAULT_BREAK_MIN),
      longBreakMin: clampMin(parsed.longBreakMin ?? DEFAULT_LONG_BREAK_MIN, DEFAULT_LONG_BREAK_MIN),
      longBreakEvery: clampCycle(parsed.longBreakEvery ?? DEFAULT_LONG_BREAK_EVERY),
    }
  } catch {
    return {
      focusMin: DEFAULT_FOCUS_MIN,
      breakMin: DEFAULT_BREAK_MIN,
      longBreakMin: DEFAULT_LONG_BREAK_MIN,
      longBreakEvery: DEFAULT_LONG_BREAK_EVERY,
    }
  }
}

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => loadStored(), [])
  const [focusMin, setFocusMin] = useState(initial.focusMin)
  const [breakMin, setBreakMin] = useState(initial.breakMin)
  const [longBreakMin, setLongBreakMin] = useState(initial.longBreakMin)
  const [longBreakEvery, setLongBreakEvery] = useState(initial.longBreakEvery)
  const [phase, setPhase] = useState<PomodoroPhase>('idle')
  const [remaining, setRemaining] = useState(initial.focusMin * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [completedFocusSessions, setCompletedFocusSessions] = useState(0)
  const [isLongBreak, setIsLongBreak] = useState(false)
  const timerRef = useRef<number | null>(null)
  const phaseRef = useRef<PomodoroPhase>('idle')
  const completedRef = useRef(0)
  const cycleRef = useRef(longBreakEvery)

  const focusSeconds = focusMin * 60
  const breakSeconds = breakMin * 60
  const longBreakSeconds = longBreakMin * 60
  const total = phase === 'break' ? (isLongBreak ? longBreakSeconds : breakSeconds) : focusSeconds
  const currentCycle = (completedFocusSessions % longBreakEvery) + 1

  const stopTick = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    completedRef.current = completedFocusSessions
  }, [completedFocusSessions])

  useEffect(() => {
    cycleRef.current = longBreakEvery
  }, [longBreakEvery])

  const persistDurations = useCallback((next: StoredDurations) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // noop
    }
  }, [])

  const start = useCallback(() => {
    if (phaseRef.current === 'idle') {
      setPhase('focus')
      setIsLongBreak(false)
    }
    setIsRunning(true)
  }, [])

  const pause = useCallback(() => {
    setIsRunning(false)
  }, [])

  const reset = useCallback(() => {
    stopTick()
    setIsRunning(false)
    setPhase('idle')
    setRemaining(focusSeconds)
    setCompletedFocusSessions(0)
    setIsLongBreak(false)
  }, [focusSeconds, stopTick])

  const setDurations = useCallback((focus: number, shortBreak: number, longBreak?: number, cycle?: number) => {
    const next: StoredDurations = {
      focusMin: clampMin(focus, DEFAULT_FOCUS_MIN),
      breakMin: clampMin(shortBreak, DEFAULT_BREAK_MIN),
      longBreakMin: clampMin(longBreak ?? longBreakMin, DEFAULT_LONG_BREAK_MIN),
      longBreakEvery: clampCycle(cycle ?? longBreakEvery),
    }

    setFocusMin(next.focusMin)
    setBreakMin(next.breakMin)
    setLongBreakMin(next.longBreakMin)
    setLongBreakEvery(next.longBreakEvery)
    persistDurations(next)

    setRemaining((current) => {
      if (phaseRef.current === 'idle') return next.focusMin * 60
      return current
    })
  }, [longBreakEvery, longBreakMin, persistDurations])

  useEffect(() => {
    if (!isRunning) {
      stopTick()
      return
    }

    stopTick()
    timerRef.current = window.setInterval(() => {
      setRemaining((current) => {
        if (current > 1) return current - 1

        if (phaseRef.current === 'focus') {
          const nextCompleted = completedRef.current + 1
          const nextIsLongBreak = nextCompleted % cycleRef.current === 0
          setCompletedFocusSessions(nextCompleted)
          setIsLongBreak(nextIsLongBreak)
          setPhase('break')
          return 0
        }

        setIsLongBreak(false)
        setPhase('focus')
        return 0
      })
    }, 1000)

    return stopTick
  }, [isRunning, stopTick])

  useEffect(() => {
    if (phase === 'idle') {
      setRemaining(focusSeconds)
      return
    }

    if (phase === 'focus') {
      setRemaining(focusSeconds)
    } else {
      setRemaining(isLongBreak ? longBreakSeconds : breakSeconds)
    }

    try {
      const AudioContextCtor = (window as typeof window & { webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor) return
      const ctx = new AudioContextCtor()
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.frequency.value = phase === 'break' ? (isLongBreak ? 720 : 660) : 520
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.65)
      setTimeout(() => {
        try {
          void ctx.close()
        } catch {
          // noop
        }
      }, 800)
    } catch {
      // noop
    }
  }, [phase, isLongBreak, focusSeconds, breakSeconds, longBreakSeconds])

  const progress = phase === 'idle' ? 0 : 1 - remaining / Math.max(total, 1)

  const value = useMemo<PomodoroCtx>(() => ({
    phase,
    remaining,
    total,
    progress,
    start,
    pause,
    reset,
    isRunning,
    focusMin,
    breakMin,
    longBreakMin,
    longBreakEvery,
    completedFocusSessions,
    currentCycle,
    isLongBreak,
    setDurations,
  }), [
    phase,
    remaining,
    total,
    progress,
    start,
    pause,
    reset,
    isRunning,
    focusMin,
    breakMin,
    longBreakMin,
    longBreakEvery,
    completedFocusSessions,
    currentCycle,
    isLongBreak,
    setDurations,
  ])

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>
}

export function usePomodoro() {
  const value = useContext(PomodoroContext)
  if (!value) throw new Error('usePomodoro must be inside PomodoroProvider')
  return value
}
