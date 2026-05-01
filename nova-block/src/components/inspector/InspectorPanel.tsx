import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface InspectorPanelProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  width?: number
}

/**
 * 右侧召唤式工具盘 —— 类似 Xcode Inspector / macOS 文件简介。
 * 快捷键：⌘. 切换；Esc 关闭。
 *
 * 不再把所有按钮塞进顶栏，而是把"偶尔使用"的功能移到这里。
 */
export function InspectorPanel({ isOpen, onClose, title = '检视', children, width = 340 }: InspectorPanelProps) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="inspector-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[80]"
            style={{ background: 'color-mix(in srgb, var(--nv-color-bg) 20%, transparent)' }}
          />
          <motion.aside
            key="inspector-panel"
            initial={{ x: width + 40, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: width + 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="fixed top-0 right-0 bottom-0 z-[90] flex flex-col"
            style={{
              width,
              background: 'var(--nv-glass-bg)',
              borderLeft: '1px solid var(--nv-glass-border)',
              backdropFilter: 'blur(22px) saturate(180%)',
              WebkitBackdropFilter: 'blur(22px) saturate(180%)',
              boxShadow: 'var(--nv-shadow-lift)',
            }}
            role="complementary"
            aria-label="Inspector"
          >
            <header
              className="flex items-center justify-between"
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--nv-color-border)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--nv-font-display)',
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--nv-color-fg)',
                  letterSpacing: '0.02em',
                }}
              >
                {title}
              </div>
              <button
                onClick={onClose}
                className="nv-icon-btn"
                aria-label="Close inspector"
                style={{ width: 28, height: 28, minWidth: 28 }}
              >
                <X size={15} />
              </button>
            </header>
            <div
              className="flex-1 overflow-y-auto"
              style={{ padding: '14px 18px 24px', color: 'var(--nv-color-fg)' }}
            >
              {children}
            </div>
            <footer
              style={{
                padding: '8px 14px',
                borderTop: '1px solid var(--nv-color-border)',
                fontSize: 11,
                color: 'var(--nv-color-fg-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <kbd className="nv-kbd">⌘</kbd>
                <kbd className="nv-kbd">.</kbd>
                <span>切换</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="nv-kbd">Esc</kbd>
                <span>关闭</span>
              </span>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

export default InspectorPanel
