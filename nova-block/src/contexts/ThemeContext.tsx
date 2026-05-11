import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type NovaTheme = 'rice-paper' | 'ink-midnight' | 'bamboo'

const THEME_STORAGE_KEY = 'nv-theme-v2'
const THEMES: NovaTheme[] = ['rice-paper', 'ink-midnight', 'bamboo']

function readSavedTheme(): NovaTheme {
  if (typeof localStorage === 'undefined') return 'rice-paper'
  const saved = localStorage.getItem(THEME_STORAGE_KEY)
  if (saved && (THEMES as string[]).includes(saved)) return saved as NovaTheme
  // migrate from v1 (dark / light)
  const legacy = localStorage.getItem('nv-theme')
  if (legacy === 'dark') return 'ink-midnight'
  return 'rice-paper'
}

function applyThemeToDocument(theme: NovaTheme) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  html.dataset.nvTheme = theme
  // keep `.dark` + `data-theme="dark"` compatibility with tailwind-dark utilities
  if (theme === 'ink-midnight') {
    html.classList.add('dark')
    html.dataset.theme = 'dark'
  } else {
    html.classList.remove('dark')
    html.dataset.theme = 'light'
  }
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
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
      const idx = THEMES.indexOf(prev)
      const next = THEMES[(idx + 1) % THEMES.length]
      localStorage.setItem(THEME_STORAGE_KEY, next)
      pageFlipTransition(next)
      return next
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
      theme: 'rice-paper',
      setTheme: () => {},
      cycleTheme: () => {},
    }
  }
  return ctx
}

export const THEME_META: Record<NovaTheme, { label: string; hint: string; icon: string }> = {
  'rice-paper': { label: '宣纸', hint: '晴日 · 静', icon: '☀️' },
  'ink-midnight': { label: '墨夜', hint: '深夜 · 思', icon: '🌙' },
  'bamboo': { label: '青竹', hint: '雨天 · 润', icon: '🌿' },
}

export const THEME_LIST = THEMES
