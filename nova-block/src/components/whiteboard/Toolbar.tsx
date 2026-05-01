/**
 * v0.21.6 · 左侧工具栏
 * 工具 ID 由 Modal 持有, Board 根据 tool 路由鼠标事件.
 */
import type { WhiteboardStore } from '../../store/whiteboard/whiteboardStore'

export type ToolId =
  | 'select'
  | 'hand'
  | 'pen'
  | 'eraser'
  | 'node-rect'
  | 'node-ellipse'
  | 'node-diamond'
  | 'node-sticky'
  | 'node-plantuml'
  | 'edge'
  | 'text'

interface Props {
  tool: ToolId
  onToolChange: (t: ToolId) => void
  store: WhiteboardStore
}

const TOOLS: Array<{ id: ToolId; icon: string; label: string; key?: string }> = [
  { id: 'select', icon: '◱', label: '选择', key: 'V' },
  { id: 'hand', icon: '✋', label: '平移', key: 'H' },
  { id: 'pen', icon: '✎', label: '手绘', key: 'P' },
  { id: 'eraser', icon: '⌫', label: '橡皮', key: 'E' },
  { id: 'node-rect', icon: '▭', label: '矩形', key: 'N' },
  { id: 'node-ellipse', icon: '◯', label: '椭圆' },
  { id: 'node-diamond', icon: '◇', label: '菱形' },
  { id: 'node-sticky', icon: '🗒', label: '便签' },
  { id: 'node-plantuml', icon: '{P}', label: 'PlantUML' },
  { id: 'edge', icon: '↗', label: '连线', key: 'C' },
  { id: 'text', icon: 'T', label: '文本', key: 'T' },
]

export function Toolbar({ tool, onToolChange }: Props) {
  return (
    <aside className="w-14 shrink-0 border-r bg-white flex flex-col items-center py-3 gap-1">
      {TOOLS.map((t) => {
        const active = tool === t.id
        return (
          <button
            key={t.id}
            onClick={() => onToolChange(t.id)}
            title={t.key ? `${t.label} (${t.key})` : t.label}
            className={
              'w-10 h-10 rounded-lg flex items-center justify-center text-[15px] border transition ' +
              (active
                ? 'bg-indigo-600 text-white border-indigo-600 shadow'
                : 'bg-white hover:bg-slate-100 text-slate-600 border-transparent')
            }
          >
            {t.icon}
          </button>
        )
      })}
    </aside>
  )
}
