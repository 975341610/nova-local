import type { Note, NoteProperty } from './types'

export type JournalKind = 'daily' | 'weekly' | 'monthly'

export type DailyTitleParseResult = {
  date: Date
  dateKey: string
}

type NoteLike = Pick<Note, 'title'> & {
  id?: number
  properties?: NoteProperty[]
  is_folder?: boolean
  updated_at?: string
}

const JOURNAL_KIND = 'journal.kind'
const JOURNAL_DATE = 'journal.date'
const JOURNAL_WEEK = 'journal.week'
const JOURNAL_MONTH = 'journal.month'
const JOURNAL_VERSION = 'journal.version'

const pad2 = (value: number) => String(value).padStart(2, '0')

const isValidYmd = (year: number, month: number, day: number) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

const toDateKey = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(day)}`

const normalizeDateKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return isValidYmd(year, month, day) ? toDateKey(year, month, day) : null
}

const normalizeWeekKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-W(\d{2})$/.exec(value.trim())
  if (!match) return null
  const week = Number(match[2])
  return week >= 1 && week <= 53 ? `${match[1]}-W${match[2]}` : null
}

const normalizeMonthKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const month = Number(match[2])
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : null
}

const findProperty = (note: Pick<NoteLike, 'properties'> | undefined, name: string) =>
  (note?.properties || []).find((property) => property.name === name)

export function formatDailyTitle(date: Date): string {
  return toDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function parseDailyTitle(title: string): DailyTitleParseResult | null {
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:\b|\s|$)/.exec(title ?? '')
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!isValidYmd(year, month, day)) return null
  return {
    date: new Date(year, month - 1, day),
    dateKey: toDateKey(year, month, day),
  }
}

export function buildJournalProperties(kind: 'daily', dateKey: string): Array<Pick<NoteProperty, 'name' | 'type' | 'value'>>
export function buildJournalProperties(kind: 'weekly', weekKey: string): Array<Pick<NoteProperty, 'name' | 'type' | 'value'>>
export function buildJournalProperties(kind: 'monthly', monthKey: string): Array<Pick<NoteProperty, 'name' | 'type' | 'value'>>
export function buildJournalProperties(kind: JournalKind, key: string): Array<Pick<NoteProperty, 'name' | 'type' | 'value'>> {
  const keyName = kind === 'daily' ? JOURNAL_DATE : kind === 'weekly' ? JOURNAL_WEEK : JOURNAL_MONTH
  return [
    { name: JOURNAL_KIND, type: 'text', value: kind },
    { name: keyName, type: kind === 'daily' ? 'date' : 'text', value: key },
    { name: JOURNAL_VERSION, type: 'text', value: '1' },
  ]
}

export function getJournalKind(note: NoteLike): JournalKind | null {
  const kind = findProperty(note, JOURNAL_KIND)?.value
  return kind === 'daily' || kind === 'weekly' || kind === 'monthly' ? kind : null
}

export function getDailyDate(note: NoteLike): string | null {
  if (getJournalKind(note) === 'daily') {
    const metadataDate = normalizeDateKey(findProperty(note, JOURNAL_DATE)?.value)
    if (metadataDate) return metadataDate
  }
  return parseDailyTitle(note.title || '')?.dateKey || null
}

export function isDailyNote(note: NoteLike): boolean {
  return getDailyDate(note) !== null
}

export function getWeeklyKey(note: NoteLike): string | null {
  if (getJournalKind(note) !== 'weekly') return null
  return normalizeWeekKey(findProperty(note, JOURNAL_WEEK)?.value)
}

export function getMonthlyKey(note: NoteLike): string | null {
  if (getJournalKind(note) !== 'monthly') return null
  return normalizeMonthKey(findProperty(note, JOURNAL_MONTH)?.value)
}

export function findDailyNotesByDate<T extends NoteLike>(notes: T[], dateKey: string): T[] {
  const normalized = normalizeDateKey(dateKey)
  if (!normalized) return []
  return notes.filter((note) => !note.is_folder && getDailyDate(note) === normalized)
}

export function findDailyNoteByDate<T extends NoteLike>(notes: T[], dateKey: string): T | null {
  const matches = findDailyNotesByDate(notes, dateKey)
  return matches.sort((a, b) => (Date.parse(b.updated_at || '') || 0) - (Date.parse(a.updated_at || '') || 0))[0] || null
}

export function findDuplicateDailyNotes<T extends NoteLike>(notes: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const note of notes) {
    if (note.is_folder) continue
    const dateKey = getDailyDate(note)
    if (!dateKey) continue
    groups.set(dateKey, [...(groups.get(dateKey) || []), note])
  }
  for (const [dateKey, group] of groups) {
    if (group.length < 2) groups.delete(dateKey)
  }
  return groups
}

export function buildWeeklyNoteContent(weekKey: string): string {
  const normalized = normalizeWeekKey(weekKey) || weekKey
  return [
    `# ${normalized} 周记`,
    ``,
    `## 本周推进`,
    `- `,
    ``,
    `## 本周完成`,
    `- `,
    ``,
    `## 本周卡点`,
    `- `,
    ``,
    `## 下周计划`,
    `- [ ] `,
    ``,
    `## AI 周回顾`,
    `等待生成，确认后写入。`,
    ``,
  ].join('\n')
}

export function buildMonthlyNoteContent(monthKey: string): string {
  const normalized = normalizeMonthKey(monthKey) || monthKey
  return [
    `# ${normalized} 月记`,
    ``,
    `## 本月回顾`,
    `- `,
    ``,
    `## 关键成果`,
    `- `,
    ``,
    `## 重要笔记`,
    `- `,
    ``,
    `## 下月方向`,
    `- [ ] `,
    ``,
    `## AI 月回顾`,
    `等待生成，确认后写入。`,
    ``,
  ].join('\n')
}
