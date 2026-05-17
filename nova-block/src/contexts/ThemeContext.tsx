import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type NovaTheme = 'qingzhi'

const THEME_STORAGE_KEY = 'nv-theme-v2'
const THEMES: NovaTheme[] = ['qingzhi']

function readSavedTheme(): NovaTheme {
  return 'qingzhi'
}

function applyThemeToDocument(theme: NovaTheme) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  html.dataset.nvTheme = theme
  html.classList.remove('dark')
  html.dataset.theme = 'light'
}

/**
 * 翻页切换动画 —— 制造"翻开下一张纸"的错觉。
 * 用 CSS transform + requestAnimationFrame 实现，不依赖 framer-motion（浮层场景）。
 */
function pageFlipTransition(nextTheme: NovaTheme) {
  if (typeof document === 'undefined') {
    applyThemeToDocument(nextTheme)
    return
  }
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyThemeToDocument(nextTheme)
    return
  }

  const existing = document.querySelector('.nv-theme-flip-overlay') as HTMLDivElement | null
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.className = 'nv-theme-flip-overlay'
  overlay.style.transform = 'perspective(1800px) rotateY(0deg)'
  overlay.style.transition = 'transform 560ms cubic-bezier(0.87, 0, 0.13, 1), opacity 400ms 360ms ease-out'
  document.body.appendChild(overlay)

  // swap the underlying theme immediately (overlay is hiding it)
  applyThemeToDocument(nextTheme)

  requestAnimationFrame(() => {
    overlay.style.transform = 'perspective(1800px) rotateY(-100deg)'
    overlay.style.opacity = '0'
  })

  window.setTimeout(() => {
    overlay.remove()
  }, 620)
}

type ThemeContextValue = {
  theme: NovaTheme
  setTheme: (theme: NovaTheme, opts?: { animated?: boolean }) => void
  cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function NovaThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<NovaTheme>(() => readSavedTheme())

  // initial paint
  useEffect(() => {
    applyThemeToDocument(theme)
  }, [])

  const setTheme = useCallback((next: NovaTheme, opts?: { animated?: boolean }) => {
    setThemeState(prev => {
      if (prev === next) return prev
      localStorage.setItem(THEME_STORAGE_KEY, next)
      if (opts?.animated !== false) {
        pageFlipTransition(next)
      } else {
        applyThemeToDocument(next)
      }
      return next
    })
  }, [])

  const cycleTheme = useCallback(() => {
    setThemeState(prev => {
      localStorage.setItem(THEME_STORAGE_KEY, 'qingzhi')
      applyThemeToDocument('qingzhi')
      return prev
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useNovaTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    // graceful fallback for components that mount before provider
    return {
      theme: 'qingzhi',
      setTheme: () => {},
      cycleTheme: () => {},
    }
  }
  return ctx
}

export const THEME_META: Record<NovaTheme, { label: string; hint: string; icon: string }> = {
  qingzhi: { label: '清知', hint: '宣纸 · 玉色 · 暖金', icon: '知' },
}

export const THEME_LIST = THEMES
