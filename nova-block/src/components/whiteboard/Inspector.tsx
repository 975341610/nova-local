/**
 * v0.21.6 · 右侧属性面板
 * 单选时显示节点/连线属性 (颜色/描边/字号/旋转);
 * 多选显示数量, 无选中显示画板信息.
 */
import {
  DEFAULT_EDGE_STROKE,
  DEFAULT_NODE_FILL,
  DEFAULT_NODE_STROKE,
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
            单选连线可切换路由/箭头.
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
            ]}
            onChange={(v) =>
              store.updateEdge(selectedEdge.id, { routing: v as 'orthogonal' | 'straight' })
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
            label="终点箭头"
            value={selectedEdge.arrowEnd ?? 'arrow'}
            options={[
              { v: 'arrow', label: '有' },
              { v: 'none', label: '无' },
            ]}
            onChange={(v) =>
              store.updateEdge(selectedEdge.id, { arrowEnd: v as 'arrow' | 'none' })
            }
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
