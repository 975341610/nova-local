/**
 * v0.21.0 · C2 Rich Summary Cards
 *
 * 为当前笔记的所有出链(links)生成"富媒体摘要卡片":
 *   - 标题 + 图标
 *   - 自动截取正文前 180 字作为摘要(优先用 note.summary)
 *   - 抽取正文中第一张图作为封面(img src 或 [image] markdown)
 *   - 标签 / 更新时间
 *   - 点击打开
 *
 * 与 GraphView / ConceptOrbit 互补:那两个强调拓扑,这里强调"读得下去"。
 */
import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, BookOpen, Image as ImageIcon } from 'lucide-react'
import type { Note } from '../../lib/types'

interface RichSummaryCardsPanelProps {
  notes: Note[]
  currentNoteId: number | null
  isOpen: boolean
  onClose: () => void
  onSelectNote: (id: number) => void
}

interface SummaryCard {
  id: number
  title: string
  icon: string
  updatedAt: string | undefined
  tags: string[]
  excerpt: string
  cover: string | null
}

function extractCover(content?: string | null): string | null {
  if (!content) return null
  // HTML <img>
  const imgTag = content.match(/<img\s[^>]*src=["']([^"']+)["']/i)
  if (imgTag?.[1]) return imgTag[1]
  // Markdown ![alt](url)
  const mdImg = content.match(/!\[[^\]]*\]\(([^)\s]+)/)
  if (mdImg?.[1]) return mdImg[1]
  return null
}

function extractExcerpt(content?: string | null, max = 180): string {
  if (!content) return ''
  // 剥离 HTML 标签
  const stripped = content
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped.length <= max) return stripped
  return stripped.slice(0, max) + '…'
}

export function RichSummaryCardsPanel({
  notes,
  currentNoteId,
  isOpen,
  onClose,
  onSelectNote,
}: RichSummaryCardsPanelProps) {
  const current = useMemo(
    () => (currentNoteId != null ? notes.find((n) => n.id === currentNoteId) : null),
    [notes, currentNoteId],
  )

  const cards = useMemo<SummaryCard[]>(() => {
    if (!current) return []
    const linkedIds = current.links || []
    const byId = new Map(notes.map((n) => [n.id, n]))
    return linkedIds
      .map((id) => byId.get(id))
      .filter((n): n is Note => !!n && !n.is_folder)
      .map((n) => ({
        id: n.id,
        title: n.title || 'Untitled',
        icon: n.icon || '📄',
        updatedAt: n.updated_at,
        tags: n.tags || [],
        excerpt: n.summary?.trim() || extractExcerpt(n.content),
        cover: extractCover(n.content),
      }))
  }, [current, notes])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="rich-summary-panel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[95]"
          style={{
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="nv-glass-sm"
            style={{
              width: 'min(1080px, 100%)',
              maxHeight: '86vh',
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: 'var(--nv-shadow-3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid var(--nv-color-border)',
                background: 'var(--nv-color-bg-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BookOpen size={15} color="var(--nv-color-accent)" />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--nv-color-fg)' }}>
                  出链摘要 · Rich Summary Cards
                </div>
                <div style={{ fontSize: 12, color: 'var(--nv-color-fg-subtle)' }}>
                  {current ? `「${current.title || 'Untitled'}」共 ${cards.length} 条出链` : '未选择笔记'}
                </div>
              </div>
              <button
                onClick={onClose}
                className="nv-panel-pill"
                style={{ padding: '4px 8px' }}
                title="关闭"
              >
                <X size={14} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 20,
                background: 'var(--nv-color-bg)',
              }}
            >
              {!current && (
                <div
                  style={{
                    padding: 60,
                    textAlign: 'center',
                    color: 'var(--nv-color-fg-subtle)',
                    fontSize: 13,
                  }}
                >
                  请先在侧边栏选中一条笔记。
                </div>
              )}
              {current && cards.length === 0 && (
                <div
                  style={{
                    padding: 60,
                    textAlign: 'center',
                    color: 'var(--nv-color-fg-subtle)',
                    fontSize: 13,
                    lineHeight: 1.7,
                  }}
                >
                  这条笔记暂无出链。
                  <br />
                  在正文用 <code style={{ fontFamily: 'var(--nv-font-mono)' }}>[[笔记名]]</code> 链接其他笔记后,这里就会展开它们的摘要卡。
                </div>
              )}
              {cards.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 14,
                  }}
                >
                  {cards.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onSelectNote(c.id)
                        onClose()
                      }}
                      style={{
                        textAlign: 'left',
                        padding: 0,
                        border: '1px solid var(--nv-color-border)',
                        background: 'var(--nv-color-bg-subtle)',
                        borderRadius: 'var(--nv-radius-md)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'transform 180ms cubic-bezier(0.2,0,0,1), box-shadow 180ms',
                      }}
                      className="nv-summary-card"
                    >
                      {c.cover ? (
                        <div
                          style={{
                            width: '100%',
                            aspectRatio: '16 / 9',
                            background: `center/cover no-repeat url(${JSON.stringify(c.cover)})`,
                            backgroundColor: 'var(--nv-color-bg)',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            aspectRatio: '16 / 9',
                            background:
                              'linear-gradient(135deg, var(--nv-color-accent-muted) 0%, var(--nv-color-bg-subtle) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--nv-color-fg-subtle)',
                            gap: 6,
                            fontSize: 12,
                          }}
                        >
                          <ImageIcon size={14} />
                          无封面
                        </div>
                      )}
                      <div
                        style={{
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          flex: 1,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 14 }}>{c.icon}</span>
                          <div
                            style={{
                              fontSize: 13.5,
                              fontWeight: 600,
                              color: 'var(--nv-color-fg)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}
                          >
                            {c.title}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--nv-color-fg-muted)',
                            lineHeight: 1.5,
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {c.excerpt || (
                            <span style={{ color: 'var(--nv-color-fg-subtle)', fontStyle: 'italic' }}>
                              (空笔记)
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            marginTop: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 6,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              gap: 4,
                              flexWrap: 'wrap',
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {c.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                style={{
                                  fontSize: 10,
                                  padding: '1px 6px',
                                  background: 'var(--nv-color-accent-muted)',
                                  color: 'var(--nv-color-accent-fg)',
                                  borderRadius: 'var(--nv-radius-full)',
                                }}
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                          {c.updatedAt && (
                            <div
                              style={{
                                fontSize: 10,
                                color: 'var(--nv-color-fg-subtle)',
                                fontFamily: 'var(--nv-font-mono)',
                                flexShrink: 0,
                              }}
                            >
                              {new Date(c.updatedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default RichSummaryCardsPanel
