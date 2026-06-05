import { describe, expect, it } from 'vitest'

import {
  buildEditorSavePayload,
  isSavedPayloadCurrentCleanDraft,
  resolveQueuedSaveDrainIfIdle,
  waitForQueuedSaveDrain,
  upsertQueuedSavePayload,
} from '../lib/editorDraftSync'

describe('editorDraftSync save helpers', () => {
  it('builds a save payload from the current draft, incoming updates, and latest editor html', () => {
    const draft = {
      id: 12,
      title: '旧标题',
      content: '<p>old</p>',
      tags: ['draft'],
    }

    expect(buildEditorSavePayload(draft, '<p>latest</p>', { title: '新标题' })).toEqual({
      id: 12,
      title: '新标题',
      content: '<p>latest</p>',
      tags: ['draft'],
    })
  })

  it('keeps only the newest queued save payload for the same note', () => {
    const queue = [
      { id: 1, content: '<p>A</p>' },
      { id: 2, content: '<p>B</p>' },
    ]

    upsertQueuedSavePayload(queue, { id: 1, content: '<p>A2</p>' })

    expect(queue).toEqual([
      { id: 1, content: '<p>A2</p>' },
      { id: 2, content: '<p>B</p>' },
    ])
  })

  it('appends queued save payloads when the note is different', () => {
    const queue = [{ id: 1, content: '<p>A</p>' }]

    upsertQueuedSavePayload(queue, { id: 2, content: '<p>B</p>' })

    expect(queue).toEqual([
      { id: 1, content: '<p>A</p>' },
      { id: 2, content: '<p>B</p>' },
    ])
  })

  it('marks a saved draft clean only when it still matches the current note and editor html', () => {
    const current = { id: 1, content: '<p>newer</p>' }
    const saved = { id: 1, content: '<p>saved</p>' }

    expect(isSavedPayloadCurrentCleanDraft(current, saved, '<p>saved</p>', '<p>saved</p>')).toBe(true)
    expect(isSavedPayloadCurrentCleanDraft(current, saved, '<p>newer</p>', '<p>saved</p>')).toBe(false)
    expect(isSavedPayloadCurrentCleanDraft({ id: 2, content: '<p>saved</p>' }, saved, '<p>saved</p>', '<p>saved</p>')).toBe(false)
  })

  it('resolves queued save drain waiters only when no save is running and the queue is empty', async () => {
    const resolvers: Array<() => void> = []
    const waiting = waitForQueuedSaveDrain(true, [{ id: 1, content: '<p>A</p>' }], resolvers)

    let resolved = false
    waiting.then(() => { resolved = true })
    await Promise.resolve()

    expect(resolved).toBe(false)
    expect(resolvers).toHaveLength(1)
    expect(resolveQueuedSaveDrainIfIdle(true, [], resolvers)).toBe(false)
    expect(resolvers).toHaveLength(1)

    expect(resolveQueuedSaveDrainIfIdle(false, [], resolvers)).toBe(true)
    await waiting
    expect(resolved).toBe(true)
    expect(resolvers).toHaveLength(0)
  })

  it('does not allocate a waiter when the save queue is already drained', async () => {
    const resolvers: Array<() => void> = []
    await waitForQueuedSaveDrain(false, [], resolvers)
    expect(resolvers).toHaveLength(0)
  })
})
