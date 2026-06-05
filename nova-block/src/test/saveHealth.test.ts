import { describe, expect, it } from 'vitest'

import { deriveSaveHealthStatus } from '../lib/saveHealth'

describe('save health status', () => {
  it('reports synced when editor and revision snapshot are both idle', () => {
    const status = deriveSaveHealthStatus({
      savePhase: 'idle',
      isDirty: false,
      lastSavedAt: '12:30',
      revisionSnapshotStatus: null,
    })

    expect(status.severity).toBe('ok')
    expect(status.saveLabel).toBe('已同步')
    expect(status.revisionLabel).toBeNull()
    expect(status.summary).toContain('已保存')
  })

  it('keeps unsaved editor changes more important than a queued snapshot', () => {
    const status = deriveSaveHealthStatus({
      savePhase: 'queued',
      isDirty: true,
      lastSavedAt: null,
      revisionSnapshotStatus: { status: 'queued', queued: 3 },
    })

    expect(status.severity).toBe('pending')
    expect(status.saveLabel).toBe('排队中')
    expect(status.revisionLabel).toBe('快照排队 3')
    expect(status.recommendation).toContain('切换笔记或关闭软件前')
  })

  it('surfaces revision snapshot failures with a concise recovery hint', () => {
    const status = deriveSaveHealthStatus({
      savePhase: 'idle',
      isDirty: false,
      lastSavedAt: '12:30',
      revisionSnapshotStatus: {
        status: 'failed',
        detail: 'FOREIGN KEY constraint failed',
      },
    })

    expect(status.severity).toBe('error')
    expect(status.revisionLabel).toBe('快照失败')
    expect(status.revisionTitle).toContain('FOREIGN KEY constraint failed')
    expect(status.recommendation).toContain('打开版本历史')
  })
})
