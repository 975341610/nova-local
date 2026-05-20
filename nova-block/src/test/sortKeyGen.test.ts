/**
 * Tests for sortKeyGen — 严格大于 base 的字典序键生成。
 */
import { describe, it, expect } from 'vitest'
import { generateAfter, generateSequenceAfter } from '../lib/novablock/sortKeyGen'

describe('generateAfter', () => {
  it('返回 > 空 base 的默认 key', () => {
    expect(generateAfter('').localeCompare('')).toBeGreaterThan(0)
    expect(generateAfter(null).localeCompare('')).toBeGreaterThan(0)
    expect(generateAfter(undefined).localeCompare('')).toBeGreaterThan(0)
  })

  it('严格 > 单字符 base', () => {
    expect(generateAfter('a').localeCompare('a')).toBeGreaterThan(0)
    expect(generateAfter('m').localeCompare('m')).toBeGreaterThan(0)
    expect(generateAfter('y').localeCompare('y')).toBeGreaterThan(0)
  })

  it('末位为 z 时追加,而非进位', () => {
    const r = generateAfter('z')
    expect(r.localeCompare('z')).toBeGreaterThan(0)
    expect(r.startsWith('z')).toBe(true)
  })

  it('严格 > 多字符 base', () => {
    expect(generateAfter('mm').localeCompare('mm')).toBeGreaterThan(0)
    expect(generateAfter('mz').localeCompare('mz')).toBeGreaterThan(0)
    expect(generateAfter('mzz').localeCompare('mzz')).toBeGreaterThan(0)
  })
})

describe('generateSequenceAfter', () => {
  it('生成 count 个严格递增 key', () => {
    const seq = generateSequenceAfter('m', 5)
    expect(seq.length).toBe(5)
    expect(seq[0].localeCompare('m')).toBeGreaterThan(0)
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i].localeCompare(seq[i - 1])).toBeGreaterThan(0)
    }
  })

  it('与已有 sibling 的 max key 不冲突 (回归 bug 1)', () => {
    // 模拟目标文件夹下已有的 sibling 键
    const existing = ['a', 'g', 'm', 'mm', 'mz', 'n', 'p']
    const max = existing.reduce((a, b) => (a.localeCompare(b) > 0 ? a : b))
    const newSeq = generateSequenceAfter(max, 3)
    // 全部新 key 都应严格大于现有 max
    for (const k of newSeq) {
      expect(k.localeCompare(max)).toBeGreaterThan(0)
    }
    // 全部新 key 应保持彼此严格递增
    for (let i = 1; i < newSeq.length; i++) {
      expect(newSeq[i].localeCompare(newSeq[i - 1])).toBeGreaterThan(0)
    }
    // 关键: 把现有 + 新生成 一起按字典序排,新 key 全部排在 existing 最大值之后
    const combined = [...existing, ...newSeq].sort((a, b) => a.localeCompare(b))
    const maxIdx = combined.indexOf(max)
    for (const k of newSeq) {
      expect(combined.indexOf(k)).toBeGreaterThan(maxIdx)
    }
  })

  it('count=0 返回空数组', () => {
    expect(generateSequenceAfter('m', 0)).toEqual([])
  })
})
