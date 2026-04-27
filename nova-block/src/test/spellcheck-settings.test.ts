import { describe, expect, it, vi } from 'vitest'

import {
  isSpellcheckFeatureEnabled,
  saveSpellcheckFeatureEnabled,
  SPELLCHECK_SETTINGS_CHANGED_EVENT,
} from '../lib/spellcheckSettings'

describe('spellcheckSettings', () => {
  it('defaults spellcheck to enabled when no preference exists', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
    })

    expect(isSpellcheckFeatureEnabled()).toBe(true)

    vi.unstubAllGlobals()
  })

  it('persists the disabled state and notifies active editors', () => {
    const stored = new Map<string, string>()
    const dispatchEvent = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    })
    vi.stubGlobal('window', {
      dispatchEvent,
    })
    vi.stubGlobal('CustomEvent', class {
      type: string
      detail: unknown
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type
        this.detail = init?.detail
      }
    })

    saveSpellcheckFeatureEnabled(false)

    expect(isSpellcheckFeatureEnabled()).toBe(false)
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: SPELLCHECK_SETTINGS_CHANGED_EVENT,
      detail: { enabled: false },
    }))

    vi.unstubAllGlobals()
  })
})
