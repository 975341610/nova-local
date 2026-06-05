export type AttachmentKind = 'document' | 'image' | 'video' | 'audio' | 'file'

export type AttachmentInventoryItem = {
  kind: AttachmentKind
  src: string
  name: string
  size?: number
  type?: string
}

export type AttachmentInventorySummary = {
  total: number
  totalBytes: number
  byKind: Record<AttachmentKind, number>
}

const EMPTY_COUNTS: Record<AttachmentKind, number> = {
  document: 0,
  image: 0,
  video: 0,
  audio: 0,
  file: 0,
}

function parseNoteHtml(content: string): Document {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(content || '', 'text/html')
  }

  const doc = document.implementation.createHTMLDocument('')
  doc.body.innerHTML = content || ''
  return doc
}

function filenameFromSrc(src: string): string {
  const clean = src.split(/[?#]/)[0] || src
  const last = clean.split('/').filter(Boolean).pop()
  return decodeURIComponent(last || '未命名附件')
}

function parseSize(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function inferKind(name = '', type = ''): AttachmentKind {
  const value = `${name} ${type}`.toLowerCase()
  if (/image\/|\.(png|jpe?g|gif|webp|bmp|svg)\b/.test(value)) return 'image'
  if (/video\/|\.(mp4|mov|webm|mkv|avi)\b/.test(value)) return 'video'
  if (/audio\/|\.(mp3|wav|m4a|flac|ogg)\b/.test(value)) return 'audio'
  if (/pdf|word|markdown|text\/markdown|\.(pdf|docx?|md|markdown|txt)\b/.test(value)) return 'document'
  return 'file'
}

function pushUnique(items: AttachmentInventoryItem[], next: AttachmentInventoryItem, seen: Set<string>) {
  if (!next.src) return
  const key = `${next.kind}|${next.src}|${next.name}`
  if (seen.has(key)) return
  seen.add(key)
  items.push(next)
}

export function collectAttachmentInventory(content: string): AttachmentInventoryItem[] {
  const doc = parseNoteHtml(content)
  const items: AttachmentInventoryItem[] = []
  const seen = new Set<string>()

  doc.querySelectorAll<HTMLElement>('div[data-type="file-card"]').forEach((element) => {
    const src = element.getAttribute('src') || ''
    const name = element.getAttribute('name') || filenameFromSrc(src)
    const type = element.getAttribute('type') || undefined
    pushUnique(
      items,
      {
        kind: inferKind(name, type),
        src,
        name,
        type,
        size: parseSize(element.getAttribute('size')),
      },
      seen,
    )
  })

  doc.querySelectorAll<HTMLImageElement>('img[src]').forEach((element) => {
    const src = element.getAttribute('src') || ''
    pushUnique(items, { kind: 'image', src, name: element.getAttribute('alt') || filenameFromSrc(src) }, seen)
  })

  doc.querySelectorAll<HTMLVideoElement>('video[src]').forEach((element) => {
    const src = element.getAttribute('src') || ''
    pushUnique(items, { kind: 'video', src, name: filenameFromSrc(src) }, seen)
  })

  doc.querySelectorAll<HTMLAudioElement>('audio[src]').forEach((element) => {
    const src = element.getAttribute('src') || ''
    pushUnique(items, { kind: 'audio', src, name: filenameFromSrc(src) }, seen)
  })

  return items
}

export function summarizeAttachmentInventory(items: AttachmentInventoryItem[]): AttachmentInventorySummary {
  const byKind = { ...EMPTY_COUNTS }
  let totalBytes = 0

  for (const item of items) {
    byKind[item.kind] += 1
    totalBytes += item.size || 0
  }

  return {
    total: items.length,
    totalBytes,
    byKind,
  }
}
