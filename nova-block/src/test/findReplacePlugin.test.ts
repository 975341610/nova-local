/**
 * @vitest-environment jsdom
 *
 * F1-T1 · 查找替换 ProseMirror 插件
 *
 * 这个测试套件描述 findReplacePlugin 的契约:
 *  - matches: 命中区间(from/to)按文档顺序排列
 *  - current: 当前选中的命中索引(-1 表示空)
 *  - 三个开关: caseSensitive / wholeWord / regex
 *  - gotoNext / gotoPrev: 循环遍历
 *  - replaceCurrent: 替换当前一处,自动指向下一处
 *  - replaceAll: 一次性替换全部并返回数量
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { Node } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {
  FindReplaceExtension,
  findReplacePluginKey,
  setFindQuery,
  gotoNext,
  gotoPrev,
  replaceCurrent,
  replaceAll,
} from '../lib/novablock/findReplacePlugin'

function makeEditor(text: string) {
  const editor = new Editor({
    extensions: [StarterKit, FindReplaceExtension],
    content: text,
  })
  return editor
}

function getState(editor: Editor) {
  const state = findReplacePluginKey.getState(editor.view.state)
  if (!state) throw new Error('findReplace plugin state missing')
  return state
}

describe('findReplacePlugin', () => {
  let editor: Editor

  beforeEach(() => {
    editor = makeEditor('<p>Hello hello HELLO world</p>')
  })

  it('starts with empty matches when no query is set', () => {
    const state = getState(editor)
    expect(state.matches).toEqual([])
    expect(state.current).toBe(-1)
    expect(state.query).toBe('')
  })

  it('locates 3 case-insensitive matches for "hello"', () => {
    setFindQuery(editor.view, 'hello', { caseSensitive: false, wholeWord: false, regex: false })
    const state = getState(editor)
    expect(state.matches.length).toBe(3)
    expect(state.current).toBe(0)
  })

  it('respects caseSensitive=true (only 1 match for "hello")', () => {
    setFindQuery(editor.view, 'hello', { caseSensitive: true, wholeWord: false, regex: false })
    const state = getState(editor)
    expect(state.matches.length).toBe(1)
  })

  it('respects wholeWord=true (no match for "lo" inside "hello")', () => {
    setFindQuery(editor.view, 'lo', { caseSensitive: false, wholeWord: true, regex: false })
    const state = getState(editor)
    expect(state.matches.length).toBe(0)
  })

  it('supports regex=true (matches \\d+ in numeric content)', () => {
    const ed = makeEditor('<p>abc123def456ghi</p>')
    setFindQuery(ed.view, '\\d+', { caseSensitive: true, wholeWord: false, regex: true })
    const s = findReplacePluginKey.getState(ed.view.state)!
    expect(s.matches.length).toBe(2)
  })

  it('gotoNext / gotoPrev cycle through matches', () => {
    setFindQuery(editor.view, 'hello', { caseSensitive: false, wholeWord: false, regex: false })
    expect(getState(editor).current).toBe(0)
    gotoNext(editor.view)
    expect(getState(editor).current).toBe(1)
    gotoNext(editor.view)
    expect(getState(editor).current).toBe(2)
    gotoNext(editor.view)
    expect(getState(editor).current).toBe(0) // wraps
    gotoPrev(editor.view)
    expect(getState(editor).current).toBe(2)
  })

  it('replaceCurrent replaces only the current occurrence and advances', () => {
    setFindQuery(editor.view, 'hello', { caseSensitive: false, wholeWord: false, regex: false })
    replaceCurrent(editor.view, 'XXX')
    const text = editor.getText()
    // Only the first "Hello" should be replaced with XXX
    expect(text.startsWith('XXX')).toBe(true)
    // Two matches remain (case-insensitive "hello" and "HELLO")
    const state = getState(editor)
    expect(state.matches.length).toBe(2)
  })

  it('replaceAll replaces every occurrence and returns count', () => {
    setFindQuery(editor.view, 'hello', { caseSensitive: false, wholeWord: false, regex: false })
    const count = replaceAll(editor.view, 'WORLD')
    expect(count).toBe(3)
    const text = editor.getText()
    expect(text.toLowerCase().includes('hello')).toBe(false)
    expect((text.match(/WORLD/g) || []).length).toBeGreaterThanOrEqual(3)
  })
})

// ─── 批 1.5 · 新增 7 个测试 (审查 v3-#5 + v4-#1/#2 + v5-#1) ─────────────
describe('findReplacePlugin · v2 text-node-level + atomic + zero-width', () => {
  it('cross-paragraph search: <p>foo</p><p>foo</p> 两段都命中', () => {
    const ed = makeEditor('<p>foo</p><p>foo</p>')
    setFindQuery(ed.view, 'foo', { caseSensitive: false, wholeWord: false, regex: false })
    const state = findReplacePluginKey.getState(ed.view.state)!
    expect(state.matches.length).toBe(2)
  })

  it('heading + body same word: <h1>foo</h1><p>foo</p> 两处都命中,顺序正确', () => {
    const ed = makeEditor('<h1>foo</h1><p>foo</p>')
    setFindQuery(ed.view, 'foo', { caseSensitive: false, wholeWord: false, regex: false })
    const state = findReplacePluginKey.getState(ed.view.state)!
    expect(state.matches.length).toBe(2)
    // 文档顺序: heading 的 from 必然小于 body 的 from
    expect(state.matches[0].from).toBeLessThan(state.matches[1].from)
  })

  it("invalid regex 输入 '[' 不抛错,matches=[]", () => {
    const ed = makeEditor('<p>hello world</p>')
    setFindQuery(ed.view, '[', { caseSensitive: false, wholeWord: false, regex: true })
    const state = findReplacePluginKey.getState(ed.view.state)!
    expect(state.matches).toEqual([])
  })

  it("zero-width regex (?=f) 不死循环,matches 数量等于 'f' 出现次数", () => {
    const ed = makeEditor('<p>foo bar fizz</p>')
    setFindQuery(ed.view, '(?=f)', { caseSensitive: true, wholeWord: false, regex: true })
    const state = findReplacePluginKey.getState(ed.view.state)!
    // 'foo bar fizz' 中 'f' 出现 2 次
    expect(state.matches.length).toBe(2)
    // 每个 match 都是零宽 (from === to)
    state.matches.forEach((m) => expect(m.from).toBe(m.to))
  })

  it('atomic inline node prevents cross-match: foo[atom]bar 搜 foobar 不命中', () => {
    // 自定义一个 atom inline node 来模拟 mention/math/emoji
    // 直接通过 ProseMirror schema 构建文档
    const ed = new Editor({
      extensions: [
        StarterKit,
        FindReplaceExtension,
        Node.create({
          name: 'atomBadge',
          group: 'inline',
          inline: true,
          atom: true,
          parseHTML: () => [{ tag: 'span[data-atom-badge]' }],
          renderHTML: () => ['span', { 'data-atom-badge': '' }, 'X'],
        }),
      ],
      content: '<p>foo<span data-atom-badge></span>bar</p>',
    })
    // 搜 foobar 不应跨过 atom 命中
    setFindQuery(ed.view, 'foobar', { caseSensitive: false, wholeWord: false, regex: false })
    expect(findReplacePluginKey.getState(ed.view.state)!.matches.length).toBe(0)
    // 搜 foo 应命中 1 次
    setFindQuery(ed.view, 'foo', { caseSensitive: false, wholeWord: false, regex: false })
    expect(findReplacePluginKey.getState(ed.view.state)!.matches.length).toBe(1)
  })

  it('replaceCurrent on zero-width match 不修改文档', () => {
    const ed = makeEditor('<p>foo bar</p>')
    const before = ed.getText()
    setFindQuery(ed.view, '(?=f)', { caseSensitive: true, wholeWord: false, regex: true })
    replaceCurrent(ed.view, 'Z')
    expect(ed.getText()).toBe(before)
  })

  it('replaceAll on zero-width match 返回 0 且不修改文档', () => {
    const ed = makeEditor('<p>foo bar</p>')
    const before = ed.getText()
    setFindQuery(ed.view, '(?=f)', { caseSensitive: true, wholeWord: false, regex: true })
    const count = replaceAll(ed.view, 'Z')
    expect(count).toBe(0)
    expect(ed.getText()).toBe(before)
  })
})
