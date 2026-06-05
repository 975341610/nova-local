import React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { BlockLinkTarget } from '../../../lib/novablock/blockLinks'

export type BlockLinkPickerAnchor = {
  x: number
  y: number
}

type BlockLinkPickerProps = {
  open: boolean
  anchor: BlockLinkPickerAnchor | null
  pickerRef: React.RefObject<HTMLDivElement | null>
  query: string
  targets: BlockLinkTarget[]
  setQuery: (value: string) => void
  onClose: () => void
  onSelect: (target: BlockLinkTarget) => void
}

export function BlockLinkPicker({
  open,
  anchor,
  pickerRef,
  query,
  targets,
  setQuery,
  onClose,
  onSelect,
}: BlockLinkPickerProps) {
  if (!open || !anchor || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={pickerRef}
      data-testid="qingzhi-block-link-picker"
      className="qz-block-link-picker"
      style={{
        left: anchor.x,
        top: anchor.y,
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="qz-block-link-picker-head">
        <span>链接到块</span>
        <button type="button" onClick={onClose} aria-label="关闭块链接选择器">
          <X size={13} />
        </button>
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
        placeholder="搜索笔记或块内容..."
        className="qz-block-link-picker-input"
      />
      <div className="qz-block-link-picker-list">
        {targets.length === 0 ? (
          <div className="qz-block-link-picker-empty">暂无可链接块。打开并保存旧笔记后会自动生成块锚点。</div>
        ) : (
          targets.map((target) => (
            <button
              type="button"
              key={`${target.noteId}:${target.blockId}`}
              className="qz-block-link-picker-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(target)}
            >
              <span className="qz-block-link-picker-title">{target.label}</span>
              <span className="qz-block-link-picker-meta">{target.noteTitle} · {target.type}</span>
              {target.preview && target.preview !== target.label && (
                <span className="qz-block-link-picker-preview">{target.preview}</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  )
}
