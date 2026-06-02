export type QingzhiTopbarActionId =
  | 'daily'
  | 'command'
  | 'reader'
  | 'inspect'
  | 'graph'
  | 'ask'
  | 'export'
  | 'timeline'

export interface QingzhiTopbarActionMeta {
  id: QingzhiTopbarActionId
  label: string
  hint: string
}

export interface QingzhiSettings {
  topbarPins: QingzhiTopbarActionId[]
  mascotOpacity: number
  brandLogoSrc?: string
  avatarSrc?: string
  mascotSrc?: string
}

export const QINGZHI_SETTINGS_STORAGE_KEY = 'qz-settings-v1'
export const QINGZHI_SETTINGS_EVENT = 'qingzhi-settings-change'

export const QINGZHI_TOPBAR_ACTIONS: QingzhiTopbarActionMeta[] = [
  { id: 'daily', label: '日历', hint: '打开日历与日记' },
  { id: 'command', label: '命令面板', hint: '打开命令面板' },
  { id: 'reader', label: '阅读', hint: '进入阅读模式' },
  { id: 'inspect', label: '检视', hint: '打开右侧检视面板' },
  { id: 'graph', label: '图谱', hint: '打开 Graph View' },
  { id: 'ask', label: 'AI 灵感', hint: 'Ask My Notes' },
  { id: 'export', label: '导出', hint: '导出为静态站点' },
  { id: 'timeline', label: '时间轴', hint: '打开时间轴' },
]

const ACTION_IDS = new Set<QingzhiTopbarActionId>(QINGZHI_TOPBAR_ACTIONS.map((action) => action.id))

export const DEFAULT_QINGZHI_SETTINGS: QingzhiSettings = {
  topbarPins: ['daily', 'command', 'reader', 'inspect'],
  mascotOpacity: 0.15,
  brandLogoSrc: '',
  avatarSrc: '',
  mascotSrc: '',
}

function normalizeAssetSrc(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function clampMascotOpacity(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_QINGZHI_SETTINGS.mascotOpacity
  return Math.min(0.35, Math.max(0, numeric))
}

function normalizeTopbarPins(value: unknown): QingzhiTopbarActionId[] {
  if (!Array.isArray(value)) return DEFAULT_QINGZHI_SETTINGS.topbarPins
  const pins = value.filter((item): item is QingzhiTopbarActionId => ACTION_IDS.has(item as QingzhiTopbarActionId))
  return pins.length > 0 ? Array.from(new Set(pins)).slice(0, 4) : DEFAULT_QINGZHI_SETTINGS.topbarPins
}

export function readQingzhiSettings(): QingzhiSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_QINGZHI_SETTINGS

  try {
    const raw = localStorage.getItem(QINGZHI_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_QINGZHI_SETTINGS
    const parsed = JSON.parse(raw) as Partial<QingzhiSettings>
    return {
      topbarPins: normalizeTopbarPins(parsed.topbarPins),
      mascotOpacity: clampMascotOpacity(parsed.mascotOpacity),
      brandLogoSrc: normalizeAssetSrc(parsed.brandLogoSrc) || normalizeAssetSrc(localStorage.getItem('qz.logo.src')),
      avatarSrc: normalizeAssetSrc(parsed.avatarSrc) || normalizeAssetSrc(localStorage.getItem('qz.avatar.src')),
      mascotSrc: normalizeAssetSrc(parsed.mascotSrc) || normalizeAssetSrc(localStorage.getItem('qz.mascot.src')),
    }
  } catch {
    return DEFAULT_QINGZHI_SETTINGS
  }
}

export function applyQingzhiSettings(settings: QingzhiSettings) {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--qz-mascot-opacity', String(clampMascotOpacity(settings.mascotOpacity)))
  document.documentElement.style.setProperty('--qz-brand-logo-image', settings.brandLogoSrc ? `url("${settings.brandLogoSrc}")` : 'none')
  document.documentElement.style.setProperty('--qz-avatar-image', settings.avatarSrc ? `url("${settings.avatarSrc}")` : 'none')
  document.documentElement.style.setProperty('--qz-mascot-image', settings.mascotSrc ? `url("${settings.mascotSrc}")` : 'url("/assets/qingzhi/mascot/sidebar-standing.webp")')
}

export function saveQingzhiSettings(settings: QingzhiSettings): QingzhiSettings {
  const normalized: QingzhiSettings = {
    topbarPins: normalizeTopbarPins(settings.topbarPins),
    mascotOpacity: clampMascotOpacity(settings.mascotOpacity),
    brandLogoSrc: normalizeAssetSrc(settings.brandLogoSrc),
    avatarSrc: normalizeAssetSrc(settings.avatarSrc),
    mascotSrc: normalizeAssetSrc(settings.mascotSrc),
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(QINGZHI_SETTINGS_STORAGE_KEY, JSON.stringify(normalized))
    if (normalized.brandLogoSrc) localStorage.setItem('qz.logo.src', normalized.brandLogoSrc)
    else localStorage.removeItem('qz.logo.src')
    if (normalized.avatarSrc) localStorage.setItem('qz.avatar.src', normalized.avatarSrc)
    else localStorage.removeItem('qz.avatar.src')
    if (normalized.mascotSrc) localStorage.setItem('qz.mascot.src', normalized.mascotSrc)
    else localStorage.removeItem('qz.mascot.src')
  }
  applyQingzhiSettings(normalized)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QINGZHI_SETTINGS_EVENT, { detail: normalized }))
  }

  return normalized
}
