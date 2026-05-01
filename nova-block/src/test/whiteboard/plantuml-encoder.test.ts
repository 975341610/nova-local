/**
 * v0.21.7 · A1 · PlantUML encoder round-trip tests
 *
 * 无网络环境, 不能直接校验 server 响应, 改为:
 *   1. 对编码产物做字符集验证
 *   2. round-trip: 自己解码 + inflate 还原出原串
 *   3. 针对已知小样本, 校验长度/字符的稳定性质
 */
import { describe, expect, it } from 'vitest'
import { inflateSync } from 'fflate'
import { encode64, encodePlantUml, plantumlUrl } from '../../lib/whiteboard/plantumlEncoder'

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

function decode6bit(c: string): number {
  const i = ALPHABET.indexOf(c)
  if (i < 0) throw new Error(`bad char: ${c}`)
  return i
}

function decodePlantuml64(s: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i + 4 <= s.length; i += 4) {
    const c1 = decode6bit(s[i])
    const c2 = decode6bit(s[i + 1])
    const c3 = decode6bit(s[i + 2])
    const c4 = decode6bit(s[i + 3])
    out.push(((c1 << 2) | (c2 >> 4)) & 0xff)
    out.push((((c2 & 0xf) << 4) | (c3 >> 2)) & 0xff)
    out.push((((c3 & 0x3) << 6) | c4) & 0xff)
  }
  return new Uint8Array(out)
}

describe('plantumlEncoder.encode64', () => {
  it('only emits plantuml alphabet chars', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 255, 254, 250])
    const enc = encode64(bytes)
    for (const ch of enc) {
      expect(ALPHABET.includes(ch)).toBe(true)
    }
  })

  it('encodes 3 bytes to 4 chars', () => {
    expect(encode64(new Uint8Array([0, 0, 0])).length).toBe(4)
    expect(encode64(new Uint8Array([0, 0, 0, 0, 0, 0])).length).toBe(8)
  })

  it('pads tail bytes with zeros', () => {
    // 1 byte -> 4 chars (treated like 3 bytes with trailing zeros)
    expect(encode64(new Uint8Array([0])).length).toBe(4)
    expect(encode64(new Uint8Array([0, 0])).length).toBe(4)
  })

  it('round-trips arbitrary bytes (first 3-byte-aligned prefix)', () => {
    const original = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90])
    const enc = encode64(original)
    const back = decodePlantuml64(enc)
    expect(Array.from(back)).toEqual(Array.from(original))
  })
})

describe('plantumlEncoder.encodePlantUml', () => {
  it('produces stable non-empty encoding for a known source', () => {
    const src = '@startuml\nA -> B\n@enduml'
    const enc = encodePlantUml(src)
    expect(enc.length).toBeGreaterThan(0)
    for (const ch of enc) {
      expect(ALPHABET.includes(ch)).toBe(true)
    }
  })

  it('round-trips: encoded → plantuml-decode → inflateRaw → utf8 == source', () => {
    const src = '@startuml\nAlice -> Bob : hi\n@enduml'
    const enc = encodePlantUml(src)
    const compressed = decodePlantuml64(enc)
    const raw = inflateSync(compressed)
    const back = new TextDecoder().decode(raw)
    expect(back).toBe(src)
  })

  it('different sources produce different encodings', () => {
    const a = encodePlantUml('@startuml\nA -> B\n@enduml')
    const b = encodePlantUml('@startuml\nC -> D\n@enduml')
    expect(a).not.toBe(b)
  })
})

describe('plantumlEncoder.plantumlUrl', () => {
  it('produces https svg URL by default', () => {
    const url = plantumlUrl('@startuml\nA\n@enduml')
    expect(url.startsWith('https://www.plantuml.com/plantuml/svg/')).toBe(true)
  })

  it('supports png kind', () => {
    const url = plantumlUrl('@startuml\nA\n@enduml', 'png')
    expect(url.startsWith('https://www.plantuml.com/plantuml/png/')).toBe(true)
  })
})
