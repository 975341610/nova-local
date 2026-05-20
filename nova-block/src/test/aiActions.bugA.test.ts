/**
 * Round 3 · 3 bug regression tests
 *
 * Bug A — AI inline action 必须在后端 Literal 白名单内
 *   后端 schemas.py: action: Literal["continue","expand","summarize","rewrite",
 *                                     "translate","outline","ask","search"]
 *   前端 kind: 'rewrite' | 'translate' | 'convert-to-table' | 'custom'
 *   需要 kindToBackendAction(kind) 把所有 kind 映射到合法 action 枚举。
 */
import { describe, it, expect } from 'vitest'
import { kindToBackendAction } from '../lib/novablock/aiActions'

describe('Round3 · Bug A · kindToBackendAction', () => {
  const ALLOWED = new Set([
    'continue',
    'expand',
    'summarize',
    'rewrite',
    'translate',
    'outline',
    'ask',
    'search',
  ])

  it('rewrite → rewrite (后端白名单已支持)', () => {
    expect(kindToBackendAction('rewrite')).toBe('rewrite')
  })

  it('translate → translate (后端白名单已支持)', () => {
    expect(kindToBackendAction('translate')).toBe('translate')
  })

  it('convert-to-table → rewrite (后端无该枚举,降级到 rewrite,真正的指令在 prompt 里)', () => {
    expect(kindToBackendAction('convert-to-table')).toBe('rewrite')
  })

  it('custom → ask (自定义指令走 ask,提示词在 prompt 里)', () => {
    expect(kindToBackendAction('custom')).toBe('ask')
  })

  it('所有返回值必须落在后端白名单内', () => {
    for (const k of ['rewrite', 'translate', 'convert-to-table', 'custom'] as const) {
      const v = kindToBackendAction(k)
      expect(ALLOWED.has(v)).toBe(true)
    }
  })

  it('未知 kind 退化为 ask (不抛、不污染 inline)', () => {
    expect(kindToBackendAction('not-a-kind')).toBe('ask')
  })
})
