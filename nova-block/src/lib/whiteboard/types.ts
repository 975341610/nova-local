/**
 * v0.21.6 · Whiteboard 数据模型(v2)
 *
 * v1 (v0.21.5):  { strokes, nodes, edges, width, height }
 * v2 (v0.21.6):  在 v1 基础上附加:
 *   - node: fill / stroke / strokeWidth / fontSize / rotation
 *   - edge: routing / fromAnchor / toAnchor / stroke / strokeWidth / arrowStart / arrowEnd
 *   - viewport: { x, y, zoom }
 *   - version: 2
 *
 * 读取策略: 未携带 version 的数据视为 v1, 由 schemaMigration.ts 惰性升级。
 */

export type FlowShape = 'rect' | 'ellipse' | 'diamond' | 'sticky' | 'plantuml'

/** 连线路由算法 */
export type EdgeRouting = 'straight' | 'orthogonal'

/** 节点上可连接的锚点位置 */
export type Anchor = 'top' | 'right' | 'bottom' | 'left' | 'auto'

/** 笔画 (SVG path 化后与 v1 二进制兼容) */
export interface Stroke {
  color: string
  size: number
  points: Array<[number, number]>
}

/** 流程图/白板节点 */
export interface FlowNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  text: string
  shape: FlowShape
  /** 填充色; 未定义 = 按 shape 默认 */
  fill?: string
  /** 描边色 */
  stroke?: string
  /** 描边宽度 (px) */
  strokeWidth?: number
  /** 字体大小 (px) */
  fontSize?: number
  /** 旋转角度 (deg), 默认 0 */
  rotation?: number
  /** v1 兼容: 老数据中的 color 字段 (作为 fill 使用) */
  color?: string
}

/** 流程图/白板连线 */
export interface FlowEdge {
  id: string
  from: string
  to: string
  label?: string
  /** 路由算法, 默认 orthogonal */
  routing?: EdgeRouting
  fromAnchor?: Anchor
  toAnchor?: Anchor
  stroke?: string
  strokeWidth?: number
  /** 起点箭头样式, 默认 none */
  arrowStart?: 'none' | 'arrow'
  /** 终点箭头样式, 默认 arrow */
  arrowEnd?: 'none' | 'arrow'
  /** v0.21.8 · 用户手动调整的正交折点(不含两端 anchor);
   *  仅 routing='orthogonal' 时生效. 若为空则自动布线. */
  waypoints?: Array<{ x: number; y: number }>
}

/** 视口变换 (编辑器内部使用, 仅在 modal 打开期间存活) */
export interface Viewport {
  x: number
  y: number
  zoom: number
}

/** 白板完整数据 (v2) */
export interface WhiteboardData {
  strokes: Stroke[]
  nodes: FlowNode[]
  edges: FlowEdge[]
  width: number
  height: number
  viewport?: Viewport
  version?: 2
}

export const DEFAULT_CANVAS_WIDTH = 720
export const DEFAULT_CANVAS_HEIGHT = 440
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

export const DEFAULT_NODE_FILL: Record<FlowShape, string> = {
  rect: '#ffffff',
  ellipse: '#ffffff',
  diamond: '#ffffff',
  sticky: '#fff3a3',
  plantuml: '#f8fafc',
}

export const DEFAULT_NODE_STROKE = '#1f2937'
export const DEFAULT_NODE_STROKE_WIDTH = 1.5
export const DEFAULT_NODE_FONT_SIZE = 14

export const DEFAULT_EDGE_STROKE = '#475569'
export const DEFAULT_EDGE_STROKE_WIDTH = 1.5
export const DEFAULT_EDGE_ROUTING: EdgeRouting = 'orthogonal'

export function createEmptyWhiteboard(
  width = DEFAULT_CANVAS_WIDTH,
  height = DEFAULT_CANVAS_HEIGHT,
): WhiteboardData {
  return {
    strokes: [],
    nodes: [],
    edges: [],
    width,
    height,
    viewport: { ...DEFAULT_VIEWPORT },
    version: 2,
  }
}

export function createSeedWhiteboard(
  width = DEFAULT_CANVAS_WIDTH,
  height = DEFAULT_CANVAS_HEIGHT,
): WhiteboardData {
  const seedId = Math.random().toString(36).slice(2, 9)
  return {
    strokes: [],
    nodes: [
      {
        id: seedId,
        x: 60,
        y: 60,
        w: 140,
        h: 64,
        text: '开始',
        shape: 'rect',
      },
    ],
    edges: [],
    width,
    height,
    viewport: { ...DEFAULT_VIEWPORT },
    version: 2,
  }
}

/** 生成随机 id (节点 / 连线共用) */
export function newId(): string {
  return Math.random().toString(36).slice(2, 9)
}
