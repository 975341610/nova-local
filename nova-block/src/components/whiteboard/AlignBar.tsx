/**
 * v0.21.7 · A3 · 对齐/分布 浮动操作条
 * v0.21.13 · 增加 分组 / 取消分组 / 锁定 / 解锁 / 置顶 / 置底 / 上移 / 下移
 *
 * 选中 ≥1: 显示锁定/解锁 + z-index 控制;
 * 选中 ≥2: 显示分组 + 对齐;
 * 选中 ≥3: 显示分布.
 */
import { applyAlign, type AlignDir } from '../../lib/whiteboard/align'
import type { WhiteboardState, WhiteboardStore } from '../../store/whiteboard/whiteboardStore'

interface Props {
  store: WhiteboardStore
  state: WhiteboardState
}

const ALIGN_BUTTONS: Array<{ dir: AlignDir; label: string; title: string; needs: number }> = [
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
  if (selIds.length < 1) return null
  const selNodes = state.data.nodes.filter((n) => selIds.includes(n.id))
  const anyLocked = selNodes.some((n) => n.locked)
  const allLocked = selNodes.length > 0 && selNodes.every((n) => n.locked)
  const hasGroup = selNodes.some((n) => n.group)

  const apply = (dir: AlignDir) => {
    const next = applyAlign(state.data.nodes, selIds, dir)
    store.replace({ ...state.data, nodes: next })
  }

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white border rounded-full shadow-lg px-2 py-1">
      <span className="text-[11px] text-slate-500 px-2">已选 {selIds.length}</span>
      <div className="w-px h-4 bg-slate-200 mx-1" />

      {/* 对齐 / 分布 */}
      {ALIGN_BUTTONS.map((b) => {
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
          >
            {b.label}
          </button>
        )
      })}

      <div className="w-px h-4 bg-slate-200 mx-1" />

      {/* z-index */}
      <button
        title="置顶 (z-index top)"
        onClick={() => store.bringToFront()}
        className="w-8 h-8 rounded flex items-center justify-center text-slate-700 hover:bg-slate-100 text-[15px]"
      >
        ⤒
      </button>
      <button
        title="上移一层"
        onClick={() => store.bringForward()}
        className="w-8 h-8 rounded flex items-center justify-center text-slate-700 hover:bg-slate-100 text-[13px]"
      >
        ▲
      </button>
      <button
        title="下移一层"
        onClick={() => store.sendBackward()}
        className="w-8 h-8 rounded flex items-center justify-center text-slate-700 hover:bg-slate-100 text-[13px]"
      >
        ▼
      </button>
      <button
        title="置底"
        onClick={() => store.sendToBack()}
        className="w-8 h-8 rounded flex items-center justify-center text-slate-700 hover:bg-slate-100 text-[15px]"
      >
        ⤓
      </button>

      <div className="w-px h-4 bg-slate-200 mx-1" />

      {/* 分组 / 锁定 */}
      <button
        title={selIds.length < 2 ? '分组 (需 ≥2 个节点)' : '分组'}
        disabled={selIds.length < 2}
        onClick={() => store.groupSelected()}
        className={
          'w-8 h-8 rounded flex items-center justify-center text-[13px] transition ' +
          (selIds.length < 2
            ? 'text-slate-300 cursor-not-allowed'
            : 'text-slate-700 hover:bg-slate-100')
        }
      >
        ⎗
      </button>
      <button
        title={hasGroup ? '取消分组' : '选中节点未分组'}
        disabled={!hasGroup}
        onClick={() => store.ungroupSelected()}
        className={
          'w-8 h-8 rounded flex items-center justify-center text-[13px] transition ' +
          (!hasGroup
            ? 'text-slate-300 cursor-not-allowed'
            : 'text-slate-700 hover:bg-slate-100')
        }
      >
        ⎘
      </button>
      <button
        title={allLocked ? '解锁' : anyLocked ? '全部锁定 / 再点击解锁' : '锁定'}
        onClick={() => store.lockSelected(!allLocked)}
        className={
          'w-8 h-8 rounded flex items-center justify-center text-[13px] transition ' +
          (allLocked
            ? 'bg-amber-100 text-amber-700'
            : 'text-slate-700 hover:bg-slate-100')
        }
      >
        {allLocked ? '🔒' : '🔓'}
      </button>
    </div>
  )
}
