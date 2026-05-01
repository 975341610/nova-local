/**
 * v0.21.6 · 白板数据惰性迁移
 * v1 → v2 规则:
 *   - 若缺 version, 视为 v1
 *   - FlowNode.color 映射到 FlowNode.fill (保留原 color 以便老版回读)
 *   - FlowEdge.routing 缺省补 'orthogonal'
 *   - 缺省补 viewport {0,0,1}
 *   - nodes/edges/strokes 缺省补空数组
 * 仅在加载时调用一次, 不做深拷贝 (节点引用仍可变 — 后续操作经过 store immer 负责不可变)
 */
import {
  DEFAULT_EDGE_ROUTING,
  DEFAULT_VIEWPORT,
  type FlowEdge,
  type FlowNode,
  type Stroke,
  type WhiteboardData,
} from './types'

type UnknownWhiteboard = Partial<WhiteboardData> & Record<string, unknown>

function migrateNode(n: FlowNode): FlowNode {
  const fill = n.fill ?? n.color
  return fill !== undefined ? { ...n, fill } : n
}

function migrateEdge(e: FlowEdge): FlowEdge {
  return { ...e, routing: e.routing ?? DEFAULT_EDGE_ROUTING }
}

export function migrate(raw: UnknownWhiteboard | null | undefined): WhiteboardData {
  const src: UnknownWhiteboard = raw ?? {}
  const strokes = Array.isArray(src.strokes) ? (src.strokes as Stroke[]) : []
  const nodesIn = Array.isArray(src.nodes) ? (src.nodes as FlowNode[]) : []
  const edgesIn = Array.isArray(src.edges) ? (src.edges as FlowEdge[]) : []
  const width = typeof src.width === 'number' ? src.width : 720
  const height = typeof src.height === 'number' ? src.height : 440
  const viewport = src.viewport ?? { ...DEFAULT_VIEWPORT }

  return {
    strokes,
    nodes: nodesIn.map(migrateNode),
    edges: edgesIn.map(migrateEdge),
    width,
    height,
    viewport,
    version: 2,
  }
}
