/**
 * Round 4 · Bug D — 纯函数化 vault-change 合并逻辑
 *
 * 之前的实现把"过滤 unlink path"放在 merge changedNotes 之前,
 * 导致 atomic-rename 序列(unlink 旧 path + change 新 path)中,
 * 持有旧 file_path 的那条笔记会先被从 store 中删掉 → 视觉上"瞬现即消失"。
 *
 * 这里把合并算法独立出来:
 *  1. 先 merge changedNotes (id-or-path 匹配,覆盖 file_path 等字段)
 *  2. 收集 changedNotes 的 id 集合
 *  3. 再删除 deletedPaths 中,id 不在 changedNotes 的笔记
 * 这样 rename 场景永远不会丢失被移动的笔记。
 */

export interface VaultChangeNote {
  id: number
  file_path?: string | null
  [key: string]: unknown
}

export type Merger<T extends VaultChangeNote> = (previous: T | undefined, incoming: VaultChangeNote) => T

export interface ApplyVaultChangeArgs<T extends VaultChangeNote> {
  previousNotes: T[]
  changedNotes: VaultChangeNote[]
  deletedPaths: Set<string>
  /** 用于把外部 file_path 标准化(大小写、分隔符)的函数。建议同 normalizeVaultChangePath。 */
  normalizePath: (filename: string | null | undefined) => string
  /** 合并器,收到旧条目和新条目,返回合并后的条目。会尊重 hasPendingNoteSave 等 UI 状态。 */
  merger: Merger<T>
}

export function applyVaultChange<T extends VaultChangeNote>({
  previousNotes,
  changedNotes,
  deletedPaths,
  normalizePath,
  merger,
}: ApplyVaultChangeArgs<T>): T[] {
  const next: T[] = [...previousNotes]
  const changedIds = new Set<number>()
  for (const incoming of changedNotes) {
    if (typeof incoming.id === 'number') changedIds.add(incoming.id)
    const existingIndex = next.findIndex((item) =>
      item.id === incoming.id ||
      normalizePath(item.file_path) === normalizePath(incoming.file_path),
    )
    const previous = existingIndex >= 0 ? next[existingIndex] : undefined
    const merged = merger(previous, incoming)
    if (existingIndex >= 0) {
      next[existingIndex] = merged
    } else {
      next.push(merged)
    }
  }
  if (deletedPaths.size > 0) {
    for (let i = next.length - 1; i >= 0; i--) {
      const note = next[i]
      const path = normalizePath(note.file_path)
      if (deletedPaths.has(path) && !changedIds.has(note.id)) {
        next.splice(i, 1)
      }
    }
  }
  return next
}
