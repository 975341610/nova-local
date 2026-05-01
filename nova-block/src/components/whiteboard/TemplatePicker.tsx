/**
 * v0.21.7 · A4 · 模板选择器 (模态 overlay)
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

export function TemplatePicker({ templates, onPick, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 w-[520px] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-base font-semibold text-slate-800">选择模板</div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
            title="关闭"
          >
            ×
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              className="text-left rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 p-3 transition"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{t.icon}</span>
                <span className="text-[14px] font-medium text-slate-800">{t.label}</span>
              </div>
              <div className="text-[11px] text-slate-500 leading-relaxed">{t.description}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 text-[11px] text-slate-400">
          模板会覆盖当前画板内容, 可通过 ⌘Z 撤销
        </div>
      </div>
    </div>
  )
}
