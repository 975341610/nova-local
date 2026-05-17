/**
 * v0.20.0 · A5 Concept Orbit
 *
 * 以当前笔记为中心,一跳邻居在第一圈、二跳邻居在第二圈,按度数排布。
 * 与 GraphView 的"力导向混乱星云"对比,ConceptOrbit 提供的是
 * 结构化、可读性更高的概念环图:
 *   - 中心恒星:当前笔记(标题居中显示)
 *   - 第一圈(r1):直接双向链接(link / backlink)
 *   - 第二圈(r2):二跳邻居(出现次数越多越靠近 12 点方向)
 *   - 悬停高亮整条轨道线
 *   - 点击邻居 -> 切换为新中心,形成"漫游"
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowLeft, Share2 } from 'lucide-react'
import type { Note } from '../../lib/types'

interface ConceptOrbitProps {
  notes: Note[]
  currentNoteId: number | null
  isOpen: boolean
  onClose: () => void
  onSelectNote: (id: number) => void
  /** v0.21.5 · 切换到图谱视图 */
  onSwitchToGraph?: () => void
}

interface OrbitNode {
  id: number
  title: string
  ring: 1 | 2
  angle: number
  x: number
  y: number
  weight: number
}

export function ConceptOrbit({
  notes,
  currentNoteId,
  isOpen,
  onClose,
  onSelectNote,
  onSwitchToGraph,
}: ConceptOrbitProps) {
  // 允许在面板内"漫游":点击邻居切换中心,但不影响 App 全局 currentNoteId
  const [localCenterId, setLocalCenterId] = useState<number | null>(currentNoteId)
  const [history, setHistory] = useState<number[]>([])
  const [hoverId, setHoverId] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [viewSize, setViewSize] = useState<{ w: number; h: number }>({ w: 900, h: 620 })

  useEffect(() => {
    if (isOpen) {
      setLocalCenterId(currentNoteId)
      setHistory([])
    }
  }, [isOpen, currentNoteId])

  // v0.21.5 · 键盘快捷键: Tab / G 切换到图谱;Esc 关闭
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' || e.key === 'g' || e.key === 'G') {
        if (onSwitchToGraph) {
          e.preventDefault()
          onSwitchToGraph()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose, onSwitchToGraph])

  useEffect(() => {
    if (!isOpen) return
    const update = () => {
      const el = svgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setViewSize({ w: Math.max(480, rect.width), h: Math.max(360, rect.height) })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [isOpen])

  // 建索引:note_id -> Note,同时计算无向邻接
  const adjacency = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const n of notes) {
      if (!map.has(n.id)) map.set(n.id, new Set())
      for (const linked of n.links || []) {
        if (!map.has(linked)) map.set(linked, new Set())
        map.get(n.id)!.add(linked)
        map.get(linked)!.add(n.id)
      }
    }
    return map
  }, [notes])

  const titleOf = (id: number) =>
    notes.find((n) => n.id === id)?.title || `#${id}`

  const center = localCenterId != null ? notes.find((n) => n.id === localCenterId) : null

  const orbitData = useMemo<{ ring1: OrbitNode[]; ring2: OrbitNode[] }>(() => {
    if (!center) return { ring1: [], ring2: [] }
    const ring1Ids = Array.from(adjacency.get(center.id) ?? [])
    const ring1Set = new Set(ring1Ids)

    // Ring 2: neighbors-of-neighbors,排除 center 与 ring1
    const ring2Counter = new Map<number, number>()
    for (const n of ring1Ids) {
      for (const nn of adjacency.get(n) ?? []) {
        if (nn === center.id || ring1Set.has(nn)) continue
        ring2Counter.set(nn, (ring2Counter.get(nn) ?? 0) + 1)
      }
    }
    const ring2Ids = Array.from(ring2Counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24) // cap 外圈数量

    const cx = viewSize.w / 2
    const cy = viewSize.h / 2
    const r1 = Math.min(viewSize.w, viewSize.h) * 0.22
    const r2 = Math.min(viewSize.w, viewSize.h) * 0.4

    const build = (ids: number[], ring: 1 | 2, radius: number, counter?: Map<number, number>): OrbitNode[] => {
      const N = Math.max(1, ids.length)
      return ids.map((id, i) => {
        const angle = -Math.PI / 2 + (i / N) * Math.PI * 2
        return {
          id,
          title: titleOf(id),
          ring,
          angle,
          x: cx + radius * Math.cos(angle),
          y: cy + radius * Math.sin(angle),
          weight: counter?.get(id) ?? 1,
        }
      })
    }

    return {
      ring1: build(ring1Ids, 1, r1),
      ring2: build(ring2Ids.map((x) => x[0]), 2, r2, ring2Counter),
    }
  }, [center, adjacency, viewSize])

  const cx = viewSize.w / 2
  const cy = viewSize.h / 2
  const r1 = Math.min(viewSize.w, viewSize.h) * 0.22
  const r2 = Math.min(viewSize.w, viewSize.h) * 0.4

  const allOrbitNodes = [...orbitData.ring1, ...orbitData.ring2]
  const isRelated = (id: number) => {
    if (hoverId == null) return true
    if (id === hoverId) return true
    const adj = adjacency.get(hoverId)
    return adj?.has(id) ?? false
  }

  const handleClickNode = (id: number) => {
    if (id === localCenterId) return
    setHistory((h) => (localCenterId != null ? [...h, localCenterId] : h))
    setLocalCenterId(id)
  }

  const goBack = () => {
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setLocalCenterId(prev)
      return h.slice(0, -1)
    })
  }

  const commitSelect = () => {
    if (localCenterId != null && localCenterId !== currentNoteId) {
      onSelectNote(localCenterId)
    }
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="concept-orbit"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
          className="fixed inset-0 z-[95]"
          style={{
            background: 'var(--nv-color-bg)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              borderBottom: '1px solid var(--nv-color-border)',
              background: 'var(--nv-color-bg-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={goBack}
                disabled={history.length === 0}
                className="nv-panel-pill"
                title="返回上一中心"
                style={{
                  padding: '4px 8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  opacity: history.length === 0 ? 0.4 : 1,
                  cursor: history.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <ArrowLeft size={13} /> 上一层
              </button>
              <div style={{ fontSize: 13, color: 'var(--nv-color-fg-muted)' }}>
                概念轨道 · {center ? center.title || 'Untitled' : '未选择笔记'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {onSwitchToGraph && (
                <button
                  onClick={onSwitchToGraph}
                  className="nv-panel-pill"
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title="切换到 Graph View (Tab / G)"
                >
                  <Share2 size={13} /> 切换到图谱
                </button>
              )}
              <button
                onClick={commitSelect}
                className="nv-panel-pill"
                disabled={localCenterId == null}
                style={{ padding: '4px 12px', fontSize: 12 }}
                title="跳转到当前中心笔记并关闭"
              >
                打开当前中心
              </button>
              <button
                onClick={onClose}
                className="nv-panel-pill"
                style={{ padding: '4px 8px' }}
                title="关闭 Esc"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {!center ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--nv-color-fg-subtle)',
                  fontSize: 14,
                }}
              >
                请先在侧边栏选中一条笔记,再打开概念轨道。
              </div>
            ) : (
              <svg
                ref={svgRef}
                width="100%"
                height="100%"
                style={{ display: 'block' }}
                viewBox={`0 0 ${viewSize.w} ${viewSize.h}`}
                preserveAspectRatio="xMidYMid meet"
              >
                {/* 轨道环 */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r1}
                  fill="none"
                  stroke="var(--nv-color-border-strong)"
                  strokeDasharray="3 5"
                  strokeWidth={1}
                  opacity={0.5}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={r2}
                  fill="none"
                  stroke="var(--nv-color-border-strong)"
                  strokeDasharray="3 5"
                  strokeWidth={1}
                  opacity={0.35}
                />

                {/* 中心到 ring1 的连接线 */}
                {orbitData.ring1.map((n) => (
                  <line
                    key={`l1-${n.id}`}
                    x1={cx}
                    y1={cy}
                    x2={n.x}
                    y2={n.y}
                    stroke="var(--nv-color-accent)"
                    strokeWidth={isRelated(n.id) ? 1.2 : 0.4}
                    opacity={isRelated(n.id) ? 0.55 : 0.12}
                  />
                ))}

                {/* ring1 -> ring2 的连接线(仅绘制真实邻接) */}
                {orbitData.ring2.map((n2) => {
                  const adj = adjacency.get(n2.id) ?? new Set()
                  return orbitData.ring1
                    .filter((n1) => adj.has(n1.id))
                    .map((n1) => (
                      <line
                        key={`l2-${n1.id}-${n2.id}`}
                        x1={n1.x}
                        y1={n1.y}
                        x2={n2.x}
                        y2={n2.y}
                        stroke="var(--nv-color-fg-subtle)"
                        strokeWidth={isRelated(n1.id) && isRelated(n2.id) ? 0.8 : 0.3}
                        opacity={isRelated(n1.id) && isRelated(n2.id) ? 0.5 : 0.08}
                      />
                    ))
                })}

                {/* 中心节点 */}
                <g>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={30}
                    fill="var(--nv-color-accent)"
                    opacity={0.18}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={18}
                    fill="var(--nv-color-accent)"
                  />
                  <text
                    x={cx}
                    y={cy + 46}
                    textAnchor="middle"
                    fontSize={13}
                    fill="var(--nv-color-fg)"
                    style={{ fontWeight: 600 }}
                  >
                    {truncate(center.title || 'Untitled', 18)}
                  </text>
                </g>

                {/* ring1 节点 */}
                {allOrbitNodes.map((n) => {
                  const hovered = hoverId === n.id
                  const related = isRelated(n.id)
                  const r = n.ring === 1 ? 9 : 6
                  return (
                    <g
                      key={`n-${n.id}`}
                      style={{ cursor: 'pointer', opacity: related ? 1 : 0.25 }}
                      onMouseEnter={() => setHoverId(n.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onClick={() => handleClickNode(n.id)}
                    >
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={r + (hovered ? 3 : 0)}
                        fill={n.ring === 1 ? 'var(--nv-color-accent)' : 'var(--nv-color-fg-muted)'}
                        opacity={hovered ? 1 : n.ring === 1 ? 0.85 : 0.65}
                      />
                      <text
                        x={n.x}
                        y={n.y + r + 14}
                        textAnchor="middle"
                        fontSize={n.ring === 1 ? 11 : 10}
                        fill="var(--nv-color-fg-muted)"
                      >
                        {truncate(n.title, n.ring === 1 ? 14 : 10)}
                      </text>
                    </g>
                  )
                })}
              </svg>
            )}
            <div
              style={{
                position: 'absolute',
                left: 16,
                bottom: 14,
                fontSize: 11,
                color: 'var(--nv-color-fg-subtle)',
                display: 'flex',
                gap: 14,
              }}
            >
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--nv-color-accent)',
                    marginRight: 4,
                  }}
                />
                一跳邻居({orbitData.ring1.length})
              </span>
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--nv-color-fg-muted)',
                    marginRight: 4,
                  }}
                />
                二跳邻居({orbitData.ring2.length})
              </span>
              <span>点击节点可切换中心,"上一层"回退</span>
              {onSwitchToGraph && <span>Tab / G 切换到图谱</span>}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export default ConceptOrbit
