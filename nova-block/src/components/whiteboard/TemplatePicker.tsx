/**
 * v0.21.7 · A4 · 模板选择器 (模态 overlay)
 * v0.21.12 · 按 category 分组展示 (flow / structure / mindmap / strategy)
 *
 * 触发自 header 的 "📐 模板" 按钮. 点击模板后:
 *   - 替换当前画布数据 (走 store.replace, 可撤销)
 *   - 关闭自身
 */
import type { TemplateId, TemplateMeta } from '../../lib/whiteboard/templates'

interface Props {
  templates: TemplateMeta[]
  onPick: (id: TemplateId) => void
  onClose: () => void
}

const CATEGORY_LABEL: Record<TemplateMeta['category'], string> = {
  flow: '流程',
  structure: '结构',
  mindmap: '思维导图',
  strategy: '策略 / 复盘',
}
const CATEGORY_ORDER: Array<TemplateMeta['category']> = [
  'flow',
  'structure',
  'mindmap',
  'strategy',
]

export function TemplatePicker({ templates, onPick, onClose }: Props) {
  const grouped: Record<string, TemplateMeta[]> = {}
  for (const t of templates) {
    ;(grouped[t.category] ??= []).push(t)
  }
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 w-[720px] max-w-[92vw] max-h-[86vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-white">
          <div className="text-base font-semibold text-slate-800">选择模板</div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
            title="关闭"
          >
            ×
          </button>
        </div>
        {CATEGORY_ORDER.map((cat) => {
          const list = grouped[cat] ?? []
          if (list.length === 0) return null
          return (
            <div key={cat} className="mb-5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
                {CATEGORY_LABEL[cat]}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {list.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onPick(t.id)}
                    className="text-left rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 p-3 transition"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{t.icon}</span>
                      <span className="text-[14px] font-medium text-slate-800">{t.label}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 leading-relaxed">
                      {t.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        <div className="mt-2 text-[11px] text-slate-400">
          模板会覆盖当前画板内容, 可通过 ⌘Z 撤销
        </div>
      </div>
    </div>
  )
}
