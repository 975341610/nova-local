/**
 * F3 · AI 浮动预览框 — 选中文字后由 BubbleMenu 上的 AI 按钮触发。
 *
 * 设计要点:
 *  - 受控展开/关闭 by `open` + `anchor`(屏幕坐标)
 *  - 有边界防遮挡:若距 viewport 右/下边界过近则向左/上翻
 *  - 三种 kind 快捷操作 + 自由文本输入 (custom prompt)
 *  - 流式预览:父组件通过 `streaming` / `previewText` 实时更新
 *  - 用户点 "确认" → onConfirm(previewText);点 "取消" / Esc → onCancel()
 *  - 与具体 transport 解耦:onRun(kind, customPrompt?) 由父级实现
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Wand2, Languages, Table, X, Check, Loader2 } from 'lucide-react'
import type { AIActionKind } from '../../lib/novablock/aiActions'

export type AIInlinePopoverProps = {
  open: boolean
  /** 选区右下角(或任意锚点)的屏幕坐标; 组件内部决定四象限翻转 */
  anchor: { x: number; y: number } | null
  /** 选区原文(只读, 显示在顶部 1 行省略) */
  originalText: string
  /** 流式累积的预览文本; 父级随 SSE 逐 chunk 更新 */
  previewText: string
  /** 模型调用进行中 — 锁定按钮 + 不允许 confirm */
  loading: boolean
  error?: string | null
  onRun: (kind: AIActionKind | 'custom', customPrompt?: string) => void
  onConfirm: () => void
  onCancel: () => void
}

const POPOVER_W = 360
const POPOVER_MIN_H = 120
const EDGE_MARGIN = 8

export function AIInlinePopover(props: AIInlinePopoverProps) {
  const { open, anchor, originalText, previewText, loading, error } = props
  const ref = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })

  // 计算位置 — 边界防遮挡
  useLayoutEffect(() => {
    if (!open || !anchor) return
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768
    const h = ref.current?.offsetHeight ?? POPOVER_MIN_H
    let left = anchor.x
    let top = anchor.y + 8
    if (left + POPOVER_W + EDGE_MARGIN > vw) left = vw - POPOVER_W - EDGE_MARGIN
    if (left < EDGE_MARGIN) left = EDGE_MARGIN
    if (top + h + EDGE_MARGIN > vh) top = anchor.y - h - 8
    if (top < EDGE_MARGIN) top = EDGE_MARGIN
    setPos({ left, top })
  }, [open, anchor, previewText, error])

  // 打开时聚焦输入
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        props.onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, props])

  if (!open || !anchor) return null

  const canConfirm = !loading && previewText.trim().length > 0

  const runCustom = () => {
    const p = customPrompt.trim()
    if (!p) return
    props.onRun('custom', p)
  }

  return (
    <div
      ref={ref}
      data-testid="qingzhi-ai-inline-popover"
      role="dialog"
      aria-label="AI inline popover"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: POPOVER_W,
        zIndex: 60,
      }}
      className="rounded-xl border border-border/40 bg-background/95 p-3 shadow-xl backdrop-blur-md"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          AI 助手
        </span>
        <button
          data-testid="qingzhi-ai-inline-close"
          aria-label="close-ai-inline"
          onClick={props.onCancel}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>

      <div
        data-testid="qingzhi-ai-inline-original"
        className="mb-2 line-clamp-1 rounded-md border border-border/30 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground"
        title={originalText}
      >
        {originalText || '(无选中文字)'}
      </div>

      <div className="mb-2 flex items-center gap-1">
        <button
          data-testid="qingzhi-ai-action-rewrite"
          disabled={loading}
          onClick={() => props.onRun('rewrite')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          title="重写"
        >
          <Wand2 size={12} /> 重写
        </button>
        <button
          data-testid="qingzhi-ai-action-translate"
          disabled={loading}
          onClick={() => props.onRun('translate')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          title="翻译"
        >
          <Languages size={12} /> 翻译
        </button>
        <button
          data-testid="qingzhi-ai-action-convert-to-table"
          disabled={loading}
          onClick={() => props.onRun('convert-to-table')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          title="转表格"
        >
          <Table size={12} /> 转表格
        </button>
      </div>

      <div className="mb-2 flex items-start gap-1.5">
        <textarea
          ref={inputRef}
          data-testid="qingzhi-ai-inline-prompt"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              runCustom()
            }
          }}
          placeholder="输入指令(Ctrl/Cmd+Enter 运行)..."
          rows={2}
          disabled={loading}
          className="flex-1 resize-none rounded-md border border-border/40 bg-background/60 px-2 py-1 text-sm focus:border-primary/60 focus:outline-none disabled:opacity-40"
        />
        <button
          data-testid="qingzhi-ai-inline-run-custom"
          disabled={loading || customPrompt.trim().length === 0}
          onClick={runCustom}
          className="rounded-md border border-border/40 bg-accent/30 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground disabled:opacity-40"
        >
          运行
        </button>
      </div>

      {(loading || previewText || error) && (
        <div
          data-testid="qingzhi-ai-inline-preview"
          className="mb-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/30 bg-muted/30 px-2 py-1.5 text-[12px] text-foreground"
        >
          {error ? (
            <span data-testid="qingzhi-ai-inline-error" className="text-destructive">
              {error}
            </span>
          ) : (
            <>
              {previewText || (loading ? '生成中...' : '')}
              {loading && (
                <Loader2
                  size={12}
                  className="ml-1 inline-block animate-spin text-muted-foreground"
                />
              )}
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5">
        <button
          data-testid="qingzhi-ai-inline-cancel"
          onClick={props.onCancel}
          className="rounded-md border border-border/40 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border/60 hover:text-foreground"
        >
          取消
        </button>
        <button
          data-testid="qingzhi-ai-inline-confirm"
          disabled={!canConfirm}
          onClick={props.onConfirm}
          className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 py-1 text-[11px] text-primary transition-colors hover:bg-primary/25 disabled:opacity-40"
        >
          <Check size={12} /> 确认替换
        </button>
      </div>
    </div>
  )
}

export default AIInlinePopover
