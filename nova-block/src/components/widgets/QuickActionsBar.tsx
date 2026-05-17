import {
  BookOpen,
  Share2,
  Calendar as CalendarIcon,
  Command as CommandIcon,
  PanelRight,
  MessageSquare,
  CheckSquare,
  Activity,
  GitCommitHorizontal,
  Download,
  Play,
  Pause,
  RotateCcw,
  Timer as TimerIcon,
  Volume2,
  VolumeX,
  Settings as SettingsIcon,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNovaTheme, THEME_META } from '../../contexts/ThemeContext'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { AMBIENT_LIST, useAmbientSound } from '../../contexts/AmbientSoundContext'

interface QuickActionsBarProps {
  onOpenReader: () => void
  onOpenGraph: () => void
  onOpenDaily: () => void
  onOpenCommand?: () => void
  onOpenInspector?: () => void
  onOpenAsk?: () => void
  onOpenTaskMirror?: () => void
  onOpenRecap?: () => void
  onOpenExport?: () => void
  onOpenTimeline?: () => void
  hasActiveNote: boolean
}

type PopoverKind = null | 'pomodoro' | 'ambient'

/**
 * v0.19.5 · 统一悬浮 Dock（仅编辑模式展示）
 *   - 阅读模式不再渲染本 Dock;阅读模式使用独立的 `.nv-reader-toolbar`
 *   - popover 智能左右对齐,靠近边缘时不再被切掉
 */
export function QuickActionsBar({
  onOpenReader,
  onOpenGraph,
  onOpenDaily,
  onOpenCommand,
  onOpenInspector,
  onOpenAsk,
  onOpenTaskMirror,
  onOpenRecap,
  onOpenExport,
  onOpenTimeline,
  hasActiveNote,
}: QuickActionsBarProps) {
  const { theme, cycleTheme } = useNovaTheme()
  const [expanded, setExpanded] = useState(false)
  const [openPopover, setOpenPopover] = useState<PopoverKind>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!openPopover) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenPopover(null)
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [openPopover])

  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0, y: 24, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1], delay: 0.15 }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={() => setExpanded(false)}
      data-testid="qingzhi-quick-actions"
      className="nv-glass-sm nv-dock qz-quick-actions"
      role="toolbar"
      aria-label="清知快捷入口"
      style={{
        position: 'absolute',
        bottom: 22,
        left: '50%',
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 5,
        borderRadius: 'var(--nv-radius-full)',
        maxWidth: 'calc(100vw - 40px)',
        flexWrap: 'nowrap',
      }}
    >
      <DockBtn
        actionId="command"
        label="命令面板"
        hint="⌘K"
        icon={<CommandIcon size={15} strokeWidth={2} />}
        expanded={expanded}
        onClick={() => onOpenCommand?.()}
      />
      <DockBtn
        actionId="daily"
        label="Daily"
        hint="⌘⇧D"
        icon={<CalendarIcon size={15} strokeWidth={2} />}
        expanded={expanded}
        onClick={onOpenDaily}
      />
      <DockBtn
        actionId="graph"
        label="图谱"
        hint="⌘⇧G"
        icon={<Share2 size={15} strokeWidth={2} />}
        expanded={expanded}
        onClick={onOpenGraph}
      />
      <DockBtn
        actionId="reader"
        label="阅读"
        hint="⌘⇧R"
        icon={<BookOpen size={15} strokeWidth={2} />}
        expanded={expanded}
        onClick={onOpenReader}
        disabled={!hasActiveNote}
      />

      <Sep />

      {onOpenAsk && (
        <DockBtn
          actionId="ask"
          label="Ask"
          hint="⌘⇧A"
          icon={<MessageSquare size={15} strokeWidth={2} />}
          expanded={expanded}
          onClick={onOpenAsk}
        />
      )}
      {onOpenTaskMirror && (
        <DockBtn
          actionId="task-mirror"
          label="任务"
          hint="⌘⇧M"
          icon={<CheckSquare size={15} strokeWidth={2} />}
          expanded={expanded}
          onClick={onOpenTaskMirror}
        />
      )}
      {onOpenRecap && (
        <DockBtn
          actionId="recap"
          label="回顾"
          icon={<Activity size={15} strokeWidth={2} />}
          expanded={expanded}
          onClick={onOpenRecap}
        />
      )}
      {onOpenTimeline && (
        <DockBtn
          actionId="timeline"
          label="时间轴"
          hint="⌘⇧T"
          icon={<GitCommitHorizontal size={15} strokeWidth={2} />}
          expanded={expanded}
          onClick={onOpenTimeline}
        />
      )}
      {onOpenExport && (
        <DockBtn
          actionId="export"
          label="导出"
          hint="⌘⇧E"
          icon={<Download size={15} strokeWidth={2} />}
          expanded={expanded}
          onClick={onOpenExport}
        />
      )}

      <Sep />

      <PomodoroButton
        expanded={expanded}
        open={openPopover === 'pomodoro'}
        onToggle={() => setOpenPopover(openPopover === 'pomodoro' ? null : 'pomodoro')}
      />
      <AmbientButton
        expanded={expanded}
        open={openPopover === 'ambient'}
        onToggle={() => setOpenPopover(openPopover === 'ambient' ? null : 'ambient')}
      />

      <Sep />

      <DockBtn
        actionId="theme"
        label={THEME_META[theme].label}
        hint={THEME_META[theme].hint}
        icon={
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ rotate: -30, opacity: 0, scale: 0.85 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 30, opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              style={{ display: 'inline-flex', fontSize: 14, lineHeight: 1 }}
            >
              {THEME_META[theme].icon}
            </motion.span>
          </AnimatePresence>
        }
        expanded={expanded}
        onClick={() => cycleTheme()}
      />
      {onOpenInspector && (
        <DockBtn
          actionId="inspector"
          label="检视"
          hint="⌘."
          icon={<PanelRight size={15} strokeWidth={2} />}
          expanded={expanded}
          onClick={onOpenInspector}
        />
      )}
    </motion.div>
  )
}

