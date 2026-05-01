/**
 * v0.21.6 · 白板全屏编辑 Modal
 *
 * 职责:
 *   - 捕获 Esc / Cmd+S 关闭并保存
 *   - 装载 store, 提供 Board / Toolbar / Inspector 的 state 源
 *   - 关闭时调用 commitBack(data) 写回 tiptap 节点
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WhiteboardData } from '../../lib/whiteboard/types'
import { migrate } from '../../lib/whiteboard/schemaMigration'
import { createWhiteboardStore, type WhiteboardState } from '../../store/whiteboard/whiteboardStore'
import { Toolbar, type ToolId } from './Toolbar'
import { Board } from './Board'
import { Inspector } from './Inspector'
import { AlignBar } from './AlignBar'
import { TemplatePicker } from './TemplatePicker'
import { buildTemplate, TEMPLATES, type TemplateId } from '../../lib/whiteboard/templates'
import {
  copyPngToClipboard,
  downloadBlob,
  exportPng,
  exportSvg,
} from '../../lib/whiteboard/export'
import { toMarkdownDataUrlImg, toMarkdownInlineSvg } from '../../lib/whiteboard/markdown'

interface Props {
  initial: WhiteboardData
  onClose: () => void
  onSave: (data: WhiteboardData) => void
}

export function WhiteboardModal({ initial, onClose, onSave }: Props) {
  const store = useMemo(() => createWhiteboardStore(migrate(initial as any)), [initial])
  const [snap, setSnap] = useState<WhiteboardState>(() => store.getState())
  const [tool, setTool] = useState<ToolId>('select')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  const applyTemplate = useCallback(
    (id: TemplateId) => {
      const data = buildTemplate(id)
      store.replace(data)
      setShowTemplates(false)
    },
    [store],
  )

  const doExportSvg = useCallback(() => {
    const svg = exportSvg(store.getState().data)
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    downloadBlob(blob, `whiteboard-${Date.now()}.svg`)
    setShowExport(false)
  }, [store])

  const doExportPng = useCallback(async () => {
    try {
      const png = await exportPng(store.getState().data)
      downloadBlob(png, `whiteboard-${Date.now()}.png`)
      setShowExport(false)
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e))
    }
  }, [store])

  const doCopyPng = useCallback(async () => {
    try {
      await copyPngToClipboard(store.getState().data)
      setExportMsg('已复制 PNG 到剪贴板')
      setShowExport(false)
      setTimeout(() => setExportMsg(null), 1800)
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e))
    }
  }, [store])

  const doCopyMarkdown = useCallback(async () => {
    try {
      const md = toMarkdownInlineSvg(store.getState().data)
      await navigator.clipboard.writeText(md)
      setExportMsg('已复制 Markdown (含内联 SVG)')
      setShowExport(false)
      setTimeout(() => setExportMsg(null), 1800)
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e))
    }
  }, [store])

  // v0.21.8 · B 线 · 复制 Markdown + data-URL 图片 (便于任何 Markdown 渲染器)
  const doCopyMarkdownDataUrl = useCallback(async () => {
    try {
      const md = toMarkdownDataUrlImg(store.getState().data)
      await navigator.clipboard.writeText(md)
      setExportMsg('已复制 Markdown (data-URL 图片)')
      setShowExport(false)
      setTimeout(() => setExportMsg(null), 1800)
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e))
    }
  }, [store])

  useEffect(() => {
    return store.subscribe((s) => setSnap({ ...s }))
  }, [store])

  const commitAndClose = useCallback(() => {
    const { viewport: _viewport, ...persist } = store.getState().data
    saveRef.current({ ...persist, viewport: { x: 0, y: 0, zoom: 1 }, version: 2 })
    onClose()
  }, [store, onClose])

  useEffect(() => {
    function isTypingTarget(el: Element | null): boolean {
      if (!el) return false
      const tag = (el as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if ((el as HTMLElement).isContentEditable) return true
      return false
    }
    function onKey(e: KeyboardEvent) {
      const typing = isTypingTarget(document.activeElement)
      if (e.key === 'Escape') {
        e.preventDefault()
        commitAndClose()
        return
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        commitAndClose()
        return
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) store.redo()
        else store.undo()
        return
      }
      if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
        store.removeSelected()
        return
      }
      if (typing) return
      const map: Record<string, ToolId> = {
        v: 'select',
        h: 'hand',
        p: 'pen',
        e: 'eraser',
        n: 'node-rect',
        c: 'edge',
        t: 'text',
      }
      const key = e.key.toLowerCase()
      if (map[key] && !(e.metaKey || e.ctrlKey)) {
        setTool(map[key])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store, commitAndClose])

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col bg-[#f7f8fa] text-slate-900"
      style={{ isolation: 'isolate' }}
    >
      <header className="h-12 flex items-center justify-between px-4 border-b bg-white/85 backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span className="inline-flex w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-500 text-white items-center justify-center text-[11px]">
            WB
          </span>
          画板编辑器
          <span className="text-xs font-normal text-slate-400 ml-2">Esc / ⌘S 保存并关闭</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplates(true)}
            className="px-2 py-1 rounded text-xs border bg-white hover:bg-slate-50"
            title="插入模板"
          >
            📐 模板
          </button>
          <div className="relative">
            <button
              onClick={() => setShowExport((v) => !v)}
              className="px-2 py-1 rounded text-xs border bg-white hover:bg-slate-50"
              title="导出"
            >
              ⬇ 导出 ▾
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg py-1 w-40 z-[120]">
                <button
                  onClick={doExportSvg}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100"
                >
                  导出 SVG
                </button>
                <button
                  onClick={doExportPng}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100"
                >
                  导出 PNG (2x)
                </button>
                <button
                  onClick={doCopyPng}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100"
                >
                  复制 PNG 到剪贴板
                </button>
                <button
                  onClick={doCopyMarkdown}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100"
                >
                  复制 Markdown (内联 SVG)
                </button>
                <button
                  onClick={doCopyMarkdownDataUrl}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100"
                >
                  复制 Markdown (data-URL 图)
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => store.undo()}
            disabled={!store.canUndo()}
            className="px-2 py-1 rounded text-xs border bg-white disabled:opacity-40"
          >
            ↶ 撤销
          </button>
          <button
            onClick={() => store.redo()}
            disabled={!store.canRedo()}
            className="px-2 py-1 rounded text-xs border bg-white disabled:opacity-40"
          >
            ↷ 重做
          </button>
          <button
            onClick={commitAndClose}
            className="px-3 py-1 rounded text-xs bg-indigo-600 text-white hover:bg-indigo-700"
          >
            完成 (Esc)
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <Toolbar tool={tool} onToolChange={setTool} store={store} />
        <div className="flex-1 min-w-0 relative">
          <Board store={store} tool={tool} onToolChange={setTool} state={snap} />
          <AlignBar store={store} state={snap} />
          {snap.data.nodes.length === 0 &&
            snap.data.edges.length === 0 &&
            snap.data.strokes.length === 0 && (
              <EmptyState onPick={applyTemplate} templates={TEMPLATES} />
            )}
        </div>
        <Inspector store={store} state={snap} />
      </div>

      {showTemplates && (
        <TemplatePicker
          templates={TEMPLATES}
          onPick={applyTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {exportMsg && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-4 py-2 rounded-lg shadow-lg z-[210]">
          {exportMsg}
        </div>
      )}
    </div>
  )
}

function EmptyState({
  onPick,
  templates,
}: {
  onPick: (id: TemplateId) => void
  templates: typeof TEMPLATES
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="bg-white/90 backdrop-blur border rounded-xl shadow-lg p-6 max-w-md pointer-events-auto">
        <div className="text-sm font-semibold text-slate-700 mb-2">从模板开始</div>
        <div className="text-[11px] text-slate-500 mb-3">或直接在空白画布上开始绘制 / 使用左侧工具</div>
        <div className="grid grid-cols-2 gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              className="flex items-start gap-2 p-2 rounded-lg border hover:border-indigo-400 hover:bg-indigo-50 text-left transition"
            >
              <span className="text-xl">{t.icon}</span>
              <span>
                <span className="block text-[13px] font-medium text-slate-800">{t.label}</span>
                <span className="block text-[11px] text-slate-500">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
