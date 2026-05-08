/**
 * v0.21.6 · 右侧属性面板
 * v0.21.11 · 新增: 曲线路由 + 箭头样式 (triangle/dot/diamond) + 起点箭头
 * 单选时显示节点/连线属性 (颜色/描边/字号/旋转);
 * 多选显示数量, 无选中显示画板信息.
 */
import {
  DEFAULT_EDGE_STROKE,
  DEFAULT_NODE_FILL,
  DEFAULT_NODE_STROKE,
  type ArrowStyle,
  type EdgeRouting,
} from '../../lib/whiteboard/types'
import type { WhiteboardStore, WhiteboardState } from '../../store/whiteboard/whiteboardStore'

interface Props {
  store: WhiteboardStore
  state: WhiteboardState
}

export function Inspector({ store, state }: Props) {
  const { data, selectedIds } = state
  const selectedNode =
    selectedIds.length === 1 ? data.nodes.find((n) => n.id === selectedIds[0]) : undefined
  const selectedEdge =
    selectedIds.length === 1 ? data.edges.find((e) => e.id === selectedIds[0]) : undefined

  return (
    <aside className="w-60 shrink-0 border-l bg-white overflow-y-auto text-xs">
      <div className="px-3 py-3 border-b">
        <div className="text-[11px] uppercase text-slate-400 tracking-wider">属性</div>
      </div>

      {!selectedNode && !selectedEdge && (
        <div className="p-3 space-y-2 text-slate-500">
          <Field label="节点数">{data.nodes.length}</Field>
          <Field label="连线数">{data.edges.length}</Field>
          <Field label="笔画数">{data.strokes.length}</Field>
          <div className="pt-2 text-[11px] leading-relaxed text-slate-400">
            单选节点可编辑颜色/描边/字号;<br />
            单选连线可切换路由/箭头/标签.
          </div>
        </div>
      )}

      {selectedNode && (
        <div className="p-3 space-y-3">
          <Field label="形状">{selectedNode.shape}</Field>
          <ColorRow
            label="填充"
            value={selectedNode.fill ?? DEFAULT_NODE_FILL[selectedNode.shape]}
            onChange={(v) => store.updateNode(selectedNode.id, { fill: v })}
          />
          <ColorRow
            label="描边"
            value={selectedNode.stroke ?? DEFAULT_NODE_STROKE}
            onChange={(v) => store.updateNode(selectedNode.id, { stroke: v })}
          />
          <NumberRow
            label="描边宽度"
            value={selectedNode.strokeWidth ?? 1.5}
            min={0}
            max={8}
            step={0.5}
            onChange={(v) => store.updateNode(selectedNode.id, { strokeWidth: v })}
          />
          <NumberRow
            label="字号"
            value={selectedNode.fontSize ?? 14}
            min={10}
            max={36}
            onChange={(v) => store.updateNode(selectedNode.id, { fontSize: v })}
          />
          <NumberRow
            label="旋转(°)"
            value={selectedNode.rotation ?? 0}
            min={-180}
            max={180}
            onChange={(v) => store.updateNode(selectedNode.id, { rotation: v })}
          />
          {selectedNode.shape === 'image' && (
            <ImageEditor
              src={selectedNode.src ?? ''}
              onChange={(v) => store.updateNode(selectedNode.id, { src: v })}
              onStartCrop={() => {
                // v0.21.16 · 通过自定义事件触发 Board 内的裁剪浮层
                window.dispatchEvent(
                  new CustomEvent('wb:start-crop', { detail: { id: selectedNode.id } }),
                )
              }}
            />
          )}
          {selectedNode.shape === 'table' && (
            <TableEditor
              cells={selectedNode.cells ?? [['']]}
              onChange={(cells) => store.updateNode(selectedNode.id, { cells })}
            />
          )}
          <button
            onClick={() => store.removeNode(selectedNode.id)}
            className="w-full py-1.5 text-xs rounded border border-rose-300 text-rose-600 hover:bg-rose-50"
          >
            删除节点
          </button>
        </div>
      )}

      {selectedEdge && (
        <div className="p-3 space-y-3">
          <Field label="类型">连线</Field>
          <SelectRow
            label="路由"
            value={selectedEdge.routing ?? 'orthogonal'}
            options={[
              { v: 'orthogonal', label: '正交' },
              { v: 'straight', label: '直线' },
              { v: 'curve', label: '曲线' },
            ]}
            onChange={(v) =>
              store.updateEdge(selectedEdge.id, { routing: v as EdgeRouting })
            }
          />
          <ColorRow
            label="颜色"
            value={selectedEdge.stroke ?? DEFAULT_EDGE_STROKE}
            onChange={(v) => store.updateEdge(selectedEdge.id, { stroke: v })}
          />
          <NumberRow
            label="线宽"
            value={selectedEdge.strokeWidth ?? 1.5}
            min={0.5}
            max={6}
            step={0.5}
            onChange={(v) => store.updateEdge(selectedEdge.id, { strokeWidth: v })}
          />
          <SelectRow
            label="起点箭头"
            value={selectedEdge.arrowStart ?? 'none'}
            options={[
              { v: 'none', label: '无' },
              { v: 'arrow', label: '箭头' },
              { v: 'triangle', label: '实心三角' },
              { v: 'dot', label: '圆点' },
              { v: 'diamond', label: '菱形' },
            ]}
            onChange={(v) =>
              store.updateEdge(selectedEdge.id, { arrowStart: v as ArrowStyle })
            }
          />
          <SelectRow
            label="终点箭头"
            value={selectedEdge.arrowEnd ?? 'arrow'}
            options={[
              { v: 'none', label: '无' },
              { v: 'arrow', label: '箭头' },
              { v: 'triangle', label: '实心三角' },
              { v: 'dot', label: '圆点' },
              { v: 'diamond', label: '菱形' },
            ]}
            onChange={(v) =>
              store.updateEdge(selectedEdge.id, { arrowEnd: v as ArrowStyle })
            }
          />
          <TextRow
            label="标签"
            value={selectedEdge.label ?? ''}
            placeholder="双击连线也可编辑"
            onChange={(v) => store.updateEdge(selectedEdge.id, { label: v })}
          />
          <button
            onClick={() => store.removeEdge(selectedEdge.id)}
            className="w-full py-1.5 text-xs rounded border border-rose-300 text-rose-600 hover:bg-rose-50"
          >
            删除连线
          </button>
        </div>
      )}

      {selectedIds.length > 1 && (
        <div className="p-3 space-y-2 text-slate-600">
          <Field label="多选">{selectedIds.length} 项</Field>
          <button
            onClick={() => store.removeSelected()}
            className="w-full py-1.5 text-xs rounded border border-rose-300 text-rose-600 hover:bg-rose-50"
          >
            删除选中
          </button>
        </div>
      )}
    </aside>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-700">{children}</span>
    </div>
  )
}
function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-7 border rounded"
      />
    </div>
  )
}
function NumberRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 px-1 py-0.5 border rounded text-right"
      />
    </div>
  )
}
function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ v: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 px-1 py-0.5 border rounded"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function TextRow({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 px-1 py-0.5 border rounded text-left"
      />
    </div>
  )
}

