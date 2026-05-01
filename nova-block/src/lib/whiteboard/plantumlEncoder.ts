/**
 * v0.21.7 · A1 · PlantUML encoder
 *
 * PlantUML server 接受的 URL 格式:
 *   http://www.plantuml.com/plantuml/svg/<encoded>
 *
 * 编码算法:
 *   1. UTF-8 编码源码
 *   2. DEFLATE raw (无 zlib header)
 *   3. 自定义 base64-like 编码 (alphabet: 0-9A-Za-z-_)
 *
 * 每 3 字节输入 → 4 个字符输出.
 */
import { deflateSync } from 'fflate'

const PLANTUML_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

function encode6bit(b: number): string {
  return PLANTUML_ALPHABET[b & 0x3f] ?? '?'
}

function append3bytes(b1: number, b2: number, b3: number): string {
  const c1 = b1 >> 2
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4)
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6)
  const c4 = b3 & 0x3f
  return encode6bit(c1) + encode6bit(c2) + encode6bit(c3) + encode6bit(c4)
}

export function encode64(bytes: Uint8Array): string {
  let out = ''
  const len = bytes.length
  let i = 0
  while (i + 3 <= len) {
    out += append3bytes(bytes[i], bytes[i + 1], bytes[i + 2])
    i += 3
  }
  if (i === len - 1) {
    out += append3bytes(bytes[i], 0, 0)
  } else if (i === len - 2) {
    out += append3bytes(bytes[i], bytes[i + 1], 0)
  }
  return out
}

/**
 * 对 PlantUML 源码编码, 返回可拼进 URL 的字符串.
 */
export function encodePlantUml(source: string): string {
  const utf8 = new TextEncoder().encode(source)
  const compressed = deflateSync(utf8, { level: 9 })
  return encode64(compressed)
}

export function plantumlUrl(source: string, kind: 'svg' | 'png' = 'svg'): string {
  return `https://www.plantuml.com/plantuml/${kind}/${encodePlantUml(source)}`
}
