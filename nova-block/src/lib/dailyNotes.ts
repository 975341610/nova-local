/**
 * Daily Notes 兼容入口。
 *
 * 新的识别逻辑集中在 journal.ts；这里保留旧导出，避免一次性改动所有调用方。
 */
import {
  findDailyNoteByDate,
  formatDailyTitle,
  parseDailyTitle as parseDailyTitleResult,
} from './journal'

export { formatDailyTitle }

/**
 * 返回指定日期对应的 Daily Note 标题匹配模板列表。
 * 兼容 YYYY-MM-DD / YYYY/MM/DD 两种格式。
 */
export function parseDailyTitle(title: string): Date | null {
  return parseDailyTitleResult(title)?.date || null
}

export function getDailyNoteForDate<T extends { title: string; properties?: any[]; is_folder?: boolean; updated_at?: string }>(
  notes: T[],
  date: Date,
): T | null {
  return findDailyNoteByDate(notes, formatDailyTitle(date))
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
