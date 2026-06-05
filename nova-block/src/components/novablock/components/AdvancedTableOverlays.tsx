import React from 'react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { createPortal } from 'react-dom'
import {
  Bold,
  Columns,
  CopyPlus,
  Eraser,
  Italic,
  Layout,
  Palette,
  Rows,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  X,
} from 'lucide-react'
import type { AdvancedTableEdgeIntent } from '../../../lib/advancedTableEdges'

type AdvancedTableSelectionScope = 'cell' | 'row' | 'column' | null
type AdvancedTablePopover = 'text' | 'color' | null

export type AdvancedTableCellColor = {
  label: string
  value: string
}

export type AdvancedTableHoveredInsertTarget = {
  kind: 'column' | 'row'
  key: string
} | null

export type AdvancedTableSizePickerState = {
  open: boolean
  rows: number
  cols: number
}

type AdvancedTableToolbarProps = {
  editor: Editor
  shouldShow: (args: { editor: Editor }) => boolean
  selectionScope: AdvancedTableSelectionScope
  popover: AdvancedTablePopover
  setPopover: React.Dispatch<React.SetStateAction<AdvancedTablePopover>>
  cellColors: AdvancedTableCellColor[]
  closeToolbar: (force?: boolean) => void
  clearSelectedCells: () => void
  applyCellBackground: (value: string) => void
}

export function AdvancedTableToolbar({
  editor,
  shouldShow,
  selectionScope,
  popover,
  setPopover,
  cellColors,
  closeToolbar,
  clearSelectedCells,
  applyCellBackground,
}: AdvancedTableToolbarProps) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={shouldShow}
      className="qz-advanced-table-toolbar flex rounded-2xl border border-border/20 bg-popover/90 backdrop-blur-2xl shadow-soft p-1.5"
    >
      <div className="qz-advanced-table-group">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (editor.chain().focus() as any).toggleHeaderRow().run()}
          className="qz-advanced-table-button"
          title="切换表头行"
        >
          <Rows size={15} />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (editor.chain().focus() as any).toggleHeaderColumn().run()}
          className="qz-advanced-table-button"
          title="切换表头列"
        >
          <Columns size={15} />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (editor.chain().focus() as any).mergeCells().run()}
          className="qz-advanced-table-button"
          title="合并单元格"
        >
          <CopyPlus size={15} />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (editor.chain().focus() as any).splitCell().run()}
          className="qz-advanced-table-button"
          title="拆分单元格"
        >
          <Layout size={15} />
        </button>
        {selectionScope === 'row' && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor.chain().focus().deleteRow().run()
              closeToolbar(true)
            }}
            className="qz-advanced-table-button qz-advanced-table-delete-row qz-advanced-table-danger"
            title="删除整行"
          >
            <Trash2 size={15} />
          </button>
        )}
        {selectionScope === 'column' && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor.chain().focus().deleteColumn().run()
              closeToolbar(true)
            }}
            className="qz-advanced-table-button qz-advanced-table-delete-column qz-advanced-table-danger"
            title="删除整列"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <div className="qz-advanced-table-divider" />

      <div className="qz-advanced-table-group">
        {(['left', 'center', 'right'] as const).map((align) => (
          <button
            key={align}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => (editor.chain().focus() as any).setCellAttribute('textAlign', align).run()}
            className="qz-advanced-table-button qz-advanced-table-align"
            title={align === 'left' ? '左对齐' : align === 'center' ? '居中对齐' : '右对齐'}
          >
            {align === 'left' ? '左' : align === 'center' ? '中' : '右'}
          </button>
        ))}
      </div>

      <div className="qz-advanced-table-divider" />

      <div className="qz-advanced-table-group">
        <div
          className={`qz-advanced-table-text-popover ${popover === 'text' ? 'is-open' : ''}`}
          onMouseEnter={() => setPopover('text')}
        >
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setPopover((value) => value === 'text' ? null : 'text')}
            className="qz-advanced-table-button"
            title="文字操作"
          >
            <Type size={15} />
          </button>
          <div className="qz-advanced-table-text-menu">
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} title="加粗"><Bold size={14} /></button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体"><Italic size={14} /></button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleUnderline().run()} title="下划线"><Underline size={14} /></button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleStrike().run()} title="删除线"><Strikethrough size={14} /></button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().unsetAllMarks().run()} title="清除格式"><Eraser size={14} /></button>
          </div>
        </div>
        <div
          className={`qz-advanced-table-color-popover ${popover === 'color' ? 'is-open' : ''}`}
          onMouseEnter={() => setPopover('color')}
        >
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setPopover((value) => value === 'color' ? null : 'color')}
            className="qz-advanced-table-button"
            title="单元格底色"
          >
            <Palette size={15} />
          </button>
          <div className="qz-advanced-table-color-menu">
            {cellColors.map((color) => (
              <button
                key={color.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyCellBackground(color.value)}
                className="qz-advanced-table-swatch"
                data-transparent={color.value === 'transparent' ? 'true' : undefined}
                style={{ '--qz-table-swatch': color.value } as React.CSSProperties}
                title={`单元格底色：${color.label}`}
              >
                {color.value === 'transparent' && <Palette size={11} />}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={clearSelectedCells}
          className="qz-advanced-table-button qz-advanced-table-clear-cell"
          title="清空选中单元格"
        >
          <Eraser size={15} />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().deleteTable().run()}
          className="qz-advanced-table-button qz-advanced-table-danger"
          title="删除表格"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </BubbleMenu>
  )
}

