import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import viteConfig from '../../vite.config'

describe('desktop build config', () => {
  it('uses relative asset paths for file-protocol Electron builds', () => {
    expect(viteConfig.base).toBe('./')
  })

  it('declares a renderer content security policy in the HTML shell', () => {
    const htmlPath = path.resolve(__dirname, '../../index.html')
    const html = fs.readFileSync(htmlPath, 'utf8')

    expect(html).toContain('Content-Security-Policy')
  })
})
