/**
 * F1-T2 · 查找替换面板
 *
 * 受控组件,顶部 absolute top-2 right-2,挂在编辑器容器内。
 * 与 findReplacePlugin 通信:setFindQuery / gotoNext / gotoPrev /
 * replaceCurrent / replaceAll。
 *
 * Props:
 *  - open: 是否显示面板
 *  - onClose: 关闭回调 (按 × 或 Esc 时由父级触发,这里不监听 Esc 全局)
 *  - editor: Tiptap Editor (允许 null,此时按钮全部禁用)
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Replace, ReplaceAll, X } from 'lucide-react'
import type { Editor } from '@tiptap/core'

import {
  findReplacePluginKey,
  gotoNext,
  gotoPrev,
  replaceAll as pluginReplaceAll,
  replaceCurrent as pluginReplaceCurrent,
  setFindQuery,
} from '../../lib/novablock/findReplacePlugin'

type FindReplacePanelProps = {
  open: boolean
  onClose: () => void
  editor: Editor | null
}

export function FindReplacePanel({ open, onClose, editor }: FindReplacePanelProps) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regex, setRegex] = useState(false)
  // 用于强制订阅 plugin state 变化,以便实时更新 "n / total" 计数
  const [, setTick] = useState(0)

  const options = useMemo(
    () => ({ caseSensitive, wholeWord, regex }),
    [caseSensitive, wholeWord, regex],
  )

  // 同步 query / options 到 plugin
  useEffect(() => {
    if (!editor || !open) return
    setFindQuery(editor.view, query, options)
  }, [editor, open, query, options])

  // 监听编辑器事务,刷新计数
  useEffect(() => {
    if (!editor) return
    const handler = () => setTick((t) => t + 1)
    editor.on('transaction', handler)
    return () => {
      editor.off('transaction', handler)
    }
  }, [editor])

  // 关闭时清空 plugin 状态
  useEffect(() => {
    if (!open && editor) {
      setFindQuery(editor.view, '', options)
    }
    // 仅在 open 切换时执行,options 变化由上面的 effect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editor])

  const pluginState = editor ? findReplacePluginKey.getState(editor.view.state) : null
  const total = pluginState?.matches.length ?? 0
  const current = pluginState?.current ?? -1
  const counterText = total === 0 ? '0 / 0' : `${current + 1} / ${total}`

  const disabled = !editor

  const handleNext = useCallback(() => {
    if (!editor) return
    // Bug-fix: 先聚焦编辑器,使后续 scrollIntoView 在可见区域内生效
    editor.commands.focus(undefined, { scrollIntoView: false })
    gotoNext(editor.view)
  }, [editor])

  const handlePrev = useCallback(() => {
    if (!editor) return
    editor.commands.focus(undefined, { scrollIntoView: false })
    gotoPrev(editor.view)
  }, [editor])

  const handleReplace = useCallback(() => {
    if (!editor) return
    pluginReplaceCurrent(editor.view, replacement)
  }, [editor, replacement])

  const handleReplaceAll = useCallback(() => {
    if (!editor) return
    pluginReplaceAll(editor.view, replacement)
  }, [editor, replacement])

  if (!open) return null

  return (
    <div
      data-testid="qingzhi-find-replace-panel"
      className="absolute top-14 right-2 z-40 w-[320px] rounded-xl border border-border/40 bg-background/95 p-3 shadow-xl backdrop-blur-md"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          查找替换
        </span>
        <button
          data-testid="qingzhi-find-replace-close"
          onClick={onClose}
          aria-label="close-find-replace"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mb-2 flex items-center gap-1.5">
        <input
          data-testid="qingzhi-find-replace-find-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="查找..."
          className="flex-1 rounded-md border border-border/40 bg-background/60 px-2 py-1 text-sm focus:border-primary/60 focus:outline-none"
        />
        <span
          data-testid="qingzhi-find-replace-counter"
          className="min-w-[44px] text-center text-[11px] font-mono text-muted-foreground"
        >
          {counterText}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-1.5">
        <input
          data-testid="qingzhi-find-replace-replace-input"
          type="text"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="替换为..."
          className="flex-1 rounded-md border border-border/40 bg-background/60 px-2 py-1 text-sm focus:border-primary/60 focus:outline-none"
        />
      </div>

      <div className="mb-2 flex items-center gap-1">
        <button
          data-testid="qingzhi-find-replace-toggle-case"
          onClick={() => setCaseSensitive((v) => !v)}
          aria-pressed={caseSensitive}
          title="区分大小写"
          className={`rounded-md px-1.5 py-0.5 text-[11px] font-mono transition-colors ${
            caseSensitive
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          Aa
        </button>
        <button
          data-testid="qingzhi-find-replace-toggle-word"
          onClick={() => setWholeWord((v) => !v)}
          aria-pressed={wholeWord}
          title="全字匹配"
          className={`rounded-md px-1.5 py-0.5 text-[11px] font-mono transition-colors ${
            wholeWord
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          \b
        </button>
        <button
          data-testid="qingzhi-find-replace-toggle-regex"
          onClick={() => setRegex((v) => !v)}
          aria-pressed={regex}
          title="正则表达式"
          className={`rounded-md px-1.5 py-0.5 text-[11px] font-mono transition-colors ${
            regex
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          .*
        </button>

        <div className="flex-1" />

        <button
          data-testid="qingzhi-find-replace-prev"
          onClick={handlePrev}
          disabled={disabled}
          aria-label="find-prev"
          title="上一个"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <ChevronUp size={14} />
        </button>
        <button
          data-testid="qingzhi-find-replace-next"
          onClick={handleNext}
          disabled={disabled}
          aria-label="find-next"
          title="下一个"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          data-testid="qingzhi-find-replace-replace"
          onClick={handleReplace}
          disabled={disabled}
          className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border/40 bg-accent/30 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground disabled:opacity-40"
        >
          <Replace size={12} />
          替换
        </button>
        <button
          data-testid="qingzhi-find-replace-replace-all"
          onClick={handleReplaceAll}
          disabled={disabled}
          className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border/40 bg-accent/30 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground disabled:opacity-40"
        >
          <ReplaceAll size={12} />
          全部替换
        </button>
      </div>
    </div>
  )
}
