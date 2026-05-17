import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('QingZhi visual identity', () => {
  it('defines the QingZhi theme tokens used by the V9 shell', () => {
    const indexCss = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf8')
    const themesCss = fs.readFileSync(path.resolve(__dirname, '../styles/themes.css'), 'utf8')
    const refineCss = fs.readFileSync(path.resolve(__dirname, '../styles/qingzhi-refine-v34.css'), 'utf8')
    const css = `${indexCss}\n${themesCss}\n${refineCss}`

    expect(css).toContain('[data-nv-theme="qingzhi"]')
    expect(css).toContain('--qz-jade')
    expect(css).toContain('--qz-gold')
    expect(css).toContain('--qz-stone')
    expect(css).toContain('.qz-app-shell')
    expect(css).toContain('.qz-sidebar')
    expect(css).toContain('/assets/qingzhi/')
  })

  it('brands the main sidebar as QingZhi', () => {
    const sidebarPath = path.resolve(__dirname, '../components/sidebar/SidebarTree.tsx')
    const sidebar = fs.readFileSync(sidebarPath, 'utf8')

    expect(sidebar).toContain('清知')
    expect(sidebar).toContain('qz-sidebar')
  })

  it('ships the QingZhi IP artwork used by the empty state', () => {
    const assetPath = path.resolve(__dirname, '../../public/assets/qingzhi-ip.webp')

    expect(fs.existsSync(assetPath)).toBe(true)
  })
})