function Sep() {
  return (
    <div
      aria-hidden
      style={{
        width: 1,
        height: 16,
        background: 'var(--nv-color-border-strong)',
        opacity: 0.6,
        margin: '0 3px',
      }}
    />
  )
}

/**
 * 根据按钮位置算出 popover 应该相对按钮偏左 / 偏右 / 居中对齐,
 * 避免靠近屏幕边缘时被切掉。
 */
function usePopoverAlign(btnRef: React.RefObject<HTMLElement | null>, open: boolean, width: number) {
  const [style, setStyle] = useState<{ left: number | 'auto'; right: number | 'auto'; transform: string }>({
    left: 0, right: 'auto', transform: 'translateX(0)',
  })
  useLayoutEffect(() => {
    if (!open) return
    const el = btnRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 12
    let left: number | 'auto' = rect.width / 2 - width / 2
    let right: number | 'auto' = 'auto'
    const transform = 'translateX(0)'
    const wouldLeftAbs = rect.left + left
    const wouldRightAbs = wouldLeftAbs + width
    if (wouldLeftAbs < margin) {
      left = -rect.left + margin
    } else if (wouldRightAbs > window.innerWidth - margin) {
      right = -(window.innerWidth - rect.right) + margin
      left = 'auto'
    }
    setStyle({ left, right, transform })
  }, [open, width, btnRef])
  return style
}

function PomodoroButton({
  expanded, open, onToggle,
}: { expanded: boolean; open: boolean; onToggle: () => void }) {
  const { phase, remaining, progress, isRunning, start, pause, reset, focusMin, breakMin, setDurations } = usePomodoro()
  const mm = Math.floor(remaining / 60)
  const ss = remaining % 60
  const timeLabel = `${mm}:${ss.toString().padStart(2, '0')}`
  const [showSettings, setShowSettings] = useState(false)
  const [focusInput, setFocusInput] = useState(String(focusMin))
  const [breakInput, setBreakInput] = useState(String(breakMin))
  useEffect(() => { setFocusInput(String(focusMin)) }, [focusMin])
  useEffect(() => { setBreakInput(String(breakMin)) }, [breakMin])

  const active = phase !== 'idle'
  const label = active ? timeLabel : '番茄钟'

  const btnWrapRef = useRef<HTMLDivElement | null>(null)
  const popWidth = 260
  const align = usePopoverAlign(btnWrapRef, open, popWidth)

  const applySettings = () => {
    const f = parseInt(focusInput, 10)
    const b = parseInt(breakInput, 10)
    if (Number.isFinite(f) && Number.isFinite(b)) {
      setDurations(f, b)
    }
    setShowSettings(false)
  }

  return (
    <div ref={btnWrapRef} style={{ position: 'relative' }}>
      <DockBtn
        actionId="pomodoro"
        label={label}
        hint="⌘⇧P"
        icon={
          active ? (
            <MiniRing progress={progress} color={phase === 'break' ? 'var(--nv-color-success)' : 'var(--nv-color-accent)'} />
          ) : (
            <TimerIcon size={15} strokeWidth={2} />
          )
        }
        expanded={expanded || active}
        onClick={onToggle}
        data-active={active ? 'true' : 'false'}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            key="pom-pop"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="nv-glass-sm"
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 10px)',
              left: align.left,
              right: align.right,
              transform: align.transform,
              padding: '12px 14px',
              borderRadius: 14,
              width: popWidth,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: 'var(--nv-shadow-3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, color: 'var(--nv-color-fg-muted)' }}>
                {phase === 'idle' ? `番茄钟 · ${focusMin} / ${breakMin}` : phase === 'focus' ? '专注中' : '休息中'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontFamily: 'var(--nv-font-mono)', fontSize: 18, fontWeight: 600 }}>
                  {timeLabel}
                </div>
                <button
                  className="nv-panel-pill"
                  onClick={() => setShowSettings(s => !s)}
                  title="自定义时长"
                  style={{ padding: '2px 6px' }}
                >
                  <SettingsIcon size={12} />
                </button>
              </div>
            </div>

            {showSettings && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--nv-color-fg-muted)' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  专注
                  <input
                    type="number" min={1} max={120} value={focusInput}
                    onChange={(e) => setFocusInput(e.target.value)}
                    className="nv-sunken"
                    style={{ width: 52, padding: '2px 6px', fontSize: 12 }}
                  /> 分
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  休息
                  <input
                    type="number" min={1} max={60} value={breakInput}
                    onChange={(e) => setBreakInput(e.target.value)}
                    className="nv-sunken"
                    style={{ width: 44, padding: '2px 6px', fontSize: 12 }}
                  /> 分
                </label>
                <button className="nv-panel-pill" onClick={applySettings} style={{ padding: '2px 8px', fontSize: 11 }}>
                  应用
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="nv-panel-pill"
                onClick={() => (isRunning ? pause() : start())}
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
              >
                {isRunning ? <Pause size={12} /> : <Play size={12} />}
                {isRunning ? '暂停' : phase === 'idle' ? '开始' : '继续'}
              </button>
              <button
                className="nv-panel-pill"
                onClick={reset}
                title="重置"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <RotateCcw size={12} /> 重置
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MiniRing({ progress, color }: { progress: number; color: string }) {
  const r = 7
  const c = 2 * Math.PI * r
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
      <circle cx={8} cy={8} r={r} fill="none" stroke="var(--nv-color-border-strong)" strokeWidth={1.5} />
      <circle
        cx={8}
        cy={8}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
        transform="rotate(-90 8 8)"
        style={{ transition: 'stroke-dashoffset 500ms linear' }}
      />
    </svg>
  )
}

