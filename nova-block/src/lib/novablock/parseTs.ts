/**
 * Bug-fix · 时间戳解析 - 修正"无时区后缀的 ISO 被当作本地时间"导致的分组漂移
 *
 * 后端 SQLAlchemy 默认 `datetime.utcnow().isoformat()` 输出无时区后缀的 ISO,
 * 例如 `2026-05-19T11:30:00.123456`。浏览器 `Date.parse()` 会把这种字符串当作
 * **本地时区** 解释,而服务器实际上记录的是 UTC,导致跨 UTC 零点附近的笔记被
 * 错误归类到"昨天"或"更早"。
 *
 * 这里:若检测到字符串没有 `Z` / `+hh:mm` 后缀,主动补 `Z` 当作 UTC 解析。
 * 同时把空格分隔的 SQL datetime 替换为标准 ISO 形式。
 */

export const parseTs = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v) {
    let s = v
    const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s)
    if (!hasTimezone && /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(s)) {
      s = s.replace(' ', 'T') + 'Z'
    }
    const t = Date.parse(s)
    return Number.isFinite(t) ? t : 0
  }
  return 0
}
