import { aiMarkdownToHtml } from './aiMarkdown'
import { findDailyNoteByDate, formatDailyTitle, parseDailyTitle as parseDailyTitleResult } from './journal'

export { formatDailyTitle }

export interface DailyTemplateContext {
  dueTasksToday?: string[]
  unfinishedTasksYesterday?: string[]
  createdNotesToday?: string[]
  updatedNotesToday?: string[]
}

export function parseDailyTitle(title: string): Date | null {
  return parseDailyTitleResult(title)?.date || null
}

export function getDailyNoteForDate<
  T extends { title: string; properties?: any[]; is_folder?: boolean; updated_at?: string },
>(notes: T[], date: Date): T | null {
  return findDailyNoteByDate(notes, formatDailyTitle(date))
}

const listLines = (items: string[] | undefined, prefix = '- ') => {
  if (!items?.length) return ['- 暂无']
  return items.map((item) => `${prefix}${item}`)
}

export function buildDailyNoteContent(date: Date, context: DailyTemplateContext = {}): string {
  const weekday = date.toLocaleDateString('zh-CN', { weekday: 'long' })
  const longDate = date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const createdNotes = listLines(context.createdNotesToday, '- 新建：')
  const updatedNotes = listLines(context.updatedNotesToday, '- 更新：')

  return [
    `# ${formatDailyTitle(date)} ${weekday}`,
    `> ${longDate} · ${weekday}`,
    ``,
    `## 今日焦点`,
    `- [ ] `,
    ``,
    `## 快速记录`,
    `- `,
    ``,
    `## 今日任务`,
    ...listLines(context.dueTasksToday, '- [ ] '),
    ``,
    `## 昨日未完成`,
    ...listLines(context.unfinishedTasksYesterday, '- [ ] '),
    ``,
    `## 今天处理的笔记`,
    ...createdNotes,
    ...updatedNotes,
    ``,
    `## 灵感与材料`,
    `- `,
    ``,
    `## 晚间回顾`,
    `### 今天推进了什么？`,
    ``,
    `### 有什么卡住？`,
    ``,
    `### 明天第一件事？`,
    ``,
    `## AI 今日回顾`,
    `等待生成，确认后写入。`,
    ``,
  ].join('\n')
}

export function buildDailyNoteHtml(date: Date, context: DailyTemplateContext = {}): string {
  const markdownWithoutTitle = buildDailyNoteContent(date, context)
    .replace(/^# .+?(?:\n+|$)/, '')
    .trim()
  return aiMarkdownToHtml(markdownWithoutTitle)
}
