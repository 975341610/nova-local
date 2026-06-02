// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from 'vitest'

import {
  DEFAULT_QINGZHI_SETTINGS,
  QINGZHI_SETTINGS_STORAGE_KEY,
  applyQingzhiSettings,
  readQingzhiSettings,
  saveQingzhiSettings,
} from '../lib/qingzhiSettings'

describe('QingZhi settings model', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('style')
  })

  it('defaults to the preview topbar pins and mascot opacity', () => {
    expect(readQingzhiSettings()).toEqual(DEFAULT_QINGZHI_SETTINGS)
  })

  it('persists topbar pins and applies mascot opacity as a CSS variable', () => {
    const saved = saveQingzhiSettings({
      topbarPins: ['command', 'graph', 'ask'],
      mascotOpacity: 0.22,
    })

    expect(saved.topbarPins).toEqual(['command', 'graph', 'ask'])
    expect(localStorage.getItem(QINGZHI_SETTINGS_STORAGE_KEY)).toContain('graph')
    expect(readQingzhiSettings()).toEqual(saved)

    applyQingzhiSettings(saved)
    expect(document.documentElement.style.getPropertyValue('--qz-mascot-opacity')).toBe('0.22')
  })

  it('persists custom brand assets and exposes matching css variables', () => {
    const saved = saveQingzhiSettings({
      topbarPins: ['daily', 'command'],
      mascotOpacity: 0.16,
      brandLogoSrc: 'data:image/png;base64,logo',
      avatarSrc: 'data:image/png;base64,avatar',
      mascotSrc: 'data:image/png;base64,mascot',
    })

    expect(readQingzhiSettings()).toEqual(saved)
    applyQingzhiSettings(saved)
    expect(document.documentElement.style.getPropertyValue('--qz-brand-logo-image')).toContain('data:image/png;base64,logo')
    expect(document.documentElement.style.getPropertyValue('--qz-avatar-image')).toContain('data:image/png;base64,avatar')
    expect(document.documentElement.style.getPropertyValue('--qz-mascot-image')).toContain('data:image/png;base64,mascot')
  })

  it('defaults the window close button to quitting and persists hide-to-background mode', () => {
    expect(readQingzhiSettings().windowCloseBehavior).toBe('quit')

    const saved = saveQingzhiSettings({
      ...DEFAULT_QINGZHI_SETTINGS,
      windowCloseBehavior: 'hide',
    })

    expect(saved.windowCloseBehavior).toBe('hide')
    expect(readQingzhiSettings().windowCloseBehavior).toBe('hide')
  })
})
