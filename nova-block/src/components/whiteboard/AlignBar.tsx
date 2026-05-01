/**
 * v0.21.7 · A3 · 对齐/分布 浮动操作条
 *
 * 仅在 ≥2 个节点被选中时显示. 位置: 画布底部居中.
 * 分布按钮在 <3 个选中时 disabled.
 */
import { applyAlign, type AlignDir } from '../../lib/whiteboard/align'
import type { WhiteboardState, WhiteboardStore } from '../../store/whiteboard/whiteboardStore'

interface Props {
  store: WhiteboardStore
  state: WhiteboardState
}

const BUTTONS: Array<{ dir: AlignDir; label: string; title: string; needs: number }> = [
  { dir: 'align-left', label: '⬅', title: '左对齐', needs: 2 },
  { dir: 'align-center-x', label: '↔', title: '水平居中', needs: 2 },
  { dir: 'align-right', label: '➡', title: '右对齐', needs: 2 },
  { dir: 'align-top', label: '⬆', title: '顶端对齐', needs: 2 },
  { dir: 'align-center-y', label: '↕', title: '垂直居中', needs: 2 },
  { dir: 'align-bottom', label: '⬇', title: '底端对齐', needs: 2 },
  { dir: 'distribute-h', label: '⇿', title: '水平分布', needs: 3 },
  { dir: 'distribute-v', label: '⇕', title: '垂直分布', needs: 3 },
]

export function AlignBar({ store, state }: Props) {
  const selIds = state.selectedIds.filter((id) => state.data.nodes.some((n) => n.id === id))
  if (selIds.length < 2) return null

  const apply = (dir: AlignDir) => {
    const next = applyAlign(state.data.nodes, selIds, dir)
    store.replace({ ...state.data, nodes: next })
  }

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white border rounded-full shadow-lg px-2 py-1">
      <span className="text-[11px] text-slate-500 px-2">已选 {selIds.length}</span>
      <div className="w-px h-4 bg-slate-200 mx-1" />
      {BUTTONS.map((b, i) => {
        const disabled = selIds.length < b.needs
        return (
          <button
            key={b.dir}
            title={b.title + (disabled ? ` (需选 ≥${b.needs})` : '')}
            disabled={disabled}
            onClick={() => apply(b.dir)}
            className={
              'w-8 h-8 rounded flex items-center justify-center text-[15px] transition ' +
              (disabled
                ? 'text-slate-300 cursor-not-allowed'
                : 'text-slate-700 hover:bg-slate-100')
            }
            style={{
              borderLeft: i === 6 ? '1px solid #e2e8f0' : undefined,
              marginLeft: i === 6 ? 4 : undefined,
              paddingLeft: i === 6 ? 6 : undefined,
            }}
          >
            {b.label}
          </button>
        )
      })}
    </div>
  )
}