function AmbientButton({
  expanded, open, onToggle,
}: { expanded: boolean; open: boolean; onToggle: () => void }) {
  const { activeId, volume, toggle, setVolume, stop } = useAmbientSound()
  const active = Boolean(activeId)
  const label = active ? (AMBIENT_LIST.find(a => a.id === activeId)?.label ?? '氛围声') : '氛围声'

  const btnWrapRef = useRef<HTMLDivElement | null>(null)
  const popWidth = 280
  const align = usePopoverAlign(btnWrapRef, open, popWidth)

  return (
    <div ref={btnWrapRef} style={{ position: 'relative' }}>
      <DockBtn
        actionId="ambient"
        label={label}
        icon={active ? <Volume2 size={15} strokeWidth={2} /> : <VolumeX size={15} strokeWidth={2} />}
        expanded={expanded || active}
        onClick={onToggle}
        data-active={active ? 'true' : 'false'}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            key="amb-pop"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="nv-glass-sm"
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 10px)',
              left: align.left,
              right: align.right,
              transform: align.transform,
              padding: 10,
              borderRadius: 14,
              width: popWidth,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: 'var(--nv-shadow-3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {AMBIENT_LIST.map((a) => (
                <button
                  key={a.id}
                  className="nv-ambient-chip"
                  data-active={activeId === a.id ? 'true' : 'false'}
                  onClick={() => toggle(a.id)}
                  title={a.hint}
                >
                  <span style={{ fontSize: 14 }}>{a.icon}</span>
                  <span style={{ fontSize: 11.5 }}>{a.label}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px 0' }}>
              <span style={{ fontSize: 11, color: 'var(--nv-color-fg-subtle)', minWidth: 28 }}>音量</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
              {active && (
                <button
                  className="nv-panel-pill"
                  onClick={stop}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                >停止</button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DockBtn({
  actionId,
  label,
  hint,
  icon,
  expanded,
  onClick,
  disabled,
  ...rest
}: {
  actionId?: string
  label: string
  hint?: string
  icon: React.ReactNode
  expanded: boolean
  onClick: () => void
  disabled?: boolean
  'data-active'?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={actionId ? `qingzhi-quick-action-${actionId}` : undefined}
      className="nv-transition nv-focus-ring nv-dock-btn qz-quick-action"
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: expanded ? '6px 11px' : '7px 7px',
        minWidth: expanded ? 'auto' : 30,
        height: 30,
        fontSize: 12.5,
        fontWeight: 500,
        color: disabled ? 'var(--nv-color-fg-subtle)' : 'var(--nv-color-fg-muted)',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--nv-radius-full)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background-color 180ms cubic-bezier(0.2, 0, 0, 1), color 180ms cubic-bezier(0.2, 0, 0, 1), padding 240ms cubic-bezier(0.32, 0.72, 0, 1), min-width 240ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = 'var(--nv-color-accent-muted)'
        e.currentTarget.style.color = 'var(--nv-color-accent-fg)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = disabled
          ? 'var(--nv-color-fg-subtle)'
          : 'var(--nv-color-fg-muted)'
      }}
    >
      {icon}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.span
            initial={{ opacity: 0, width: 0, marginLeft: 0 }}
            animate={{ opacity: 1, width: 'auto', marginLeft: 0 }}
            exit={{ opacity: 0, width: 0, marginLeft: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

export default QuickActionsBar
