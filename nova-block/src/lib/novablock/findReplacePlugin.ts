/**
 * F1-T1 · 查找替换 ProseMirror 插件
 *
 * 在 Tiptap/ProseMirror 文档上提供查找/替换能力:
 *  - 维护 matches: 命中的 (from, to) 区间列表
 *  - 维护 current: 当前选中的命中项索引
 *  - 通过 Decoration 在视图上画高亮(当前项与其它项配色不同)
 *  - 支持 caseSensitive / wholeWord / regex 三个开关
 *
 * 设计要点:
 *  - 文档变更时(transaction.docChanged)自动重算 matches
 *  - replaceCurrent 走 ProseMirror 事务,保留撤销栈
 *  - replaceAll 用单个事务批量替换(从后往前替换以避免位置漂移)
 */
import { Plugin, PluginKey, EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { Extension } from '@tiptap/core'

export type FindReplaceOptions = {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export type FindReplaceMatch = { from: number; to: number }

export type FindReplaceState = {
  query: string
  options: FindReplaceOptions
  matches: FindReplaceMatch[]
  current: number
  decorations: DecorationSet
}

const META_KEY = 'findReplace$meta'

type FindReplaceMeta =
  | { type: 'setQuery'; query: string; options: FindReplaceOptions }
  | { type: 'gotoNext' }
  | { type: 'gotoPrev' }
  | { type: 'recompute' }

export const findReplacePluginKey = new PluginKey<FindReplaceState>('findReplace')

const INITIAL_STATE: FindReplaceState = {
  query: '',
  options: { caseSensitive: false, wholeWord: false, regex: false },
  matches: [],
  current: -1,
  decorations: DecorationSet.empty,
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildRegex(query: string, options: FindReplaceOptions): RegExp | null {
  if (!query) return null
  const flags = options.caseSensitive ? 'g' : 'gi'
  let pattern = options.regex ? query : escapeRegExp(query)
  if (options.wholeWord) {
    pattern = `\\b(?:${pattern})\\b`
  }
  try {
    return new RegExp(pattern, flags)
  } catch {
    return null
  }
}

/**
 * 在文档纯文本中查找命中区间。
 *
 * v2 (审查 v4-#1, v5-#1): text-node-level 扫描 + 每个 textblock 维护
 * `idx2pos: number[]` 字符偏移到 doc 偏移的映射表;atomic inline 节点
 * 写入占位符 `￼` (OBJECT REPLACEMENT CHARACTER),防止跨节点误匹配
 * (例如 `foo[mention]bar` 不会被搜索 `foobar` 跨过 atom 命中)。
 *
 * 零宽 match (m[0].length === 0) 仍记录为 from === to,但 replaceCurrent /
 * replaceAll 会拒绝替换它 (审查 v4-#2)。
 */
const ATOMIC_PLACEHOLDER = '￼'

export function findMatches(state: EditorState, query: string, options: FindReplaceOptions): FindReplaceMatch[] {
  const re = buildRegex(query, options)
  if (!re) return []
  const results: FindReplaceMatch[] = []
  state.doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return
    // 收集 textblock 内的字符序列与 doc 偏移映射
    let acc = ''
    const idx2pos: number[] = []
    let cursor = blockPos + 1
    block.forEach((child) => {
      if (child.isText) {
        const t = child.text || ''
        for (let i = 0; i < t.length; i++) idx2pos.push(cursor + i)
        acc += t
      } else {
        // atomic inline 节点写入占位符 (审查 v4-#1)
        acc += ATOMIC_PLACEHOLDER
        idx2pos.push(cursor)
      }
      cursor += child.nodeSize
    })
    if (!acc) return

    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(acc)) !== null) {
      if (m[0].length === 0) {
        // 零宽 match: 记录为 from === to,推进 lastIndex 防死循环
        const from = idx2pos[m.index] ?? cursor
        results.push({ from, to: from })
        re.lastIndex += 1
        continue
      }
      const startIdx = m.index
      const endIdx = m.index + m[0].length - 1
      const from = idx2pos[startIdx]
      const to = (idx2pos[endIdx] ?? from) + 1
      results.push({ from, to })
    }
  })
  return results
}

