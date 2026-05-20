/**
 * Round 3 · Bug C — 批量移动必须串行,且把后端响应 merge 回 store。
 *
 * 起因: handleNodesBulkMove 之前用 Promise.all 并发 update,
 *       chokidar vault-watcher 在并发期间可能触发 reload,
 *       读取仅部分提交的状态 → 已移动节点"瞬现即消失"。
 *
 * 解法: 串行 await 每个 api.updateNote(id, { parent_id, sort_key }),
 *       逐条收集 server 返回的最新 note,失败的条目跳过但不阻断后续。
 *
 * 这个函数被设计成纯依赖注入式,不访问 store / window,便于单元测试。
 */

export interface BulkMoveApi {
  updateNote: (
    id: number,
    patch: { parent_id: number | null; sort_key: string },
  ) => Promise<unknown>;
}

/**
 * 串行批量移动节点。
 *
 * @param api        提供 updateNote 的对象(通常是 lib/api.ts)
 * @param ids        要移动的 note id 列表(顺序 = 调用顺序)
 * @param parentId   目标父节点 id,根级用 null
 * @param sortKeys   与 ids 等长的 sort_key 列表(本地预计算的乐观值)
 * @returns          服务端返回的 note 对象数组(失败的条目不在结果里)
 */
export async function bulkMoveSerially(
  api: BulkMoveApi,
  ids: number[],
  parentId: number | null,
  sortKeys: string[],
): Promise<any[]> {
  const merged: any[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const sortKey = sortKeys[i];
    try {
      const updated = await api.updateNote(id, {
        parent_id: parentId,
        sort_key: sortKey,
      });
      if (updated && typeof updated === 'object') {
        merged.push(updated);
      }
    } catch {
      // 单条失败不阻断整批,继续推进余下条目
      continue;
    }
  }
  return merged;
}
