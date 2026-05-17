import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(__dirname, '../..')
const assetRoot = resolve(projectRoot, 'public/assets/qingzhi')

const requiredAssets = [
  'avatar/default.webp',
  'decoration/stamp.svg',
  'decoration/flower.svg',
  'icons/sprite.svg',
  'mascot/sidebar-standing.webp',
  'stickers/16-welcome.webp',
  'stickers/13-hmm.webp',
  'stickers/18-ai-summary.webp',
  'uploaded/illustration-decoration.webp',
  'uploaded/qingzhi-standee.webp',
  'uploaded/qingzhi-avatar-sheet.webp',
]

describe('QingZhi assets', () => {
  it('ships the avatar, decoration, mascot, sticker and uploaded artwork assets used by the app shell', () => {
    for (const relativePath of requiredAssets) {
      const path = resolve(assetRoot, relativePath)
      expect(existsSync(path), `${relativePath} should exist`).toBe(true)
      expect(statSync(path).size, `${relativePath} should not be empty`).toBeGreaterThan(0)
    }
  })
})
