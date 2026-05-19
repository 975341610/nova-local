/**
 * @vitest-environment jsdom
 *
 * F1-Bugs · 修复 3 处运行时 bug
 *
 * 1a. 面板被编辑器顶部工具条遮挡 — 需要把面板下移(top-* 类应大于 top-2)
 * 1b. 已替换的文本不应再次被命中查找
 * 1c. 上一个/下一个按钮应该把当前命中滚动到视图、并设置 selection
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

import { FindReplacePanel } from '../components/editor/FindReplacePanel'
import {
  FindReplaceExtension,
  findReplacePluginKey,
  setFindQuery,
  gotoNext,
  replaceCurrent,
  replaceAll,
} from '../lib/novablock/findReplacePlugin'

function makeEditor(html: string) {
  return new Editor({
    extensions: [StarterKit, FindReplaceExtension],
    content: html,
  })
}

describe('F1 bug 1a · 面板位置避开顶部工具条', () => {
  let editor: Editor
  beforeEach(() => {
    editor = makeEditor('<p>hello world</p>')
  })
  afterEach(() => {
    cleanup()
    editor.destroy()
  })

  it('面板的 top 偏移类不再是 top-2(被工具条遮挡),应大于等于 top-12', () => {
    render(<FindReplacePanel open onClose={() => {}} editor={editor} />)
    const panel = screen.getByTestId('qingzhi-find-replace-panel')
    const cls = panel.className
    // 不应再是 top-2
    expect(cls).not.toMatch(/(^|\s)top-2(\s|$)/)
    // 必须存在某个 top-N(N>=12)的类
    const m = cls.match(/(^|\s)top-(\d+)(\s|$)/)
    expect(m).not.toBeNull()
    const n = m ? parseInt(m[2], 10) : 0
    expect(n).toBeGreaterThanOrEqual(12)
  })
})

describe('F1 bug 1b · 已替换的文本不再被命中', () => {
  it('replaceCurrent 后,如果替换串本身包含 query,不应在新文本中再次命中', () => {
    const ed = makeEditor('<p>foo bar foo</p>')
    setFindQuery(ed.view, 'foo', { caseSensitive: false, wholeWord: false, regex: false })
    // 把 foo 替换为 foofoo (新文本里又包含 foo)
    replaceCurrent(ed.view, 'foofoo')
    // 文档现在应是 "foofoo bar foo" — 一共 3 个 foo,但其中 2 个来自刚刚替换出来的内容,
    // 我们要求不再命中替换出来的部分,只剩下原来未替换的那个 foo
    const state = findReplacePluginKey.getState(ed.view.state)!
    expect(state.matches.length).toBe(1)
    ed.destroy()
  })

  it('replaceAll 后,即使替换串包含 query,文档中不再有任何 match', () => {
    const ed = makeEditor('<p>foo foo foo</p>')
    setFindQuery(ed.view, 'foo', { caseSensitive: false, wholeWord: false, regex: false })
    const count = replaceAll(ed.view, 'foofoo')
    expect(count).toBe(3)
    const state = findReplacePluginKey.getState(ed.view.state)!
    expect(state.matches.length).toBe(0)
    ed.destroy()
  })
})

describe('F1 bug 1c · 上一个/下一个按钮设置 selection 并请求滚动', () => {
  let editor: Editor
  beforeEach(() => {
    editor = makeEditor('<p>hello hello hello</p>')
  })
  afterEach(() => {
    editor.destroy()
  })

  it('gotoNext 后,文档 selection 落在 current match 范围上', () => {
    setFindQuery(editor.view, 'hello', { caseSensitive: false, wholeWord: false, regex: false })
    // current = 0 → match[0]
    gotoNext(editor.view)
    // 现在 current = 1 → match[1]
    const s = findReplacePluginKey.getState(editor.view.state)!
    const m = s.matches[s.current]
    const sel = editor.view.state.selection
    expect(sel.from).toBe(m.from)
    expect(sel.to).toBe(m.to)
  })
})
