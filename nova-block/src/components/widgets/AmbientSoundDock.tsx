import { useState } from 'react'
import { AMBIENT_LIST, useAmbientSound } from '../../contexts/AmbientSoundContext'
import { ChevronUp, Volume2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * v0.19 B2 · Ambient sound dock
 * 左下角悬浮的氛围声控制器，默认收起，鼠标 hover 展开。
 */
export function AmbientSoundDock() {
  const { activeId, volume, toggle, setVolume, stop } = useAmbientSound()
  const [open, setOpen] = useState(false)

  return (
    <div
      className="nv-ambient-dock nv-glass-sm"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      aria-label="Ambient sound"
    >
      <button
        className="nv-ambient-btn"
        data-active={activeId ? 'true' : 'false'}
        onClick={() => {
          if (activeId) stop()
          else setOpen((v) => !v)
        }}
        title={activeId ? `停止 ${activeId}` : '选择氛围声'}
      >
        <Volume2 size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            key="ambient-list"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}
          >
            {AMBIENT_LIST.map((a) => (
              <button
                key={a.id}
                className="nv-ambient-btn"
                data-active={activeId === a.id ? 'true' : 'false'}
                onClick={() => toggle(a.id)}
                title={a.hint}
              >
                <span style={{ fontSize: 14 }}>{a.icon}</span>
              </button>
            ))}
            <input
              className="nv-ambient-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              aria-label="音量"
            />
            <ChevronUp size={12} style={{ color: 'var(--nv-color-fg-subtle)' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AmbientSoundDock
