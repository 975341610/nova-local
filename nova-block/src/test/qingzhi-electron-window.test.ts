import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../..')
const rootMainProcess = readFileSync(resolve(repoRoot, 'electron/main.js'), 'utf8')
const activeSlotMainProcess = readFileSync(resolve(repoRoot, 'versions/0.24.0/electron/main.js'), 'utf8')

describe('QingZhi Electron window chrome', () => {
  it('uses the custom QingZhi topbar as the only visible titlebar in root and active slot', () => {
    for (const mainProcess of [rootMainProcess, activeSlotMainProcess]) {
      expect(mainProcess).toContain('frame: false')
      expect(mainProcess).toContain('desktop:window-control')
    }
  })
})
