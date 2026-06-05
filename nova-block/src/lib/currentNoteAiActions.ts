export type CurrentNoteAiActionId = 'summarize' | 'outline' | 'tasks' | 'tags'

export type CurrentNoteAiAction = {
  id: CurrentNoteAiActionId
  label: string
  action: string
  prompt: string
}

export type CurrentNoteAiSource = {
  title?: string | null
  content?: string | null
}

export const CURRENT_NOTE_AI_ACTIONS: CurrentNoteAiAction[] = [
  {
    id: 'summarize',
    label: '总结当前笔记',
    action: 'summarize',
    prompt: '请总结当前笔记，输出适合直接写回笔记的结构化摘要。',
  },
  {
    id: 'outline',
    label: '生成提纲',
    action: 'outline',
    prompt: '请基于当前笔记生成层次清晰的大纲。',
  },
  {
    id: 'tasks',
    label: '提取行动项',
    action: 'ask',
    prompt: '请从当前笔记中提取可执行行动项，按动作、背景、优先级整理。',
  },
  {
    id: 'tags',
    label: '标签建议',
    action: 'ask',
    prompt: '请根据当前笔记生成 5 到 8 个中文标签建议，并用一行标签列表输出。',
  },
]

export function getCurrentNoteAiAction(actionId: CurrentNoteAiActionId) {
  const action = CURRENT_NOTE_AI_ACTIONS.find((item) => item.id === actionId)
  if (!action) {
    throw new Error(`Unknown current note AI action: ${actionId}`)
  }
  return action
}

export function htmlToPlainText(html: string) {
  if (!html) return ''
  if (typeof document === 'undefined') {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const element = document.createElement('div')
  element.innerHTML = html
  element.querySelectorAll('script, style').forEach((node) => node.remove())
  return (element.textContent || '').replace(/\s+/g, ' ').trim()
}

export function buildCurrentNoteAiPayload(action: CurrentNoteAiAction, note: CurrentNoteAiSource) {
  const title = (note.title || '').trim() || '无标题'
  const body = htmlToPlainText(note.content || '')
  const context = [`标题：${title}`, body ? `正文：${body}` : '正文：当前笔记暂无正文内容。'].join('\n\n')

  return {
    action: action.action,
    prompt: action.prompt,
    context,
  }
}
