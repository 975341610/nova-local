/**
 * v0.19.4 · Timeline Item NodeView
 *
 * 让时间线条目的「日期」成为可编辑 input，同时文本仍由 Tiptap
 * 托管的 `NodeViewContent` 渲染（通过 contentDOM 机制）。
 */
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import { useCallback, useState } from 'react'

export function TimelineItemView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props
  const date: string = (node.attrs.date as string) || ''
  const [editing, setEditing] = useState(false)
  const isEditable = editor?.isEditable !== false

  const commit = useCallback(
    (val: string) => {
      const trimmed = val.trim()
      updateAttributes({ date: trimmed })
      setEditing(false)
    },
    [updateAttributes],
  )

  return (
    <NodeViewWrapper
      as="div"
      data-timeline-item="true"
      className="timeline-item"
    >
      {editing && isEditable ? (
        <input
          type="date"
          defaultValue={parseDateInput(date)}
          autoFocus
          onBlur={(e) => commit(formatDateOutput(e.target.value, date))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(formatDateOutput((e.target as HTMLInputElement).value, date))
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setEditing(false)
            }
          }}
          className="timeline-date-input"
          contentEditable={false}
        />
      ) : (
        <span
          className="timeline-date"
          role={isEditable ? 'button' : undefined}
          tabIndex={isEditable ? 0 : -1}
          contentEditable={false}
          title={isEditable ? '点击编辑日期' : undefined}
          onMouseDown={(e) => {
            if (!isEditable) return
            e.preventDefault()
            e.stopPropagation()
            setEditing(true)
          }}
          onKeyDown={(e) => {
            if (!isEditable) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setEditing(true)
            }
          }}
        >
          {date || '—'}
        </span>
      )}
      <NodeViewContent<'span'> as="span" className="timeline-text" />
    </NodeViewWrapper>
  )
}

/**
 * 将存储的 date 字符串解析成 <input type="date"> 能识别的 YYYY-MM-DD，
 * 若无法解析则返回空字符串（input 会显示为占位）。
 */
function parseDateInput(stored: string): string {
  if (!stored) return ''
  // 已经是 YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored
  // 尝试用 Date 兜底（支持 2026/01/01、Jan 1 2026 等）
  const d = new Date(stored)
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return ''
}

/** 将 input 回写的值规范化（空串 → 保留原值）。 */
function formatDateOutput(raw: string, fallback: string): string {
  const v = (raw || '').trim()
  if (!v) return fallback
  return v
}

export default TimelineItemView