type AdvancedTableEdgeControlsProps = {
  edgeIntent: NonNullable<AdvancedTableEdgeIntent>
  hoveredInsertTarget: AdvancedTableHoveredInsertTarget
  setHoveredInsertTarget: React.Dispatch<React.SetStateAction<AdvancedTableHoveredInsertTarget>>
  keepEdgeIntent: (intent: NonNullable<AdvancedTableEdgeIntent>) => void
  chromeBottom: number
  selectEdge: (kind: 'column' | 'row', clientX: number, clientY: number) => void
  insertEdgeAtPoint: (kind: 'column' | 'row', x: number, y: number) => void
}

export function AdvancedTableEdgeControls({
  edgeIntent,
  hoveredInsertTarget,
  setHoveredInsertTarget,
  keepEdgeIntent,
  chromeBottom,
  selectEdge,
  insertEdgeAtPoint,
}: AdvancedTableEdgeControlsProps) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="qz-table-edge-controls"
      style={{ clipPath: `inset(${chromeBottom}px 0 0 0)` }}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => keepEdgeIntent(edgeIntent)}
    >
      {hoveredInsertTarget && (() => {
        const edge = edgeIntent[hoveredInsertTarget.kind]
        const dot = edge.dots.find((d) => d.key === hoveredInsertTarget.key)
        if (!dot) return null
        return (
          <div
            className={`qz-table-insert-line is-${edge.kind}`}
            style={{
              left: dot.line.left,
              top: dot.line.top,
              width: dot.line.width,
              height: dot.line.height,
            }}
          />
        )
      })()}
      {(['column', 'row'] as const).map((kind) => {
        const edge = edgeIntent[kind]
        return (
          <React.Fragment key={kind}>
            <button
              type="button"
              aria-label={`select-advanced-table-${kind}`}
              data-qz-label={kind === 'row' ? '选择整行' : '选择整列'}
              className={`qz-table-edge-select-zone is-${kind}`}
              style={{
                left: edge.select.left,
                top: edge.select.top,
                width: edge.select.width,
                height: edge.select.height,
              }}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                selectEdge(kind, event.clientX, event.clientY)
              }}
            />
            {edge.dots.map((dot) => {
              const isHot =
                hoveredInsertTarget?.kind === kind && hoveredInsertTarget?.key === dot.key
              return (
                <button
                  key={dot.key}
                  type="button"
                  aria-label={`insert-advanced-table-${kind}`}
                  data-qz-label={kind === 'row' ? '插入行' : '插入列'}
                  className={`qz-table-edge-button qz-table-edge-dot qz-table-edge-add-button is-${kind} ${isHot ? 'is-hot' : ''}`}
                  style={{
                    left: dot.left,
                    top: dot.top,
                  }}
                  onMouseEnter={() => setHoveredInsertTarget({ kind, key: dot.key })}
                  onMouseLeave={() =>
                    setHoveredInsertTarget((prev) =>
                      prev && prev.kind === kind && prev.key === dot.key ? null : prev,
                    )
                  }
                  onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setHoveredInsertTarget(null)
                    insertEdgeAtPoint(kind, dot.commandPoint.x, dot.commandPoint.y)
                  }}
                />
              )
            })}
          </React.Fragment>
        )
      })}
    </div>,
    document.body,
  )
}

type AdvancedTableSizePickerProps = {
  size: AdvancedTableSizePickerState
  setSize: React.Dispatch<React.SetStateAction<AdvancedTableSizePickerState>>
  insertWithSize: (rows: number, cols: number) => void
}

export function AdvancedTableSizePicker({
  size,
  setSize,
  insertWithSize,
}: AdvancedTableSizePickerProps) {
  if (!size.open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="qz-table-size-picker"
      role="dialog"
      aria-label="选择高级表格行列"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="qz-table-size-picker-head">
        <div>
          <div className="qz-table-size-picker-title">高级表格</div>
          <div className="qz-table-size-picker-subtitle">
            {size.rows} 行 × {size.cols} 列
          </div>
        </div>
        <button
          type="button"
          aria-label="close-advanced-table-size-picker"
          onClick={() => setSize((value) => ({ ...value, open: false }))}
        >
          <X size={14} />
        </button>
      </div>
      <div className="qz-table-size-picker-grid">
        {Array.from({ length: 64 }).map((_, index) => {
          const row = Math.floor(index / 8) + 1
          const col = (index % 8) + 1
          const selected = row <= size.rows && col <= size.cols
          return (
            <button
              key={`${row}-${col}`}
              type="button"
              aria-label={`insert-advanced-table-${row}x${col}`}
              className={selected ? 'is-selected' : ''}
              onMouseEnter={() => setSize((value) => ({ ...value, rows: row, cols: col }))}
              onClick={() => insertWithSize(row, col)}
            />
          )
        })}
      </div>
      <div className="qz-table-size-picker-foot">点击格子插入，悬停预览行列数量</div>
    </div>,
    document.body,
  )
}
