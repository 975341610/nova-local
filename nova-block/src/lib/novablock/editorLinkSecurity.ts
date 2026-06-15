export function isSafeEditorLinkHref(href: string): boolean {
  const trimmed = href.trim()
  if (!trimmed) return false

  try {
    const baseHref = typeof window !== 'undefined' ? window.location.href : 'http://localhost/'
    const url = new URL(trimmed, baseHref)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
  } catch {
    return false
  }
}
