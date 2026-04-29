import { getApiBase } from './apiUrl'

declare global {
  interface Window {
    electron?: {
      ipcInvoke: (channel: string, ...args: any[]) => Promise<any>
      getBackendBaseUrl?: () => Promise<string>
      onVaultChanged?: (callback: (payload: any) => void) => (() => void)
      onBeforeAppClose?: (callback: () => void | Promise<void>) => (() => void)
      finishBeforeAppClose?: () => void
    }
  }
}

const LOCAL_FIRST_CHANNELS = new Set([
  'notes:list',
  'notes:get',
  'notes:create',
  'folders:create',
  'notes:update',
  'notes:delete',
  'notes:changed',
  'system:open-file',
  'ai:update-ollama',
])

const DESKTOP_API_CHANNELS = new Set([
  'config:get-model',
  'config:update-model',
  'ai:toggle-plugin',
  'system:vault-health',
])

const extractEntityId = (path: string) => {
  const match = path.match(/\/(\d+)(?:\/|$)/)
  return match ? parseInt(match[1], 10) : undefined
}

export async function invoke<T>(channel: string, path: string, options?: any): Promise<T> {
  if (window.electron?.ipcInvoke && (LOCAL_FIRST_CHANNELS.has(channel) || DESKTOP_API_CHANNELS.has(channel))) {
    try {
      if (DESKTOP_API_CHANNELS.has(channel)) {
        const desktopOptions: { method?: string; body?: string } = {}
        if (options?.method) desktopOptions.method = options.method
        if (options?.body !== undefined) desktopOptions.body = options.body
        return await window.electron.ipcInvoke('desktop:api-request', {
          channel,
          path,
          options: Object.keys(desktopOptions).length > 0 ? desktopOptions : undefined,
        })
      }

      const payload = options?.body ? JSON.parse(options.body) : options?.params || {}
      const entityId = extractEntityId(path)
      if (entityId !== undefined && payload.id === undefined) {
        payload.id = entityId
      }
      return await window.electron.ipcInvoke(channel, payload)
    } catch (e) {
      console.error(`IPC call to ${channel} failed:`, e)
      throw e
    }
  }

  const API_BASE = getApiBase()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Request failed')
  }
  return response.json() as Promise<T>
}
