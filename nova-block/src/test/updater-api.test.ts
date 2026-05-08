// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { normalizePackageManifest, updaterApi } from '../lib/updaterApi'

const rawManifest = {
  schema_version: 1,
  package_id: 'pkg-1',
  target_version: '1.2.3',
  min_base_version: '1.0.0',
  release_channel: 'stable',
  released_at: '2026-05-08T00:00:00Z',
  restart_required: true,
  requires_electron_restart: true,
  release_notes_md: 'notes',
  size_bytes: 10,
  files: [],
}

describe('updaterApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as typeof window & { electron?: unknown }).electron
  })

  it('normalizes backend release_channel into the renderer channel field', () => {
    expect(normalizePackageManifest(rawManifest).channel).toBe('stable')
  })

  it('normalizes verified local package manifests returned by IPC', async () => {
    const ipcInvoke = vi.fn().mockResolvedValue(rawManifest)
    ;(window as typeof window & { electron?: { ipcInvoke: typeof ipcInvoke } }).electron = { ipcInvoke }

    const manifest = await updaterApi.verify('C:/updates/pkg.nova-update')

    expect(ipcInvoke).toHaveBeenCalledWith('updater:verify', {
      path: 'C:/updates/pkg.nova-update',
    })
    expect(manifest.channel).toBe('stable')
    expect(manifest.release_channel).toBe('stable')
  })
})
