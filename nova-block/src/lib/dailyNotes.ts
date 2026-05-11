/**
 * Daily Notes 辅助函数
 */

export function formatDailyTitle(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 返回指定日期对应的 Daily Note 标题匹配模板列表。
 * 兼容 YYYY-MM-DD / YYYY/MM/DD 两种格式。
 */
export function parseDailyTitle(title: string): Date | null {
  const m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(title ?? '')
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(year, month, day)
  return isNaN(d.getTime()) ? null : d
}

export function getDailyNoteForDate<T extends { title: string }>(
  notes: T[],
  date: Date,
): T | null {
  const key = formatDailyTitle(date)
  const match = notes.find((n) => (n.title ?? '').startsWith(key))
  return match ?? null
}

/**
 * 初始化一份 Daily Note 的默认模板（Markdown 格式）。
 */
export function buildDailyNoteContent(date: Date): string {
  const weekday = date.toLocaleDateString('zh-CN', { weekday: 'long' })
  const longDate = date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  return [
    `# ${formatDailyTitle(date)}`,
    `> ${longDate} · ${weekday}`,
    ``,
    `## 🌞 今日目标`,
    `- `,
    ``,
    `## 📝 日志`,
    ``,
    ``,
    `## 🔗 关联笔记`,
    ``,
    ``,
    `## ✨ 灵感 / 随想`,
    ``,
  ].join('\n')
}
