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
import { Plugin, PluginKey, EditorState, TextSelection } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { Extension } from '@tiptap/core'

export type FindReplaceOptions = {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export type FindReplaceMatch = { from: number; to: number }

/**
 * 已经替换过的范围 — 用于排除"刚替换出来的文本"被再次命中(bug 1b)。
 * 每次替换发生时把新文本的范围 [from, from+replacement.length] 记录进来,
 * findMatches 会跳过与之相交的命中。skipRanges 在用户重新调用 setFindQuery
 * 或 docChanged(非由本插件发起的)时被清空,以保持新查询的正确性。
 */
export type SkipRange = { from: number; to: number }

export type FindReplaceState = {
  query: string
  options: FindReplaceOptions
  matches: FindReplaceMatch[]
  current: number
  decorations: DecorationSet
  skipRanges: SkipRange[]
}

const META_KEY = 'findReplace$meta'

type FindReplaceMeta =
  | { type: 'setQuery'; query: string; options: FindReplaceOptions }
  | { type: 'gotoNext' }
  | { type: 'gotoPrev' }
  | { type: 'recompute'; addSkipRanges?: SkipRange[] }

export const findReplacePluginKey = new PluginKey<FindReplaceState>('findReplace')

const INITIAL_STATE: FindReplaceState = {
  query: '',
  options: { caseSensitive: false, wholeWord: false, regex: false },
  matches: [],
  current: -1,
  decorations: DecorationSet.empty,
  skipRanges: [],
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

export function findMatches(
  state: EditorState,
  query: string,
  options: FindReplaceOptions,
  skipRanges: SkipRange[] = [],
): FindReplaceMatch[] {
  const re = buildRegex(query, options)
  if (!re) return []
  const results: FindReplaceMatch[] = []
  const intersectsSkip = (from: number, to: number): boolean => {
    for (const r of skipRanges) {
      // 区间相交判定: max(start) < min(end)
      if (Math.max(r.from, from) < Math.min(r.to, to)) return true
      // 零宽 match 落在 skip 区间内部也跳过
      if (from === to && r.from <= from && from <= r.to) return true
    }
    return false
  }
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
        if (!intersectsSkip(from, from)) {
          results.push({ from, to: from })
        }
        re.lastIndex += 1
        continue
      }
      const startIdx = m.index
      const endIdx = m.index + m[0].length - 1
      const from = idx2pos[startIdx]
      const to = (idx2pos[endIdx] ?? from) + 1
      if (!intersectsSkip(from, to)) {
        results.push({ from, to })
      }
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
        // 通过事务映射 skipRanges,使其跟随文档位置漂移
        let mappedSkip: SkipRange[] = prev.skipRanges
        if (tr.docChanged && prev.skipRanges.length > 0) {
          mappedSkip = prev.skipRanges
            .map((r) => {
              const from = tr.mapping.map(r.from, 1)
              const to = tr.mapping.map(r.to, -1)
              return from <= to ? { from, to } : null
            })
            .filter((r): r is SkipRange => r !== null)
        }
        if (meta) {
          if (meta.type === 'setQuery') {
            // 用户重新输入查询 → 清空 skipRanges
            const matches = findMatches(newState, meta.query, meta.options, [])
            const current = matches.length > 0 ? 0 : -1
            return {
              query: meta.query,
              options: meta.options,
              matches,
              current,
              decorations: createDecorations(newState, matches, current),
              skipRanges: [],
            }
          }
          if (meta.type === 'gotoNext') {
            if (prev.matches.length === 0) return { ...prev, skipRanges: mappedSkip }
            const current = (prev.current + 1) % prev.matches.length
            return {
              ...prev,
              current,
              decorations: createDecorations(newState, prev.matches, current),
              skipRanges: mappedSkip,
            }
          }
          if (meta.type === 'gotoPrev') {
            if (prev.matches.length === 0) return { ...prev, skipRanges: mappedSkip }
            const current = (prev.current - 1 + prev.matches.length) % prev.matches.length
            return {
              ...prev,
              current,
              decorations: createDecorations(newState, prev.matches, current),
              skipRanges: mappedSkip,
            }
          }
          if (meta.type === 'recompute') {
            const nextSkip = meta.addSkipRanges
              ? [...mappedSkip, ...meta.addSkipRanges]
              : mappedSkip
            const matches = findMatches(newState, prev.query, prev.options, nextSkip)
            const current =
              matches.length > 0 ? Math.min(prev.current === -1 ? 0 : prev.current, matches.length - 1) : -1
            return {
              ...prev,
              matches,
              current,
              decorations: createDecorations(newState, matches, current),
              skipRanges: nextSkip,
            }
          }
        }
        if (tr.docChanged && prev.query) {
          const matches = findMatches(newState, prev.query, prev.options, mappedSkip)
          const current =
            matches.length > 0 ? Math.min(prev.current === -1 ? 0 : prev.current, matches.length - 1) : -1
          return {
            ...prev,
            matches,
            current,
            decorations: createDecorations(newState, matches, current),
            skipRanges: mappedSkip,
          }
        }
        return mappedSkip === prev.skipRanges ? prev : { ...prev, skipRanges: mappedSkip }
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
  const tr = view.state.tr.setMeta(META_KEY, { type: 'gotoNext' } satisfies FindReplaceMeta)
  view.dispatch(tr)
  // Bug-fix v2: dispatch 之后,view.state 已更新到 next current。
  // 把 selection + scrollIntoView 合并到一个 tr,基于 *最新* 的 view.state.doc 计算。
  const s = findReplacePluginKey.getState(view.state)
  if (!s || s.matches.length === 0) return
  const m = s.matches[s.current]
  if (!m) return
  try {
    const docSize = view.state.doc.content.size
    if (m.from < 0 || m.to > docSize) return
    const sel = TextSelection.create(view.state.doc, m.from, m.to)
    view.dispatch(view.state.tr.setSelection(sel).scrollIntoView())
  } catch {
    /* selection 越界等情况静默忽略 */
  }
}

export function gotoPrev(view: EditorView): void {
  const tr = view.state.tr.setMeta(META_KEY, { type: 'gotoPrev' } satisfies FindReplaceMeta)
  view.dispatch(tr)
  const s = findReplacePluginKey.getState(view.state)
  if (!s || s.matches.length === 0) return
  const m = s.matches[s.current]
  if (!m) return
  try {
    const docSize = view.state.doc.content.size
    if (m.from < 0 || m.to > docSize) return
    const sel = TextSelection.create(view.state.doc, m.from, m.to)
    view.dispatch(view.state.tr.setSelection(sel).scrollIntoView())
  } catch {
    /* selection 越界等情况静默忽略 */
  }
}

export function replaceCurrent(view: EditorView, replacement: string): void {
  const s = findReplacePluginKey.getState(view.state)
  if (!s || s.current < 0 || s.current >= s.matches.length) return
  const m = s.matches[s.current]
  // 零宽 match 不替换 (审查 v4-#2)
  if (m.from === m.to) return
  const tr = view.state.tr.insertText(replacement, m.from, m.to)
  // 替换后,新文本范围 = [m.from, m.from + replacement.length] (在 tr 之后的坐标系中)
  // 由于 plugin apply 在 docChanged 时会先把 prev.skipRanges 用 tr.mapping 映射,
  // 而 addSkipRanges 是在映射之后才并入,所以这里直接给最终坐标即可。
  const newRange: SkipRange = { from: m.from, to: m.from + replacement.length }
  tr.setMeta(META_KEY, {
    type: 'recompute',
    addSkipRanges: [newRange],
  } satisfies FindReplaceMeta)
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
  // 计算每个原命中在新 doc 中的最终范围 — 通过 tr.mapping 映射 m.from 即可。
  // 注意 m.from 用 bias=-1 映射到插入起点; 长度则是 replacement.length。
  const newRanges: SkipRange[] = sorted
    .map((m) => {
      const newFrom = tr.mapping.map(m.from, -1)
      return { from: newFrom, to: newFrom + replacement.length }
    })
  tr.setMeta(META_KEY, {
    type: 'recompute',
    addSkipRanges: newRanges,
  } satisfies FindReplaceMeta)
  const count = sorted.length
  view.dispatch(tr)
  return count
}
