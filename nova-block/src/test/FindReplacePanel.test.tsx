/**
 * @vitest-environment jsdom
 *
 * F1-T2 · FindReplacePanel
 *
 * 契约:
 *  - 受控 props: open / onClose / editor (Editor | null)
 *  - 三开关: caseSensitive / wholeWord / regex (默认全 false)
 *  - 输入查找框 → 调用 setFindQuery → plugin state.matches 更新
 *  - 显示 "n / total" 计数
 *  - 上一个/下一个按钮 → gotoPrev / gotoNext
 *  - 替换/全部替换按钮 → replaceCurrent / replaceAll
 *  - 关闭按钮 (×) → 调用 onClose
 *  - editor=null 时面板渲染但所有按钮被禁用 (不抛错)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

import { FindReplacePanel } from '../components/editor/FindReplacePanel'
import {
  FindReplaceExtension,
  findReplacePluginKey,
} from '../lib/novablock/findReplacePlugin'

function makeEditor(html: string) {
  return new Editor({
    extensions: [StarterKit, FindReplaceExtension],
    content: html,
  })
}

describe('FindReplacePanel', () => {
  let editor: Editor

  beforeEach(() => {
    editor = makeEditor('<p>Hello hello HELLO world</p>')
  })

  afterEach(() => {
    cleanup()
    editor.destroy()
  })

  it('renders nothing when open=false', () => {
    const { container } = render(
      <FindReplacePanel open={false} onClose={() => {}} editor={editor} />,
    )
    expect(container.querySelector('[data-testid="qingzhi-find-replace-panel"]')).toBeNull()
  })

  it('renders find/replace inputs and three option toggles when open=true', () => {
    render(<FindReplacePanel open onClose={() => {}} editor={editor} />)
    expect(screen.getByTestId('qingzhi-find-replace-panel')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-find-replace-find-input')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-find-replace-replace-input')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-find-replace-toggle-case')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-find-replace-toggle-word')).toBeTruthy()
    expect(screen.getByTestId('qingzhi-find-replace-toggle-regex')).toBeTruthy()
  })

  it('typing in find input updates plugin matches and shows "1 / 3" counter', () => {
    render(<FindReplacePanel open onClose={() => {}} editor={editor} />)
    const find = screen.getByTestId('qingzhi-find-replace-find-input') as HTMLInputElement
    fireEvent.change(find, { target: { value: 'hello' } })
    const state = findReplacePluginKey.getState(editor.view.state)
    expect(state?.matches.length).toBe(3)
    expect(state?.current).toBe(0)
    const counter = screen.getByTestId('qingzhi-find-replace-counter')
    expect(counter.textContent).toContain('1')
    expect(counter.textContent).toContain('3')
  })

  it('next button advances current match', () => {
    render(<FindReplacePanel open onClose={() => {}} editor={editor} />)
    fireEvent.change(screen.getByTestId('qingzhi-find-replace-find-input'), {
      target: { value: 'hello' },
    })
    fireEvent.click(screen.getByTestId('qingzhi-find-replace-next'))
    expect(findReplacePluginKey.getState(editor.view.state)?.current).toBe(1)
  })

  it('prev button moves to previous match (wraps)', () => {
    render(<FindReplacePanel open onClose={() => {}} editor={editor} />)
    fireEvent.change(screen.getByTestId('qingzhi-find-replace-find-input'), {
      target: { value: 'hello' },
    })
    fireEvent.click(screen.getByTestId('qingzhi-find-replace-prev'))
    // current was 0, prev wraps to last (2)
    expect(findReplacePluginKey.getState(editor.view.state)?.current).toBe(2)
  })

  it('replace button replaces current occurrence', () => {
    render(<FindReplacePanel open onClose={() => {}} editor={editor} />)
    fireEvent.change(screen.getByTestId('qingzhi-find-replace-find-input'), {
      target: { value: 'hello' },
    })
    fireEvent.change(screen.getByTestId('qingzhi-find-replace-replace-input'), {
      target: { value: 'XXX' },
    })
    fireEvent.click(screen.getByTestId('qingzhi-find-replace-replace'))
    expect(editor.getText().startsWith('XXX')).toBe(true)
  })

  it('replace-all button replaces every occurrence', () => {
    render(<FindReplacePanel open onClose={() => {}} editor={editor} />)
    fireEvent.change(screen.getByTestId('qingzhi-find-replace-find-input'), {
      target: { value: 'hello' },
    })
    fireEvent.change(screen.getByTestId('qingzhi-find-replace-replace-input'), {
      target: { value: 'WORLD' },
    })
    fireEvent.click(screen.getByTestId('qingzhi-find-replace-replace-all'))
    expect(editor.getText().toLowerCase().includes('hello')).toBe(false)
  })

  it('case-sensitive toggle reduces matches for "hello" to 1', () => {
    render(<FindReplacePanel open onClose={() => {}} editor={editor} />)
    fireEvent.change(screen.getByTestId('qingzhi-find-replace-find-input'), {
      target: { value: 'hello' },
    })
    fireEvent.click(screen.getByTestId('qingzhi-find-replace-toggle-case'))
    expect(findReplacePluginKey.getState(editor.view.state)?.matches.length).toBe(1)
  })

  it('close button calls onClose', () => {
    const onClose = vi.fn()
    render(<FindReplacePanel open onClose={onClose} editor={editor} />)
    fireEvent.click(screen.getByTestId('qingzhi-find-replace-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not crash when editor is null', () => {
    expect(() =>
      render(<FindReplacePanel open onClose={() => {}} editor={null} />),
    ).not.toThrow()
  })
})