function createDecorations(state: EditorState, matches: FindReplaceMatch[], current: number): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty
  const decos = matches.map((m, idx) =>
    Decoration.inline(m.from, m.to, {
      class: idx === current ? 'nv-find-match nv-find-match-current' : 'nv-find-match',
    }),
  )
  return DecorationSet.create(state.doc, decos)
}

export function findReplacePlugin(): Plugin<FindReplaceState> {
  return new Plugin<FindReplaceState>({
    key: findReplacePluginKey,
    state: {
      init() {
        return INITIAL_STATE
      },
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(META_KEY) as FindReplaceMeta | undefined
        if (meta) {
          if (meta.type === 'setQuery') {
            const matches = findMatches(newState, meta.query, meta.options)
            const current = matches.length > 0 ? 0 : -1
            return {
              query: meta.query,
              options: meta.options,
              matches,
              current,
              decorations: createDecorations(newState, matches, current),
            }
          }
          if (meta.type === 'gotoNext') {
            if (prev.matches.length === 0) return prev
            const current = (prev.current + 1) % prev.matches.length
            return { ...prev, current, decorations: createDecorations(newState, prev.matches, current) }
          }
          if (meta.type === 'gotoPrev') {
            if (prev.matches.length === 0) return prev
            const current = (prev.current - 1 + prev.matches.length) % prev.matches.length
            return { ...prev, current, decorations: createDecorations(newState, prev.matches, current) }
          }
          if (meta.type === 'recompute') {
            const matches = findMatches(newState, prev.query, prev.options)
            const current =
              matches.length > 0 ? Math.min(prev.current === -1 ? 0 : prev.current, matches.length - 1) : -1
            return { ...prev, matches, current, decorations: createDecorations(newState, matches, current) }
          }
        }
        if (tr.docChanged && prev.query) {
          const matches = findMatches(newState, prev.query, prev.options)
          const current =
            matches.length > 0 ? Math.min(prev.current === -1 ? 0 : prev.current, matches.length - 1) : -1
          return { ...prev, matches, current, decorations: createDecorations(newState, matches, current) }
        }
        return prev
      },
    },
    props: {
      decorations(state) {
        return findReplacePluginKey.getState(state)?.decorations ?? DecorationSet.empty
      },
    },
  })
}

// ─── 公共 API ─────────────────────────────────────────────

/**
 * Tiptap 扩展包装。在编辑器配置里通过 `extensions: [..., FindReplaceExtension]` 注册。
 */
export const FindReplaceExtension = Extension.create({
  name: 'findReplace',
  addProseMirrorPlugins() {
    return [findReplacePlugin()]
  },
})

export function setFindQuery(view: EditorView, query: string, options: FindReplaceOptions): void {
  const tr = view.state.tr.setMeta(META_KEY, { type: 'setQuery', query, options } satisfies FindReplaceMeta)
  view.dispatch(tr)
}

export function gotoNext(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(META_KEY, { type: 'gotoNext' } satisfies FindReplaceMeta))
}

export function gotoPrev(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(META_KEY, { type: 'gotoPrev' } satisfies FindReplaceMeta))
}

export function replaceCurrent(view: EditorView, replacement: string): void {
  const s = findReplacePluginKey.getState(view.state)
  if (!s || s.current < 0 || s.current >= s.matches.length) return
  const m = s.matches[s.current]
  // 零宽 match 不替换 (审查 v4-#2)
  if (m.from === m.to) return
  const tr = view.state.tr.insertText(replacement, m.from, m.to)
  tr.setMeta(META_KEY, { type: 'recompute' } satisfies FindReplaceMeta)
  view.dispatch(tr)
}

export function replaceAll(view: EditorView, replacement: string): number {
  const s = findReplacePluginKey.getState(view.state)
  if (!s || s.matches.length === 0) return 0
  // 仅替换非零宽 match (审查 v4-#2)
  const valid = s.matches.filter((m) => m.from !== m.to)
  if (valid.length === 0) return 0
  // 从后往前替换,避免前面替换改变后面的偏移
  const sorted = [...valid].sort((a, b) => b.from - a.from)
  const tr = view.state.tr
  for (const m of sorted) {
    tr.insertText(replacement, m.from, m.to)
  }
  tr.setMeta(META_KEY, { type: 'recompute' } satisfies FindReplaceMeta)
  const count = sorted.length
  view.dispatch(tr)
  return count
}