// v0.21.14 · 图片 src 编辑 (支持粘贴 URL 或重新选择本地文件)
// v0.21.16 · 增加"裁剪"按钮, 点击后通过事件通知 Board 打开裁剪浮层
function ImageEditor({
  src,
  onChange,
  onStartCrop,
}: {
  src: string
  onChange: (v: string) => void
  onStartCrop?: () => void
}) {
  const pickFile = () => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = 'image/*'
    inp.onchange = () => {
      const f = inp.files?.[0]
      if (!f) return
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') onChange(reader.result)
      }
      reader.readAsDataURL(f)
    }
    inp.click()
  }
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-slate-400">图片</div>
      {src && (
        <div className="border rounded overflow-hidden bg-slate-50">
          <img
            src={src}
            alt=""
            style={{ width: '100%', maxHeight: 80, objectFit: 'contain' }}
          />
        </div>
      )}
      <input
        type="text"
        value={src}
        onChange={(e) => onChange(e.target.value)}
        placeholder="粘贴 URL 或 data URL"
        className="w-full px-1 py-0.5 border rounded text-[11px]"
      />
      <button
        onClick={pickFile}
        className="w-full py-1 text-[11px] rounded border bg-white hover:bg-slate-50"
      >
        重新选择本地图片
      </button>
      {onStartCrop && src && (
        <button
          onClick={onStartCrop}
          className="w-full py-1 text-[11px] rounded border border-indigo-300 text-indigo-600 bg-white hover:bg-indigo-50"
        >
          裁剪图片
        </button>
      )}
    </div>
  )
}

// v0.21.14 · 表格编辑: 行列数调整 + 单元格文本
function TableEditor({
  cells,
  onChange,
}: {
  cells: string[][]
  onChange: (cells: string[][]) => void
}) {
  const rows = cells.length
  const cols = Math.max(1, ...cells.map((r) => r.length))

  const resize = (nextRows: number, nextCols: number) => {
    const r = Math.max(1, Math.min(12, nextRows))
    const c = Math.max(1, Math.min(8, nextCols))
    const out: string[][] = []
    for (let i = 0; i < r; i++) {
      const src = cells[i] ?? []
      const row: string[] = []
      for (let j = 0; j < c; j++) row.push(src[j] ?? '')
      out.push(row)
    }
    onChange(out)
  }

  const setCell = (ri: number, ci: number, v: string) => {
    const out = cells.map((r) => [...r])
    while (out.length <= ri) out.push(Array.from({ length: cols }, () => ''))
    while (out[ri].length <= ci) out[ri].push('')
    out[ri][ci] = v
    onChange(out)
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-slate-400">表格</div>
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-slate-500">行</span>
        <input
          type="number"
          min={1}
          max={12}
          value={rows}
          onChange={(e) => resize(Number(e.target.value), cols)}
          className="w-12 px-1 py-0.5 border rounded text-right"
        />
        <span className="text-[11px] text-slate-500 ml-2">列</span>
        <input
          type="number"
          min={1}
          max={8}
          value={cols}
          onChange={(e) => resize(rows, Number(e.target.value))}
          className="w-12 px-1 py-0.5 border rounded text-right"
        />
      </div>
      <div className="max-h-48 overflow-auto border rounded bg-slate-50 p-1">
        {Array.from({ length: rows }).map((_, ri) => (
          <div key={ri} className="flex gap-1 mb-1 last:mb-0">
            {Array.from({ length: cols }).map((_, ci) => (
              <input
                key={ci}
                value={cells[ri]?.[ci] ?? ''}
                onChange={(e) => setCell(ri, ci, e.target.value)}
                placeholder={ri === 0 ? `列${ci + 1}` : ''}
                className={
                  'flex-1 min-w-0 px-1 py-0.5 border rounded text-[11px] ' +
                  (ri === 0 ? 'font-semibold bg-white' : 'bg-white')
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
