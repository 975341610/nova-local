import { describe, expect, it } from 'vitest'
import { buildDailyNoteContent, buildDailyNoteHtml } from '../lib/dailyNotes'

describe('daily note template', () => {
  it('builds the upgraded default daily note sections', () => {
    const content = buildDailyNoteContent(new Date(2026, 5, 2), {
      dueTasksToday: ['Review release notes'],
      createdNotesToday: ['Project Brief'],
      updatedNotesToday: ['Reading Update'],
    })

    expect(content).toContain('# 2026-06-02')
    expect(content).toContain('## 今日焦点')
    expect(content).toContain('## 快速记录')
    expect(content).toContain('## 今日任务')
    expect(content).toContain('- [ ] Review release notes')
    expect(content).toContain('## 今天处理的笔记')
    expect(content).toContain('- 新建：Project Brief')
    expect(content).toContain('- 更新：Reading Update')
    expect(content).toContain('## 晚间回顾')
    expect(content).toContain('## AI 今日回顾')
    expect(content).toContain('等待生成，确认后写入。')
  })

  it('renders daily note content as editor html without duplicating the note title', () => {
    const html = buildDailyNoteHtml(new Date(2026, 4, 31))

    expect(html).not.toContain('# 2026-05-31')
    expect(html).not.toContain('<h1')
    expect(html).toContain('<h2')
    expect(html).toContain('今日焦点')
    expect(html).toContain('AI 今日回顾')
  })
})
