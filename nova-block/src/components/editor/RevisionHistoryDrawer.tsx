/**
 * v0.22.0 · 笔记版本历史抽屉
 *
 * 功能:
 *   - 列出指定笔记的所有快照 (DESC by created_at)
 *   - 选中查看完整正文 (HTML/Markdown) 预览
 *   - 一键"恢复到此版本" (后端会自动为当前版本打一条 restore-point 兜底快照)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { History, Loader2, RotateCcw, X } from 'lucide-react'

import { api } from '../../lib/api'
import { confirmCompat } from '../../lib/confirmCompat'
import { renderReaderHtml } from '../../lib/readerContent'

type RevisionMeta = {
  id: number
  note_id: number
  created_at: string | null
  content_hash: string
  title_snapshot: string
  byte_size: number
  source: string
}

interface Props {
  isOpen: boolean
  noteId: number | null
  onClose: () => void
  /** 回滚成功时回调,用于让父组件刷新笔记内容 */
  onRestored?: (newNote: unknown) => void
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const SOURCE_LABEL: Record<string, { text: string; color: string }> = {
  auto: { text: '自动', color: 'bg-slate-500/10 text-slate-500' },
  save: { text: '手动', color: 'bg-indigo-500/10 text-indigo-500' },
  restore: { text: '回滚后', color: 'bg-emerald-500/10 text-emerald-500' },
  'restore-point': { text: '回滚兜底', color: 'bg-amber-500/10 text-amber-600' },
}

