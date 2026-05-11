/**
 * v0.19 B4 · Pomodoro
 *
 * 番茄钟：单例 context，支持自定义专注/休息时长。
 * 快捷键 ⌘⇧P 由 App.tsx 全局注入。
 *
 * v0.19.4：
 *   - 用户可通过 setDurations(focusMin, breakMin) 自定义时长
 *   - 时长持久化到 localStorage（nova.pomodoro.durations）
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type PomodoroPhase = 'idle' | 'focus' | 'break'

interface PomodoroCtx {
  phase: PomodoroPhase
  remaining: number // seconds
  total: number
  progress: number // 0..1 of current phase
  start: () => void
  pause: () => void
  reset: () => void
  isRunning: boolean
  focusMin: number
  breakMin: number
  setDurations: (focusMin: number, breakMin: number) => void
}

const PomodoroContext = createContext<PomodoroCtx | null>(null)

const STORAGE_KEY = 'nova.pomodoro.durations'
const DEFAULT_FOCUS_MIN = 25
const DEFAULT_BREAK_MIN = 5

interface StoredDurations { focusMin: number; breakMin: number }

function loadStored(): StoredDurations {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { focusMin: DEFAULT_FOCUS_MIN, breakMin: DEFAULT_BREAK_MIN }
    const parsed = JSON.parse(raw) as Partial<StoredDurations>
    const focusMin = clampMin(parsed.focusMin ?? DEFAULT_FOCUS_MIN)
    const breakMin = clampMin(parsed.breakMin ?? DEFAULT_BREAK_MIN)
    return { focusMin, breakMin }
  } catch {
    return { focusMin: DEFAULT_FOCUS_MIN, breakMin: DEFAULT_BREAK_MIN }
  }
}

function clampMin(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_FOCUS_MIN
  return Math.max(1, Math.min(120, Math.round(v)))
}

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => loadStored(), [])
  const [focusMin, setFocusMin] = useState<number>(initial.focusMin)
  const [breakMin, setBreakMin] = useState<number>(initial.breakMin)
  const FOCUS_SEC = focusMin * 60
  const BREAK_SEC = breakMin * 60

  const [phase, setPhase] = useState<PomodoroPhase>('idle')
  const [remaining, setRemaining] = useState<number>(FOCUS_SEC)
  const [isRunning, setIsRunning] = useState(false)
  const timerRef = useRef<number | null>(null)

  const total = phase === 'break' ? BREAK_SEC : FOCUS_SEC

  const stopTick = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (phase === 'idle') {
      setPhase('focus')
      setRemaining(FOCUS_SEC)
    }
    setIsRunning(true)
  }, [phase, FOCUS_SEC])

  const pause = useCallback(() => setIsRunning(false), [])

  const reset = useCallback(() => {
    stopTick()
    setPhase('idle')
    setRemaining(FOCUS_SEC)
    setIsRunning(false)
  }, [stopTick, FOCUS_SEC])

  const setDurations = useCallback((f: number, b: number) => {
    const fm = clampMin(f)
    const bm = clampMin(b)
    setFocusMin(fm)
    setBreakMin(bm)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ focusMin: fm, breakMin: bm }))
    } catch { /* noop */ }
    // idle 状态下同步刷新倒计时显示，否则等下次 phase 切换生效
    setRemaining((prev) => {
      if (phase === 'idle') return fm * 60
      return prev
    })
  }, [phase])

  useEffect(() => {
    if (!isRunning) { stopTick(); return }
    stopTick()
    timerRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r > 1) return r - 1
        setPhase((p) => {
          if (p === 'focus') return 'break'
          if (p === 'break') return 'focus'
          return 'focus'
        })
        return r
      })
    }, 1000)
    return stopTick
  }, [isRunning, stopTick])

  // phase change resets remaining and bleeps
  useEffect(() => {
    if (phase === 'focus') setRemaining(FOCUS_SEC)
    else if (phase === 'break') setRemaining(BREAK_SEC)
    if (phase !== 'idle') {
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext
        if (AC) {
          const ctx = new AC()
          const o = ctx.createOscillator()
          const g = ctx.createGain()
          o.frequency.value = phase === 'break' ? 660 : 520
          o.connect(g); g.connect(ctx.destination)
          g.gain.setValueAtTime(0.0001, ctx.currentTime)
          g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02)
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
          o.start(); o.stop(ctx.currentTime + 0.65)
          setTimeout(() => { try { ctx.close() } catch (_) {} }, 800)
        }
      } catch (_) { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const progress = phase === 'idle' ? 0 : 1 - remaining / total

  const value = useMemo<PomodoroCtx>(() => ({
    phase, remaining, total, progress, start, pause, reset, isRunning,
    focusMin, breakMin, setDurations,
  }), [phase, remaining, total, progress, start, pause, reset, isRunning, focusMin, breakMin, setDurations])

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>
}

export function usePomodoro() {
  const v = useContext(PomodoroContext)
  if (!v) throw new Error('usePomodoro must be inside PomodoroProvider')
  return v
}
