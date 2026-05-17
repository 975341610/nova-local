import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Type, Minus, Plus, GripVertical } from 'lucide-react'
import type { Note } from '../../lib/types'
import { renderReaderHtml } from '../../lib/readerContent'

interface ReaderModeProps {
  note: Note | null
  isOpen: boolean
  onClose: () => void
}

const FONT_STEPS = [0.92, 1, 1.08, 1.18, 1.3]

const TOOLBAR_POS_KEY = 'nova.reader.toolbar.pos'

interface ToolbarPos { x: number; y: number }
function readToolbarPos(): ToolbarPos | null {
  try {
    const raw = localStorage.getItem(TOOLBAR_POS_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as ToolbarPos
    if (typeof v?.x === 'number' && typeof v?.y === 'number') return v
  } catch { /* noop */ }
  return null
}
function writeToolbarPos(pos: ToolbarPos) {
  try { localStorage.setItem(TOOLBAR_POS_KEY, JSON.stringify(pos)) } catch { /* noop */ }
}

/**
 * 沉浸式阅读模式。
 * 快捷键:Esc 关闭;[ / ] 调节字号;按 T 切换衬线/无衬线。
 *
 * v0.19.5:
 *   - 工具条改为默认右侧中部 + 可拖动 + 位置持久化
 *   - 正文 HTML 通过 ref 命令式写入,避免 dangerouslySetInnerHTML 在
 *     父组件 re-render 时重置 <video> 播放状态
 *   - 章节扫描用 ResizeObserver/MutationObserver 代替依赖 html 的 useEffect,
 *     彻底消除 video 闪烁与滚动重置
 *   - 正文底部 padding 调大,避免被工具条遮挡
 */
export function ReaderMode({ note, isOpen, onClose }: ReaderModeProps) {
  const [fontStep, setFontStep] = useState<number>(1)
  const [useSerif, setUseSerif] = useState<boolean>(true)
  const [progress, setProgress] = useState(0)
  const [chapters, setChapters] = useState<Array<{ id: string; top: number; title: string }>>([])
  const shellRef = useRef<HTMLDivElement | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)

  // 工具条拖动状态
  const [toolbarPos, setToolbarPos] = useState<ToolbarPos | null>(() => readToolbarPos())
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (!isOpen) return
    document.body.classList.add('reader-mode')
    return () => {
      document.body.classList.remove('reader-mode')
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === ']') {
        setFontStep((s) => Math.min(FONT_STEPS.length - 1, s + 1))
      } else if (e.key === '[') {
        setFontStep((s) => Math.max(0, s - 1))
      } else if (e.key.toLowerCase() === 't') {
        setUseSerif((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const html = useMemo(() => {
    if (!note) return ''
    return removeDuplicateReaderTitle(renderReaderHtml(note.content ?? ''), note.title)
  }, [note])

  // 命令式写入 HTML,避免 React 在 scroll/resize 导致的 re-render 中重置 <video>
  useLayoutEffect(() => {
    if (!isOpen) return
    const article = articleRef.current
    if (!article) return
    if (article.getAttribute('data-html-hash') === hashStr(html)) return
    article.innerHTML = html
    article.setAttribute('data-html-hash', hashStr(html))
  }, [isOpen, html])

  // 滚动进度 + 章节扫描:handler 从内部读取 DOM,不依赖 html / fontStep
  useEffect(() => {
    if (!isOpen) return
    const shell = shellRef.current
    if (!shell) return

    const scan = () => {
      const article = articleRef.current
      if (!article) return
      const headings = Array.from(article.querySelectorAll('h1, h2, h3')) as HTMLElement[]
      setChapters(
        headings.map((h, i) => {
          const id = h.id || `nv-ch-${i}`
          if (!h.id) h.id = id
          return { id, top: h.offsetTop, title: h.textContent ?? '' }
        }),
      )
    }

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = shell
      const max = Math.max(1, scrollHeight - clientHeight)
      setProgress(Math.min(1, Math.max(0, scrollTop / max)))
    }

    const raf = requestAnimationFrame(() => {
      scan()
      onScroll()
    })

    shell.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', scan)

    // 用 ResizeObserver 监听文章尺寸变化(例如图片加载后高度变化),
    // 无需将 html/fontStep/useSerif 放进 deps 导致重建 handler
    const article = articleRef.current
    const ro = article ? new ResizeObserver(() => scan()) : null
    if (article && ro) ro.observe(article)

    return () => {
      cancelAnimationFrame(raf)
      shell.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', scan)
      ro?.disconnect()
    }
  }, [isOpen])

  const fontSize = FONT_STEPS[fontStep] ?? 1

  const jumpTo = (top: number) => {
    shellRef.current?.scrollTo({ top: Math.max(0, top - 32), behavior: 'smooth' })
  }

  // 工具条默认位置:右侧中部(首次打开时)
  useLayoutEffect(() => {
    if (!isOpen) return
    if (toolbarPos) return
    const el = toolbarRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const defaultX = Math.max(12, window.innerWidth - rect.width - 24)
    const defaultY = Math.max(12, Math.round(window.innerHeight / 2 - rect.height / 2))
    setToolbarPos({ x: defaultX, y: defaultY })
  }, [isOpen, toolbarPos])

  const onToolbarDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = toolbarRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    draggingRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }
  const onToolbarDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = draggingRef.current
    if (!d) return
    const el = toolbarRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = clamp(e.clientX - d.dx, 8, window.innerWidth - rect.width - 8)
    const y = clamp(e.clientY - d.dy, 8, window.innerHeight - rect.height - 8)
    setToolbarPos({ x, y })
  }
  const onToolbarDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = null
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    if (toolbarPos) writeToolbarPos(toolbarPos)
  }

  const toolbarStyle: React.CSSProperties = toolbarPos
    ? { position: 'fixed', left: toolbarPos.x, top: toolbarPos.y, bottom: 'auto', right: 'auto', transform: 'none' }
    : { position: 'fixed', right: 24, top: '50%', bottom: 'auto', left: 'auto', transform: 'translateY(-50%)' }

  return (
    <AnimatePresence>
      {isOpen && note && (
        <motion.div
          key="reader-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          className="fixed inset-0 z-[100]"
          role="dialog"
          aria-label="Reader Mode"
        >
          {/* 顶部朱砂进度条 */}
          <div
            aria-hidden
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: 'transparent',
              zIndex: 110,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: `${progress * 100}%`,
                height: '100%',
                background:
                  'linear-gradient(90deg, var(--nv-color-accent) 0%, var(--nv-color-accent-hover) 100%)',
                transition: 'width 120ms linear',
                boxShadow: '0 0 10px var(--nv-color-accent)',
              }}
            />
          </div>

          {/* 章节小点(左侧,避免与右侧工具条冲突) */}
          {chapters.length > 1 && (
            <div
              style={{
                position: 'fixed',
                left: 18,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 105,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                pointerEvents: 'auto',
              }}
              aria-label="章节导航"
            >
              {chapters.map((ch, idx) => {
                const currentIdx = chapters.reduce((acc, c, i) => {
                  const shell = shellRef.current
                  if (!shell) return acc
                  return c.top <= shell.scrollTop + 80 ? i : acc
                }, 0)
                const active = idx === currentIdx
                return (
                  <button
                    key={ch.id}
                    onClick={() => jumpTo(ch.top)}
                    title={ch.title}
                    aria-label={ch.title}
                    style={{
                      width: active ? 8 : 5,
                      height: active ? 8 : 5,
                      borderRadius: '50%',
                      border: 'none',
                      background: active
                        ? 'var(--nv-color-accent)'
                        : 'var(--nv-color-fg-subtle)',
                      opacity: active ? 1 : 0.38,
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'all 180ms cubic-bezier(0.2, 0, 0, 1)',
                    }}
                  />
                )
              })}
            </div>
          )}

          <div className="nv-reader-shell" ref={shellRef}>
            <div
              className="nv-reader-column nv-reader-html"
              style={{
                fontSize: `${fontSize}rem`,
                fontFamily: useSerif ? 'var(--nv-font-serif)' : 'var(--nv-font-sans)',
              }}
            >
              <header style={{ marginBottom: '2.5rem' }}>
                <div
                  style={{
                    fontSize: '0.8rem',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--nv-color-fg-subtle)',
                    marginBottom: '0.4em',
                  }}
                >
                  Nova · Reader
                </div>
                <h1 style={{ marginTop: 0 }}>{note.title || 'Untitled'}</h1>
                {note.updated_at && (
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--nv-color-fg-subtle)',
                    }}
                  >
                    {new Date(note.updated_at).toLocaleString()}
                  </div>
                )}
              </header>
              {/* 用 ref 管控 innerHTML,避免 React re-render 时重置 <video> */}
              <article ref={articleRef} />
            </div>
          </div>

          {/* v0.19.5 · 阅读模式浮动工具条 —— 默认右侧中部、可拖动、位置持久化
              opacity 交给 CSS 控制(idle 0.55 / hover 1),motion 只做缩放入场 */}
          <motion.div
            ref={toolbarRef}
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.9 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="nv-reader-toolbar nv-glass-sm"
            style={toolbarStyle}
            data-reader-toolbar-vertical="true"
          >
            <div
              className="nv-reader-toolbar-grip"
              onPointerDown={onToolbarDragStart}
              onPointerMove={onToolbarDragMove}
              onPointerUp={onToolbarDragEnd}
              onPointerCancel={onToolbarDragEnd}
              title="拖动工具条"
              aria-label="拖动工具条"
            >
              <GripVertical size={12} strokeWidth={2} />
            </div>
            <button
              onClick={() => setFontStep((s) => Math.max(0, s - 1))}
              aria-label="Decrease font"
              title="缩小字号 ["
            >
              <Minus size={13} strokeWidth={2.2} />
            </button>
            <div className="nv-reader-toolbar-pct">{Math.round(fontSize * 100)}%</div>
            <button
              onClick={() => setFontStep((s) => Math.min(FONT_STEPS.length - 1, s + 1))}
              aria-label="Increase font"
              title="放大字号 ]"
            >
              <Plus size={13} strokeWidth={2.2} />
            </button>
            <div className="nv-reader-toolbar-divider" aria-hidden />
            <button
              onClick={() => setUseSerif((v) => !v)}
              aria-label="Toggle serif"
              title={`切换衬线 T · 当前:${useSerif ? '衬线' : '无衬线'}`}
            >
              <Type size={13} strokeWidth={2.2} />
            </button>
            <div className="nv-reader-toolbar-divider" aria-hidden />
            <div
              className="nv-reader-toolbar-pct"
              aria-label="阅读进度"
              title={`阅读进度 ${Math.round(progress * 100)}%`}
            >
              {Math.round(progress * 100)}%
            </div>
            <div className="nv-reader-toolbar-divider" aria-hidden />
            <button onClick={onClose} aria-label="Exit reader" title="退出阅读模式 Esc">
              <X size={13} strokeWidth={2.2} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

/** Cheap string fingerprint,仅用于跳过冗余 innerHTML 赋值。 */
function hashStr(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36) + ':' + s.length
}

function normalizeHeadingText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function removeDuplicateReaderTitle(html: string, title: string | null | undefined): string {
  const normalizedTitle = normalizeHeadingText(title)
  if (!html || !normalizedTitle) return html

  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
    const container = document.body.firstElementChild
    const firstElement = container?.firstElementChild
    if (firstElement?.tagName.toLowerCase() === 'h1' && normalizeHeadingText(firstElement.textContent) === normalizedTitle) {
      firstElement.remove()
      return container?.innerHTML ?? html
    }
    return html
  }

  return html.replace(/^\s*<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/i, (match, heading) => {
    const plain = String(heading).replace(/<[^>]+>/g, '')
    return normalizeHeadingText(plain) === normalizedTitle ? '' : match
  })
}

export default ReaderMode
