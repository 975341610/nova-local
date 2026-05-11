import DOMPurify from 'dompurify'

const DESKTOP_API_BASE_STORAGE_KEY = 'nova.api.base_url'
let desktopBackendApiBase: string | null = null
let desktopBackendApiBaseResolved = false

const normalizeApiBase = (raw: string | null | undefined) => {
  if (!raw) {
    return null
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    parsed.hash = ''
    parsed.search = ''
    const normalized = parsed.toString().replace(/\/+$/, '')
    if (normalized.endsWith('/api')) {
      return normalized
    }
    return `${normalized}/api`
  } catch {
    return null
  }
}

const getStoredApiBase = () => {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return normalizeApiBase(window.localStorage.getItem(DESKTOP_API_BASE_STORAGE_KEY))
  } catch {
    return null
  }
}

const clearStoredApiBase = () => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.removeItem(DESKTOP_API_BASE_STORAGE_KEY)
  } catch {
    // ignore storage failures
  }
}

const resolveDesktopBackendApiBase = () => {
  if (desktopBackendApiBaseResolved || typeof window === 'undefined') {
    return
  }
  desktopBackendApiBaseResolved = true

  const stored = getStoredApiBase()
  if (stored) {
    desktopBackendApiBase = stored
  } else {
    clearStoredApiBase()
  }

  if (!window.electron?.ipcInvoke) {
    return
  }

  const fetchBase = window.electron.getBackendBaseUrl
    ? window.electron.getBackendBaseUrl()
    : window.electron.ipcInvoke('desktop:get-backend-base-url')

  void fetchBase
    .then((base) => {
      if (typeof base !== 'string') {
        return
      }
      const normalized = normalizeApiBase(base)
      if (!normalized) {
        return
      }
      desktopBackendApiBase = normalized
      try {
        window.localStorage.setItem(DESKTOP_API_BASE_STORAGE_KEY, normalized)
      } catch {
        // ignore storage failures
      }
    })
    .catch(() => {
      // ignore desktop runtime discovery failure and fall back to defaults
    })
}

export const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL
  resolveDesktopBackendApiBase()

  if (desktopBackendApiBase) {
    return desktopBackendApiBase
  }

  const storedApiBase = getStoredApiBase()
  if (storedApiBase) {
    return storedApiBase
  }

  if (typeof window !== 'undefined') {
    if (window.location.hostname.includes('strato-https-proxy')) {
      return `https://${window.location.hostname.replace(/^[0-9]+-/, '8765-')}/api`
    }
    if (window.location.hostname.includes('aime-app.bytedance.net')) {
      return `https://${window.location.hostname}/api`
    }

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      if (window.location.port === '5173' || window.location.port === '4173') {
        return 'http://127.0.0.1:8765/api'
      }
    }
  }

  return 'http://127.0.0.1:8765/api'
}

const normalizeLegacyApiPath = (rawUrl: string) => {
  let value = rawUrl.trim()
  if (!value) {
    return ''
  }

  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim()
  }

  value = value.replace(/\\/g, '/')

  if (/^file:\/\//i.test(value)) {
    try {
      const parsed = new URL(value)
      const pathname = decodeURIComponent(parsed.pathname || '')
      const fileApiMatch = pathname.match(/^\/?[A-Za-z]:\/api(\/.*)?$/i)
      if (fileApiMatch) {
        return `/api${fileApiMatch[1] || ''}`
      }
      return value
    } catch {
      value = value.replace(/^file:\/\/\/?/i, '/')
    }
  }

  const driveApiMatch = value.match(/^\/?[A-Za-z]:\/api(\/.*)?$/i)
  if (driveApiMatch) {
    return `/api${driveApiMatch[1] || ''}`
  }

  const relativeApiMatch = value.match(/^\/?api(\/.*)?$/i)
  if (relativeApiMatch) {
    return `/api${relativeApiMatch[1] || ''}`
  }

  return value
}

const HTML_URL_ATTR_PATTERN = /(\b(?:src|href)\s*=\s*)(["'])([^"']+)\2/gi
const CSS_URL_PATTERN = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi

const isTrustedVideoEmbedUrl = (value: string) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      (host === 'www.youtube.com' && url.pathname.startsWith('/embed/')) ||
      (host === 'youtube.com' && url.pathname.startsWith('/embed/')) ||
      host === 'player.bilibili.com'
    );
  } catch {
    return false;
  }
}

const stripUnsafeIframes = (html: string) => {
  if (!/<iframe[\s>]/i.test(html) || typeof DOMParser === 'undefined') {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('iframe').forEach((iframe) => {
    const src = iframe.getAttribute('src') || '';
    if (!isTrustedVideoEmbedUrl(src)) {
      iframe.remove();
      return;
    }
    iframe.setAttribute('data-embed', 'true');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    iframe.setAttribute('allowfullscreen', 'true');
  });
  return doc.body.innerHTML;
}

const sanitizeEditorHtml = (html: string) => {
  return DOMPurify.sanitize(stripUnsafeIframes(html), {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['iframe', 'figure', 'figcaption'],
    ADD_ATTR: ['data-ai-source-card', 'data-embed', 'allow', 'allowfullscreen', 'referrerpolicy', 'loading'],
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['script', 'object', 'embed', 'meta', 'link'],
  })
}

export const sanitizeLegacyApiUrlsInHtml = (html: string | null | undefined) => {
  if (!html) {
    return html ?? ''
  }

  const shouldRebaseThroughApi = (rawValue: string, normalized: string) => {
    if (!rawValue || !normalized) {
      return false
    }
    if (normalized !== rawValue) {
      return true
    }
    return normalized === '/api' || normalized.startsWith('/api/')
  }

  const normalizedHtml = html.replace(HTML_URL_ATTR_PATTERN, (full, prefix, quote, rawValue) => {
    const normalized = normalizeLegacyApiPath(rawValue)
    if (!normalized || !shouldRebaseThroughApi(rawValue, normalized)) {
      return full
    }
    return `${prefix}${quote}${formatUrl(normalized)}${quote}`
  })

  const normalizedCssHtml = normalizedHtml.replace(CSS_URL_PATTERN, (full, quote, rawValue) => {
    const normalized = normalizeLegacyApiPath(rawValue)
    if (!normalized || !shouldRebaseThroughApi(rawValue, normalized)) {
      return full
    }
    return `url(${quote}${formatUrl(normalized)}${quote})`
  })

  return sanitizeEditorHtml(normalizedCssHtml)
}

export const formatUrl = (url: string | undefined | null) => {
  if (!url) return ''
  const normalized = normalizeLegacyApiPath(url)
  if (!normalized) return ''
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('data:') || normalized.startsWith('blob:')) {
    return normalized
  }
  if (/^file:\/\//i.test(normalized)) {
    return normalized
  }

  const base = getApiBase()
  if (normalized === '/api' || normalized.startsWith('/api/')) {
    const apiBaseWithoutTrailingSlash = base.endsWith('/api') ? base.slice(0, -4) : base
    return `${apiBaseWithoutTrailingSlash}${normalized}`
  }

  return `${base}${normalized.startsWith('/') ? '' : '/'}${normalized}`
}
