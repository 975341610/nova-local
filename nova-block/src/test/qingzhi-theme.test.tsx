// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NovaThemeProvider, THEME_LIST, THEME_META, useNovaTheme } from '../contexts/ThemeContext'

function ThemeProbe() {
  const { theme, cycleTheme, setTheme } = useNovaTheme()
  return (
    <div>
      <div data-testid="theme-value">{theme}</div>
      <button type="button" data-testid="cycle-theme" onClick={() => cycleTheme()}>cycle</button>
      <button type="button" data-testid="set-qingzhi" onClick={() => setTheme('qingzhi')}>qingzhi</button>
    </div>
  )
}

describe('QingZhi default theme', () => {
  it('uses qingzhi as the only exposed Nova theme', () => {
    expect(THEME_LIST).toEqual(['qingzhi'])
    expect(Object.keys(THEME_META)).toEqual(['qingzhi'])
    expect(THEME_META.qingzhi.label).toBe('清知')
  })

  it('applies qingzhi to document on initial paint and keeps cycleTheme on qingzhi', async () => {
    localStorage.setItem('nv-theme-v2', 'ink-midnight')

    render(
      <NovaThemeProvider>
        <ThemeProbe />
      </NovaThemeProvider>,
    )

    expect(screen.getByTestId('theme-value').textContent).toBe('qingzhi')

    await waitFor(() => {
      expect(document.documentElement.dataset.nvTheme).toBe('qingzhi')
      expect(document.documentElement.dataset.theme).toBe('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    screen.getByTestId('cycle-theme').click()
    expect(screen.getByTestId('theme-value').textContent).toBe('qingzhi')
  })
})
