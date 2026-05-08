/**
 * v0.21.7 · A1 · PlantUML 缓存
 *
 * 策略:
 *   Map<sha1(source), { state, url, svg }>
 *   首次访问 → fetch URL → 把 SVG 字符串存下来, 之后直接命中缓存
 *   取消同一个源码并行多次请求: 同一个 key 共用一个 Promise
 *
 * 离线场景 (公司网/VPN) fetch 失败会标记 state='error', 不会无限重试.
 */
import { plantumlUrl } from './plantumlEncoder'

type Entry =
  | { state: 'loading'; promise: Promise<string>; url: string }
  | { state: 'ready'; svg: string; url: string }
  | { state: 'error'; error: string; url: string }

const cache = new Map<string, Entry>()

async function sha1(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input)
  const crypto = (globalThis as { crypto?: Crypto }).crypto
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-1', enc)
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // fallback: 字符串哈希
  let h = 0
  for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0
  return `f${(h >>> 0).toString(16)}`
}

export async function renderPlantUml(source: string): Promise<{ svg: string; url: string }> {
  const key = await sha1(source)
  const hit = cache.get(key)
  if (hit) {
    if (hit.state === 'ready') return { svg: hit.svg, url: hit.url }
    if (hit.state === 'error') throw new Error(hit.error)
    const svg = await hit.promise
    return { svg, url: hit.url }
  }
  const url = plantumlUrl(source, 'svg')
  const promise = (async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`PlantUML server ${res.status}`)
      const svg = await res.text()
      cache.set(key, { state: 'ready', svg, url })
      return svg
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      cache.set(key, { state: 'error', error: msg, url })
      throw e
    }
  })()
  cache.set(key, { state: 'loading', promise, url })
  const svg = await promise
  return { svg, url }
}

export function peekPlantUml(key: string): Entry | undefined {
  return cache.get(key)
}

export function _clearPlantUmlCache(): void {
  cache.clear()
}
