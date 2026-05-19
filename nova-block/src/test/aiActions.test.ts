/**
 * Batch 6 · F3 · AI Actions 单元契约
 *
 * - buildPrompt(kind, input) 生成包含关键意图词 + 用户输入的 prompt
 * - parseAIResult('table', raw) 剥离 markdown 围栏
 * - runAIAction 透传 kind/text 到注入的 transport
 * - 空输入直接返回输入,不调 transport
 * - transport 抛错时抛带 kind 的错误
 */
import { describe, it, expect, vi } from 'vitest'
import {
  buildPrompt,
  parseAIResult,
  runAIAction,
  type AIActionKind,
} from '../lib/novablock/aiActions'

describe('aiActions · buildPrompt', () => {
  it('rewrite prompt mentions 重写 and contains user text', () => {
    const p = buildPrompt('rewrite', 'hello world')
    expect(p).toMatch(/重写|改写/)
    expect(p).toContain('hello world')
  })

  it('translate prompt mentions 翻译 and contains user text', () => {
    const p = buildPrompt('translate', '你好世界')
    expect(p).toMatch(/翻译/)
    expect(p).toContain('你好世界')
  })

  it('convert-to-table prompt mentions Markdown table', () => {
    const p = buildPrompt('convert-to-table', 'a,b\n1,2')
    expect(p.toLowerCase()).toMatch(/markdown.*table|表格/)
    expect(p).toContain('a,b')
  })
})

describe('aiActions · parseAIResult', () => {
  it('strips ```markdown / ```table fenced blocks', () => {
    const raw = '```markdown\n| A | B |\n| - | - |\n| 1 | 2 |\n```'
    const out = parseAIResult('convert-to-table', raw)
    expect(out.startsWith('|')).toBe(true)
    expect(out).not.toContain('```')
  })

  it('passes through plain text untouched', () => {
    expect(parseAIResult('rewrite', 'hello again')).toBe('hello again')
  })

  it('trims surrounding whitespace', () => {
    expect(parseAIResult('translate', '  hi  \n')).toBe('hi')
  })
})

describe('aiActions · runAIAction', () => {
  it('invokes transport once with kind + text', async () => {
    const transport = vi.fn().mockResolvedValue('OK')
    const result = await runAIAction(
      { kind: 'rewrite' as AIActionKind, text: 'foo' },
      { transport }
    )
    expect(result).toBe('OK')
    expect(transport).toHaveBeenCalledTimes(1)
    const call = transport.mock.calls[0][0]
    expect(call.kind).toBe('rewrite')
    expect(call.text).toBe('foo')
    expect(typeof call.prompt).toBe('string')
    expect(call.prompt).toContain('foo')
  })

  it('returns input unchanged for empty / whitespace-only text without calling transport', async () => {
    const transport = vi.fn()
    const result = await runAIAction(
      { kind: 'translate', text: '   ' },
      { transport }
    )
    expect(result).toBe('   ')
    expect(transport).not.toHaveBeenCalled()
  })

  it('wraps transport rejection with the action kind in the error message', async () => {
    const transport = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(
      runAIAction({ kind: 'convert-to-table', text: 'a,b' }, { transport })
    ).rejects.toThrow(/convert-to-table/)
  })
})
