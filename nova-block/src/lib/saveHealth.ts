export type SavePhase = 'idle' | 'queued' | 'saving'

export type RevisionSnapshotStatus = {
  status: 'queued' | 'saving' | 'saved' | 'failed'
  detail?: string
  queued?: number
  updatedAt?: string
} | null

export type SaveHealthSeverity = 'ok' | 'pending' | 'busy' | 'warning' | 'error'

export type SaveHealthInput = {
  savePhase: SavePhase
  isDirty: boolean
  lastSavedAt: string | null
  revisionSnapshotStatus?: RevisionSnapshotStatus
}

export type SaveHealthStatus = {
  severity: SaveHealthSeverity
  saveLabel: string
  saveTitle: string
  revisionLabel: string | null
  revisionTitle?: string
  summary: string
  recommendation: string
}

function deriveSaveLabel(savePhase: SavePhase, isDirty: boolean): string {
  if (savePhase === 'saving') return '保存中'
  if (savePhase === 'queued') return '排队中'
  if (isDirty) return '未保存'
  return '已同步'
}

function deriveRevisionLabel(status: RevisionSnapshotStatus): string | null {
  if (!status) return null
  if (status.status === 'failed') return '快照失败'
  if (status.status === 'saving') return '快照写入中'
  if (status.status === 'queued') {
    return `快照排队${status.queued ? ` ${status.queued}` : ''}`
  }
  return null
}

export function deriveSaveHealthStatus(input: SaveHealthInput): SaveHealthStatus {
  const { savePhase, isDirty, lastSavedAt, revisionSnapshotStatus = null } = input
  const saveLabel = deriveSaveLabel(savePhase, isDirty)
  const revisionLabel = deriveRevisionLabel(revisionSnapshotStatus)

  if (revisionSnapshotStatus?.status === 'failed') {
    const detail = revisionSnapshotStatus.detail || '等待后台重试'
    return {
      severity: 'error',
      saveLabel,
      saveTitle: `正文状态：${saveLabel}`,
      revisionLabel,
      revisionTitle: `版本快照失败：${detail}`,
      summary: `正文${saveLabel}，但版本快照失败。`,
      recommendation: '建议打开版本历史查看失败原因，或重新编辑一次触发快照重试。',
    }
  }

  if (savePhase === 'saving') {
    return {
      severity: 'busy',
      saveLabel,
      saveTitle: '正文正在写入本地文件',
      revisionLabel,
      revisionTitle: revisionSnapshotStatus?.status === 'saving' ? '版本快照正在后台写入' : undefined,
      summary: '正在保存当前笔记内容。',
      recommendation: '请稍等片刻，完成后再关闭软件或切换大量笔记。',
    }
  }

  if (savePhase === 'queued' || isDirty) {
    return {
      severity: 'pending',
      saveLabel,
      saveTitle: '正文修改已进入保存队列',
      revisionLabel,
      revisionTitle: revisionSnapshotStatus?.status === 'queued'
        ? '版本快照已进入后台队列，正文保存不受影响'
        : undefined,
      summary: '还有修改等待写入。',
      recommendation: '切换笔记或关闭软件前，最好等状态变为“已同步”。',
    }
  }

  if (revisionSnapshotStatus?.status === 'queued' || revisionSnapshotStatus?.status === 'saving') {
    return {
      severity: 'warning',
      saveLabel,
      saveTitle: '正文已保存',
      revisionLabel,
      revisionTitle: revisionSnapshotStatus.status === 'saving'
        ? '版本快照正在后台写入'
        : '版本快照已进入后台队列，正文保存不受影响',
      summary: '正文已保存，版本快照仍在后台处理。',
      recommendation: '可以继续编辑；如果队列长时间不消失，请打开版本历史检查。',
    }
  }

  return {
    severity: 'ok',
    saveLabel,
    saveTitle: lastSavedAt ? `已保存于 ${lastSavedAt}` : '正文已保存',
    revisionLabel: null,
    summary: lastSavedAt ? `已保存于 ${lastSavedAt}` : '已保存到本地。',
    recommendation: '当前没有待处理的保存任务。',
  }
}
