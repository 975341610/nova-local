import { describe, expect, it } from 'vitest'
import { buildDailyNoteContent } from '../lib/dailyNotes'

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
})