export function RevisionHistoryDrawer({ isOpen, noteId, onClose, onRestored }: Props) {
  const [revisions, setRevisions] = useState<RevisionMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const load = useCallback(async () => {
    if (!noteId) return
    setLoading(true)
    setError(null)
    // v0.22.0-a hotfix4 · 切笔记/回滚后立即清空旧 selectedId,避免预览 effect 用旧 revisionId 去请求新 noteId 导致 404
    setSelectedId(null)
    setPreviewContent('')
    setPreviewLoading(false)
    try {
      const rows = await api.listNoteRevisions(noteId)
      setRevisions(rows)
      setSelectedId(rows[0]?.id ?? null)
    } catch (err: any) {
      // v0.22.0-a hotfix8 · 不再把后端 raw JSON body 当错误文案暴露给用户
      const raw = err?.message || String(err)
      let friendly = '加载版本失败'
      if (/note\s*not\s*found|"detail":"note not found"/i.test(raw)) {
        friendly = '笔记未就绪,请稍后重试'
      } else if (/network|fetch|failed/i.test(raw)) {
        friendly = '网络异常,请重试'
      }
      setError(friendly)
      setRevisions([])
    } finally {
      setLoading(false)
    }
  }, [noteId])

  useEffect(() => {
    if (isOpen && noteId) {
      // 立即重置,防止新 noteId + 旧 selectedId 竞态
      setRevisions([])
      setSelectedId(null)
      setPreviewContent('')
      void load()
    } else {
      setRevisions([])
      setSelectedId(null)
      setPreviewContent('')
      setError(null)
    }
  }, [isOpen, noteId, load])

  useEffect(() => {
    if (!isOpen || !noteId || selectedId == null) {
      setPreviewContent('')
      return
    }
    // v0.22.0-a hotfix5 · 硬门控:selectedId 必须存在于当前列表,否则不发请求
    // 这避免了"恢复后 prune 删除旧 revision"或"竞态引用旧 id"导致的 404 雪花屏
    const existsInList = revisions.some((r) => r.id === selectedId)
    if (!existsInList) {
      setPreviewContent('')
      // v0.22.0-a hotfix7 · 列表与选中不一致时主动刷新,而不是默默空白
      if (revisions.length > 0) {
        void load()
      }
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    const requestedNoteId = noteId
    const requestedRevisionId = selectedId
    api
      .getNoteRevision(requestedNoteId, requestedRevisionId)
      .then((rev: any) => {
        if (cancelled) return
        // v0.22.0-a hotfix6 · 后端改为 200 + missing:true,此时静默刷新列表
        if (rev?.missing) {
          setPreviewContent('')
          void load()
          return
        }
        try {
          setPreviewContent(renderReaderHtml(rev.content || ''))
        } catch {
          setPreviewContent(`<pre>${(rev.content || '').slice(0, 20000)}</pre>`)
        }
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err?.message || String(err)
        if (/404|not found/i.test(msg)) {
          // 兼容旧后端:真 404 也自愈
          setPreviewContent('')
          void load()
          return
        }
        setPreviewContent(
          `<div style="color:#ef4444;padding:1rem;">加载失败: ${msg}</div>`,
        )
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, noteId, selectedId, revisions, load])

  const selectedMeta = useMemo(
    () => revisions.find((r) => r.id === selectedId) ?? null,
    [revisions, selectedId],
  )

  const onRestore = useCallback(async () => {
    if (!noteId || selectedId == null) return
    const confirmed = await confirmCompat({
      title: '恢复到此版本?',
      description:
        '当前笔记内容将被覆盖为所选版本. 放心,回滚前会先把"当前状态"存为一条兜底快照,随时可以再切回来.',
      confirmLabel: '确认恢复',
      cancelLabel: '再想想',
      danger: false,
    })
    if (!confirmed) return
    setRestoring(true)
    try {
      const updated: any = await api.restoreNoteRevision(noteId, selectedId)
      // v0.22.0-a hotfix7 · 目标版本已失效(被 prune),后端返回 {missing: true}
      if (updated?.missing) {
        setError('该版本已失效,列表已自动刷新')
        await load()
        return
      }
      // v0.22.0-a hotfix8 · 恢复成功先通知父组件,再关闭抽屉,
      // 避免"立刻重新拉列表"触发的 vault 扫描竞态 404
      onRestored?.(updated)
      setError(null)
      onClose()
    } catch (err: any) {
      const raw = err?.message || String(err)
      let friendly = '恢复失败'
      if (/note\s*not\s*found|"detail":"note not found"/i.test(raw)) {
        friendly = '笔记已变更,请关闭后重试'
      } else if (/network|fetch|failed/i.test(raw)) {
        friendly = '网络异常,请重试'
      }
      setError(friendly)
    } finally {
      setRestoring(false)
    }
  }, [noteId, selectedId, onRestored, load, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[120] flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 z-0 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className="relative z-10 ml-auto flex h-full w-[880px] max-w-[96vw] flex-col border-l border-border/40 bg-background shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          >
            <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <History size={16} />
                </div>
                <div>
                  <div className="text-sm font-bold">版本历史</div>
                  <div className="text-[11px] text-muted-foreground">
                    自动快照 · 保留首版 + 最近 30 条
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="close-history-drawer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-1 min-h-0">
              <div className="w-[280px] border-r border-border/40 overflow-y-auto">
                {loading && (
                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" /> 加载中
                  </div>
                )}
                {error && !loading && (
                  <div className="m-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-2 text-[11px] text-rose-500">
                    {error}
                  </div>
                )}
                {!loading && !error && revisions.length === 0 && (
                  <div className="p-6 text-center text-[12px] text-muted-foreground">
                    暂无历史版本 · 保存后会自动生成
                  </div>
                )}
                <ul className="divide-y divide-border/30">
                  {revisions.map((rev) => {
                    const label = SOURCE_LABEL[rev.source] ?? {
                      text: rev.source,
                      color: 'bg-slate-500/10 text-slate-500',
                    }
                    const active = rev.id === selectedId
                    return (
                      <li key={rev.id}>
                        <button
                          onClick={() => setSelectedId(rev.id)}
                          className={`flex w-full flex-col gap-1 px-3 py-2.5 text-left transition ${
                            active
                              ? 'bg-primary/5 border-l-2 border-primary'
                              : 'hover:bg-accent/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-medium">
                              {formatTime(rev.created_at)}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${label.color}`}
                            >
                              {label.text}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="truncate">
                              {rev.title_snapshot || '未命名'}
                            </span>
                            <span className="ml-2 shrink-0">{formatSize(rev.byte_size)}</span>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>

              <div className="flex flex-1 flex-col min-w-0">
                <div className="flex items-center justify-between border-b border-border/40 px-5 py-2.5">
                  <div className="min-w-0 text-[11px] text-muted-foreground truncate">
                    {selectedMeta
                      ? `${formatTime(selectedMeta.created_at)} · ${formatSize(
                          selectedMeta.byte_size,
                        )}`
                      : '选择左侧版本查看预览'}
                  </div>
                  <button
                    onClick={onRestore}
                    disabled={!selectedMeta || restoring}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                  >
                    {restoring ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RotateCcw size={12} />
                    )}
                    恢复到此版本
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  {previewLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" /> 加载预览
                    </div>
                  ) : (
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: previewContent }}
                    />
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default RevisionHistoryDrawer
