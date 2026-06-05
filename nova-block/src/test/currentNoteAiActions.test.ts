import { describe, expect, it } from 'vitest'
import {
  CURRENT_NOTE_AI_ACTIONS,
  buildCurrentNoteAiPayload,
  getCurrentNoteAiAction,
  htmlToPlainText,
} from '../lib/currentNoteAiActions'

describe('current note AI actions', () => {
  it('exposes note actions for summary, action items, and tag suggestions', () => {
    const ids = CURRENT_NOTE_AI_ACTIONS.map((action) => action.id)
    const labels = CURRENT_NOTE_AI_ACTIONS.map((action) => action.label)

    expect(ids).toContain('summarize')
    expect(ids).toContain('tasks')
    expect(ids).toContain('tags')
    expect(labels).toContain('总结当前笔记')
    expect(labels).toContain('标签建议')
  })

  it('builds streamInlineAI payloads from clean note text and title context', () => {
    const action = getCurrentNoteAiAction('tags')
    const payload = buildCurrentNoteAiPayload(action, {
      title: '需求',
      content: '<h1>需求</h1><p>产品路线 <strong>知识库</strong></p><script>bad()</script>',
    })

    expect(payload.action).toBe('ask')
    expect(payload.prompt).toContain('标签')
    expect(payload.context).toContain('标题：需求')
    expect(payload.context).toContain('产品路线 知识库')
    expect(payload.context).not.toContain('<p>')
    expect(payload.context).not.toContain('bad()')
  })

  it('normalizes HTML content into plain text for AI context', () => {
    expect(htmlToPlainText('<h2>标题</h2><ul><li><p>第一项</p></li></ul>')).toBe('标题 第一项')
  })
})
