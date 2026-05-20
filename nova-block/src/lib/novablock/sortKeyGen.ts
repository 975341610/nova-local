/**
 * Bug-fix · 字典序 sortKey 生成器
 *
 * 之前 `${prev ?? 'm'}m` 会与已有的 'm'/'mm' 冲突 → buildTree 排序时位置不可预测。
 * 这里实现一个最小但严格"严格大于 base"的策略:
 *
 *  - 字符表使用 0-9 + a-z 共 36 个字符,'m' 是中点。
 *  - generateAfter(base): 返回一个严格 > base 的字符串。
 *    若 base 末位 < 'z',末位 +1;若 base 末位 == 'z',则在末尾追加 'm'。
 *    保证结果在所有以 base 为前缀且字典序更大的兄弟中处于"靠前"位置。
 *  - generateSequenceAfter(base, count): 顺序生成 count 个严格递增的 key。
 *
 * 注:不是完整的 fractional indexing(没有 between),但足够解决"在末尾追加 N 个 key"
 * 这一具体场景的乱序问题,且无外部依赖。
 */

const ALPHABET_START = '0'.charCodeAt(0)
const DIGIT_END = '9'.charCodeAt(0)
const LOWER_START = 'a'.charCodeAt(0)
const LOWER_END = 'z'.charCodeAt(0)

function nextChar(c: string): string | null {
  const code = c.charCodeAt(0)
  if (code >= ALPHABET_START && code < DIGIT_END) return String.fromCharCode(code + 1)
  if (code === DIGIT_END) return 'a'
  if (code >= LOWER_START && code < LOWER_END) return String.fromCharCode(code + 1)
  if (code === LOWER_END) return null
  // 不在合法表内 → 退化为追加 'm'
  return null
}

/**
 * 返回严格 > base 的字符串。空 base 返回 'm'。
 */
export function generateAfter(base: string | null | undefined): string {
  if (!base) return 'm'
  // 找到末位的下一个字符
  const last = base[base.length - 1]
  const nxt = nextChar(last)
  if (nxt !== null) {
    return base.slice(0, -1) + nxt
  }
  // 末位是 'z' 或非法 → 追加 'm'
  return base + 'm'
}

/**
 * 在 base 之后顺序生成 count 个严格递增的 key。
 * 第一个 key > base, 第二个 key > 第一个 key, ……
 */
export function generateSequenceAfter(base: string | null | undefined, count: number): string[] {
  const out: string[] = []
  let cur: string = base ?? ''
  for (let i = 0; i < count; i++) {
    cur = generateAfter(cur)
    out.push(cur)
  }
  return out
}
