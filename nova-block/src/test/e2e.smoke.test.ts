/**
 * @vitest-environment jsdom
 *
 * Batch 7 · Smoke regression
 *
 * 把 F1–F4 的核心模块在同一个进程里 import 一遍,确认:
 *  - 模块加载不互相阻塞 / 报错 (副作用兼容)
 *  - 各自的关键 API 能 round-trip 跑通最小 happy path
 *
 * 这是收口烟囱测试,不替代各 feature 的专用单测.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- F1: 查找替换插件 ---
import {
  findReplacePlugin,
  findMatches,
  type FindReplaceOptions,
} from '../lib/novablock/findReplacePlugin'

// --- F2: 文件树 + 排序 + 打开历史 ---
import {
  buildTree,
  flattenTree,
  normalizeSelectedRoots,
  generateMidpoint,
  type TreeNode,
} from '../lib/novablock/treeUtils'
import {
  recordOpen,
  getLastOpened,
  clearOpenHistory,
} from '../lib/novablock/openHistory'

// --- F3: AI BubbleMenu actions ---
import { runAIAction, buildPrompt } from '../lib/novablock/aiActions'

// --- F4: Polaroid removal — 仅 import 触发模块加载, 真渲染由专用测试覆盖 ---
import { MediaNodeView } from '../components/MediaNodeView'

describe('Batch 7 · Smoke · all 4 features coexist', () => {
  beforeEach(() => {
    localStorage.clear()
    clearOpenHistory()
  })

  it('F1 · findReplacePlugin / findMatches 可独立加载且形状正确', () => {
    const plugin = findReplacePlugin()
    expect(plugin).toBeTruthy()
    expect(typeof findMatches).toBe('function')
    // findMatches 在没有 editor state 时不应被调用,这里只验证签名存在
    const opts: FindReplaceOptions = { caseSensitive: false, wholeWord: false, regex: false }
    expect(opts.caseSensitive).toBe(false)
  })

  it('F2 · buildTree → flattenTree → normalizeSelectedRoots round-trip', () => {
    const nodes: TreeNode[] = [
      { id: '1', parentId: null, sortKey: 'a', title: 'Folder', isFolder: true },
      { id: '2', parentId: '1', sortKey: 'a', title: 'Child' },
      { id: '3', parentId: null, sortKey: 'b', title: 'Sibling' },
    ]
    const tree = buildTree(nodes)
    expect(tree.length).toBe(2) // root level
    const flat = flattenTree(tree, new Set(['1']))
    expect(flat.map(n => n.id)).toEqual(['1', '2', '3'])
    // 选中 Folder + Child + Sibling → normalize 应丢弃 Child
    const roots = normalizeSelectedRoots(nodes, new Set(['1', '2', '3']))
    expect(new Set(roots)).toEqual(new Set(['1', '3']))
    // Fractional indexing 仍然产出可比的字符串
    const mid = generateMidpoint('a', 'b')
    expect(typeof mid).toBe('string')
    expect(mid > 'a' && mid < 'b').toBe(true)
  })

  it('F2c · openHistory 写入后可读出 timestamp', () => {
    recordOpen('42', 12345)
    expect(getLastOpened('42')).toBe(12345)
  })

  it('F3 · runAIAction 三个 kind 都能用 mock transport 跑通', async () => {
    const transport = vi.fn().mockResolvedValue('result')
    const r1 = await runAIAction({ kind: 'rewrite', text: 'foo' }, { transport })
    const r2 = await runAIAction({ kind: 'translate', text: 'bar' }, { transport })
    const r3 = await runAIAction({ kind: 'convert-to-table', text: 'a,b\n1,2' }, { transport })
    expect(r1).toBe('result')
    expect(r2).toBe('result')
    expect(r3).toBe('result')
    expect(transport).toHaveBeenCalledTimes(3)
    // prompt 里仍然带原文
    expect(buildPrompt('rewrite', 'foo')).toContain('foo')
  })

  it('F4 · MediaNodeView 模块可被加载 (import-time smoke)', () => {
    expect(typeof MediaNodeView).toBe('function')
  })
})
