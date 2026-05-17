/**
 * nova-block/src/lib/updaterApi.ts
 *
 * Thin typed shim over window.electron.updater.* — M4.
 *
 * The renderer never touches IPC strings directly; it calls updaterApi.X
 * which hides the channel naming convention. Keeps test mocks clean:
 * tests just vi.mock('../lib/updaterApi').
 */

export interface PackageManifest {
  schema_version: number
  package_id: string
  target_version: string
  min_base_version: string
  channel: string
  release_channel: string
  released_at: string
  restart_required: boolean
  requires_electron_restart: boolean
  release_notes_md: string
  size_bytes: number
  files: Array<{ path: string; sha256: string; size: number }>
}

export interface InstalledVersion {
  version: string
  installed_at: string
  is_current: boolean
  healthy: boolean
  disabled: boolean
  failed_count: number
}

export interface ImportResult {
  package_id: string
  cached_path?: string
  manifest: PackageManifest
}

export interface InstallResult {
  success: boolean
  target_version: string
  previous_version: string | null
}

export interface SwitchResult {
  success: boolean
  from_version: string | null
  to_version: string
}

export interface CrashEntry {
  timestamp: string
  version: string
  reason: string
}

export interface RemoteCheckResult {
  available: boolean
  enabled: boolean
  current?: string | null
  latest?: string | null
  channel?: string
  package_url?: string | null
  package_sha256?: string | null
  package_size_bytes?: number | null
  release_notes_md?: string
  released_at?: string | null
  reason?: string
  error?: string
}

type Bridge = {
  ipcInvoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

function bridge(): Bridge {
  const electron = (window as any).electron
  if (!electron || typeof electron.ipcInvoke !== 'function') {
    throw new Error('Electron bridge not available — updater requires the desktop shell')
  }
  return electron
}

export function normalizePackageManifest(raw: Partial<PackageManifest> & Record<string, unknown>): PackageManifest {
  const releaseChannel =
    typeof raw.release_channel === 'string'
      ? raw.release_channel
      : typeof raw.channel === 'string'
        ? raw.channel
        : ''
  return {
    ...(raw as PackageManifest),
    channel: typeof raw.channel === 'string' ? raw.channel : releaseChannel,
    release_channel: releaseChannel,
  }
}

/**
 * pickPackageFile — opens a native file dialog via the main process.
 * Falls back to a plain <input type="file"> in dev when the channel isn't
 * registered.
 */
async function pickPackageFile(): Promise<string | null> {
  try {
    const result = await bridge().ipcInvoke('updater:pick-file')
    return (result as string) ?? null
  } catch (err) {
    console.warn('updater:pick-file failed', err)
    return null
  }
}

export const updaterApi = {
  getCurrentVersion: async (): Promise<string | null> => {
    return (await bridge().ipcInvoke('updater:get-current-version')) as string | null
  },
  getRollbackTarget: async (): Promise<string | null> => {
    return (await bridge().ipcInvoke('updater:get-rollback-target')) as string | null
  },
  listVersions: async (): Promise<InstalledVersion[]> => {
    return (await bridge().ipcInvoke('updater:list-versions')) as InstalledVersion[]
  },
  verify: async (path: string): Promise<PackageManifest> => {
    return normalizePackageManifest(
      (await bridge().ipcInvoke('updater:verify', { path })) as Partial<PackageManifest> &
        Record<string, unknown>,
    )
  },
  importPackage: async (path: string): Promise<ImportResult> => {
    const result = (await bridge().ipcInvoke('updater:import', { path })) as ImportResult
    return {
      ...result,
      manifest: normalizePackageManifest(
        result.manifest as Partial<PackageManifest> & Record<string, unknown>,
      ),
    }
  },
  install: async (packageId: string): Promise<InstallResult> => {
    return (await bridge().ipcInvoke('updater:install', {
      package_id: packageId,
    })) as InstallResult
  },
  switchTo: async (version: string): Promise<SwitchResult> => {
    return (await bridge().ipcInvoke('updater:switch-to', { version })) as SwitchResult
  },
  pickPackageFile,
  readCrashLog: async (): Promise<CrashEntry[]> => {
    try {
      return ((await bridge().ipcInvoke('updater:read-crash-log')) as CrashEntry[]) ?? []
    } catch {
      return []
    }
  },
  checkRemote: async (): Promise<RemoteCheckResult> => {
    return (await bridge().ipcInvoke('updater:check-remote')) as RemoteCheckResult
  },
  downloadAndInstall: async (
    url: string,
    expected?: { sha256?: string | null; size?: number | null },
  ): Promise<InstallResult & { manifest?: PackageManifest }> => {
    const result = (await bridge().ipcInvoke('updater:download-and-install', {
      url,
      sha256: expected?.sha256 ?? undefined,
      size: expected?.size ?? undefined,
    })) as InstallResult & {
      manifest?: PackageManifest
    }
    return result.manifest
      ? {
          ...result,
          manifest: normalizePackageManifest(
            result.manifest as Partial<PackageManifest> & Record<string, unknown>,
          ),
        }
      : result
  },
}

export type UpdaterApi = typeof updaterApi
