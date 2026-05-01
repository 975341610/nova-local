/**
 * v0.21.7 · A4 · 模板库
 *
 * 4 款模板:
 *   - flowchart · 开始→判断→结束 流程
 *   - fishbone · 鱼骨图
 *   - swot · 2x2
 *   - swimlane · 横向 3 泳道
 *
 * 所有模板的 id 在被加载时会重新生成, 避免多次插入同一模板冲突.
 */
import {
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_VIEWPORT,
  newId,
  type FlowEdge,
  type FlowNode,
  type WhiteboardData,
} from './types'

export type TemplateId = 'flowchart' | 'fishbone' | 'swot' | 'swimlane'

export interface TemplateMeta {
  id: TemplateId
  label: string
  description: string
  icon: string
}

export const TEMPLATES: TemplateMeta[] = [
  { id: 'flowchart', label: '流程图', description: '开始 → 判断 → 结束', icon: '▭' },
  { id: 'fishbone', label: '鱼骨图', description: '问题 + 4 根主刺', icon: '🐟' },
  { id: 'swot', label: 'SWOT', description: '2×2 分析矩阵', icon: '◰' },
  { id: 'swimlane', label: '泳道图', description: '3 条横向泳道', icon: '☰' },
]

function freshenIds(
  nodes: Omit<FlowNode, 'id'>[],
  edges: Array<Omit<FlowEdge, 'id' | 'from' | 'to'> & { from: string; to: string }>,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const idMap: Record<string, string> = {}
  const outNodes: FlowNode[] = nodes.map((n, i) => {
    const localKey = `k${i}`
    const real = newId()
    idMap[localKey] = real
    return { ...n, id: real }
  })
  const outEdges: FlowEdge[] = edges.map((e) => ({
    ...e,
    id: newId(),
    from: idMap[e.from] ?? e.from,
    to: idMap[e.to] ?? e.to,
  }))
  return { nodes: outNodes, edges: outEdges }
}

function flowchartTemplate(): WhiteboardData {
  const raw = freshenIds(
    [
      { x: 100, y: 60, w: 140, h: 60, text: '开始', shape: 'ellipse' },
      { x: 100, y: 180, w: 140, h: 60, text: '输入数据', shape: 'rect' },
      { x: 100, y: 300, w: 140, h: 80, text: '是否有效?', shape: 'diamond' },
      { x: 320, y: 300, w: 140, h: 60, text: '报错', shape: 'rect' },
      { x: 100, y: 440, w: 140, h: 60, text: '处理', shape: 'rect' },
      { x: 100, y: 560, w: 140, h: 60, text: '结束', shape: 'ellipse' },
    ],
    [
      { from: 'k0', to: 'k1', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k1', to: 'k2', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k2', to: 'k3', routing: 'orthogonal', arrowEnd: 'arrow', label: '否' },
      { from: 'k2', to: 'k4', routing: 'orthogonal', arrowEnd: 'arrow', label: '是' },
      { from: 'k4', to: 'k5', routing: 'orthogonal', arrowEnd: 'arrow' },
    ],
  )
  return buildData(raw, 620, 660)
}

function fishboneTemplate(): WhiteboardData {
  // 中心问题节点 + 4 主刺
  const raw = freshenIds(
    [
      { x: 460, y: 220, w: 160, h: 70, text: '核心问题', shape: 'ellipse' },
      { x: 40, y: 40, w: 140, h: 50, text: '人', shape: 'rect' },
      { x: 40, y: 400, w: 140, h: 50, text: '机', shape: 'rect' },
      { x: 640, y: 40, w: 140, h: 50, text: '料', shape: 'rect' },
      { x: 640, y: 400, w: 140, h: 50, text: '法', shape: 'rect' },
    ],
    [
      { from: 'k1', to: 'k0', routing: 'straight', arrowEnd: 'arrow' },
      { from: 'k2', to: 'k0', routing: 'straight', arrowEnd: 'arrow' },
      { from: 'k3', to: 'k0', routing: 'straight', arrowEnd: 'arrow' },
      { from: 'k4', to: 'k0', routing: 'straight', arrowEnd: 'arrow' },
    ],
  )
  return buildData(raw, 820, 480)
}

function swotTemplate(): WhiteboardData {
  const raw = freshenIds(
    [
      { x: 40, y: 40, w: 280, h: 200, text: 'S · 优势', shape: 'rect', fill: '#ecfdf5' },
      { x: 340, y: 40, w: 280, h: 200, text: 'W · 劣势', shape: 'rect', fill: '#fef2f2' },
      { x: 40, y: 260, w: 280, h: 200, text: 'O · 机会', shape: 'rect', fill: '#eff6ff' },
      { x: 340, y: 260, w: 280, h: 200, text: 'T · 威胁', shape: 'rect', fill: '#fefce8' },
    ],
    [],
  )
  return buildData(raw, 660, 480)
}

function swimlaneTemplate(): WhiteboardData {
  const raw = freshenIds(
    [
      { x: 20, y: 20, w: 880, h: 120, text: '设计', shape: 'rect', fill: '#f1f5f9' },
      { x: 20, y: 160, w: 880, h: 120, text: '研发', shape: 'rect', fill: '#f8fafc' },
      { x: 20, y: 300, w: 880, h: 120, text: '测试', shape: 'rect', fill: '#f1f5f9' },
      { x: 60, y: 50, w: 140, h: 60, text: '需求评审', shape: 'rect' },
      { x: 240, y: 190, w: 140, h: 60, text: '编码', shape: 'rect' },
      { x: 420, y: 330, w: 140, h: 60, text: '用例执行', shape: 'rect' },
      { x: 600, y: 190, w: 140, h: 60, text: '修复', shape: 'rect' },
      { x: 780, y: 330, w: 140, h: 60, text: '回归', shape: 'rect' },
    ],
    [
      { from: 'k3', to: 'k4', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k4', to: 'k5', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k5', to: 'k6', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k6', to: 'k7', routing: 'orthogonal', arrowEnd: 'arrow' },
    ],
  )
  return buildData(raw, 940, 440)
}

function buildData(
  raw: { nodes: FlowNode[]; edges: FlowEdge[] },
  width = DEFAULT_CANVAS_WIDTH,
  height = DEFAULT_CANVAS_HEIGHT,
): WhiteboardData {
  return {
    strokes: [],
    nodes: raw.nodes,
    edges: raw.edges,
    width,
    height,
    viewport: { ...DEFAULT_VIEWPORT },
    version: 2,
  }
}

export function buildTemplate(id: TemplateId): WhiteboardData {
  switch (id) {
    case 'flowchart':
      return flowchartTemplate()
    case 'fishbone':
      return fishboneTemplate()
    case 'swot':
      return swotTemplate()
    case 'swimlane':
      return swimlaneTemplate()
  }
}
