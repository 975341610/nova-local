import { usePomodoro } from '../../contexts/PomodoroContext'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useState } from 'react'

/**
 * v0.19 B4 · Pomodoro ring indicator
 * 右下角悬浮环。点击主环 play/pause；hover 显示 reset 按钮。
 * 仅在 phase !== 'idle' 时可见。
 */
export function PomodoroRing() {
  const { phase, remaining, progress, isRunning, start, pause, reset } = usePomodoro()
  const [hover, setHover] = useState(false)

  if (phase === 'idle') return null

  const mm = Math.floor(remaining / 60)
  const ss = remaining % 60
  const label = `${mm}:${ss.toString().padStart(2, '0')}`

  const radius = 23
  const circ = 2 * Math.PI * radius
  const offset = circ * (1 - progress)

  return (
    <div
      className="nv-pomodoro-ring"
      data-phase={phase}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => (isRunning ? pause() : start())}
      title={`${phase === 'focus' ? '专注' : '休息'} · ${label}`}
    >
      <svg width={56} height={56} viewBox="0 0 56 56">
        <circle
          cx={28} cy={28} r={radius}
          fill="none"
          stroke="var(--nv-color-border)"
          strokeWidth={3}
        />
        <circle
          cx={28} cy={28} r={radius}
          fill="none"
          stroke={phase === 'break' ? 'var(--nv-color-success)' : 'var(--nv-color-accent)'}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 28 28)`}
          style={{ transition: 'stroke-dashoffset 600ms linear' }}
        />
      </svg>
      <div className="nv-pomodoro-text" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {hover ? (
          isRunning ? <Pause size={14} /> : <Play size={14} />
        ) : (
          label
        )}
      </div>
      {hover && (
        <button
          onClick={(e) => { e.stopPropagation(); reset() }}
          title="结束番茄钟"
          style={{
            position: 'absolute', right: -8, top: -8,
            width: 22, height: 22, borderRadius: '50%',
            border: '1px solid var(--nv-color-border)',
            background: 'var(--nv-color-surface-2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--nv-color-fg-muted)',
          }}
        >
          <RotateCcw size={10} />
        </button>
      )}
    </div>
  )
}

export default PomodoroRing
