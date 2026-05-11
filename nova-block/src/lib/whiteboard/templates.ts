/**
 * v0.21.7 · A4 · 模板库
 * v0.21.12 · 扩展至 12 款模板 + 思维导图自动布局
 *
 * 模板:
 *   - flowchart · 开始→判断→结束 流程
 *   - fishbone  · 鱼骨图
 *   - swot      · 2x2
 *   - swimlane  · 横向 3 泳道
 *   - timeline  · 水平时间线
 *   - org       · 组织架构 (三级)
 *   - arch      · 系统架构 (Client/Service/DB)
 *   - mindmap-radial · 思维导图 (放射)
 *   - mindmap-right  · 思维导图 (右展)
 *   - mindmap-tree   · 思维导图 (下挂)
 *   - tree      · 层级树
 *   - pyramid   · 金字塔
 *   - flywheel  · 增长飞轮
 *   - retro     · 快速复盘 (K/P/C)
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

export type TemplateId =
  | 'flowchart'
  | 'fishbone'
  | 'swot'
  | 'swimlane'
  | 'timeline'
  | 'org'
  | 'arch'
  | 'mindmap-radial'
  | 'mindmap-right'
  | 'mindmap-tree'
  | 'tree'
  | 'pyramid'
  | 'flywheel'
  | 'retro'

export interface TemplateMeta {
  id: TemplateId
  label: string
  description: string
  icon: string
  category: 'flow' | 'mindmap' | 'strategy' | 'structure'
}

export const TEMPLATES: TemplateMeta[] = [
  { id: 'flowchart', label: '流程图', description: '开始 → 判断 → 结束', icon: '▭', category: 'flow' },
  { id: 'swimlane', label: '泳道图', description: '3 条横向泳道', icon: '☰', category: 'flow' },
  { id: 'timeline', label: '时间线', description: '水平里程碑', icon: '⏱', category: 'flow' },
  { id: 'arch', label: '系统架构', description: 'Client/Service/DB 三层', icon: '🧱', category: 'structure' },
  { id: 'org', label: '组织架构', description: '三级组织', icon: '🏢', category: 'structure' },
  { id: 'tree', label: '层级树', description: '向下展开的层级树', icon: '🌲', category: 'structure' },
  { id: 'mindmap-radial', label: '思维导图 · 放射', description: '中心辐射布局', icon: '✺', category: 'mindmap' },
  { id: 'mindmap-right', label: '思维导图 · 右展', description: '左根向右展开', icon: '➳', category: 'mindmap' },
  { id: 'mindmap-tree', label: '思维导图 · 下挂', description: '上根向下展开', icon: '⤓', category: 'mindmap' },
  { id: 'swot', label: 'SWOT', description: '2×2 分析矩阵', icon: '◰', category: 'strategy' },
  { id: 'fishbone', label: '鱼骨图', description: '问题 + 4 根主刺', icon: '🐟', category: 'strategy' },
  { id: 'pyramid', label: '金字塔', description: '自上而下分层', icon: '🔺', category: 'strategy' },
  { id: 'flywheel', label: '增长飞轮', description: '四象联动循环', icon: '⟳', category: 'strategy' },
  { id: 'retro', label: '复盘 K/P/C', description: 'Keep / Problem / Change', icon: '🔄', category: 'strategy' },
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

function timelineTemplate(): WhiteboardData {
  // 水平 5 个里程碑, 用粗直线连起来
  const y = 220
  const w = 120
  const h = 70
  const xs = [60, 240, 420, 600, 780]
  const labels = ['启动', '原型', 'Alpha', 'Beta', '发布']
  const nodes: Omit<FlowNode, 'id'>[] = xs.map((x, i) => ({
    x,
    y,
    w,
    h,
    text: labels[i],
    shape: i === 0 || i === xs.length - 1 ? 'ellipse' : 'rect',
    fill: i === xs.length - 1 ? '#ecfdf5' : undefined,
  }))
  const edges: Array<Omit<FlowEdge, 'id' | 'from' | 'to'> & { from: string; to: string }> = []
  for (let i = 0; i < xs.length - 1; i++) {
    edges.push({
      from: `k${i}`,
      to: `k${i + 1}`,
      routing: 'straight',
      arrowEnd: 'triangle',
      strokeWidth: 2,
    })
  }
  // 每个里程碑下面挂一个说明便签
  const stickies: Omit<FlowNode, 'id'>[] = xs.map((x, i) => ({
    x: x - 4,
    y: y + h + 20,
    w: w + 8,
    h: 50,
    text: `M${i + 1}`,
    shape: 'sticky',
  }))
  const raw = freshenIds([...nodes, ...stickies], edges)
  return buildData(raw, 940, 380)
}

function orgTemplate(): WhiteboardData {
  const raw = freshenIds(
    [
      { x: 380, y: 40, w: 180, h: 60, text: 'CEO', shape: 'rect', fill: '#eef2ff' },
      { x: 120, y: 180, w: 160, h: 56, text: '产品', shape: 'rect' },
      { x: 380, y: 180, w: 160, h: 56, text: '研发', shape: 'rect' },
      { x: 640, y: 180, w: 160, h: 56, text: '运营', shape: 'rect' },
      { x: 40, y: 320, w: 140, h: 50, text: 'PM A', shape: 'rect' },
      { x: 200, y: 320, w: 140, h: 50, text: 'PM B', shape: 'rect' },
      { x: 360, y: 320, w: 140, h: 50, text: 'FE', shape: 'rect' },
      { x: 520, y: 320, w: 140, h: 50, text: 'BE', shape: 'rect' },
      { x: 680, y: 320, w: 140, h: 50, text: '增长', shape: 'rect' },
    ],
    [
      { from: 'k0', to: 'k1', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k0', to: 'k2', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k0', to: 'k3', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k1', to: 'k4', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k1', to: 'k5', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k2', to: 'k6', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k2', to: 'k7', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k3', to: 'k8', routing: 'orthogonal', arrowEnd: 'none' },
    ],
  )
  return buildData(raw, 860, 400)
}

function archTemplate(): WhiteboardData {
  const raw = freshenIds(
    [
      { x: 20, y: 20, w: 880, h: 120, text: 'Client', shape: 'rect', fill: '#eff6ff' },
      { x: 20, y: 160, w: 880, h: 120, text: 'Service', shape: 'rect', fill: '#f1f5f9' },
      { x: 20, y: 300, w: 880, h: 120, text: 'Data', shape: 'rect', fill: '#fefce8' },
      { x: 60, y: 50, w: 140, h: 60, text: 'Web', shape: 'rect' },
      { x: 220, y: 50, w: 140, h: 60, text: 'Mobile', shape: 'rect' },
      { x: 380, y: 50, w: 140, h: 60, text: 'Desktop', shape: 'rect' },
      { x: 60, y: 190, w: 140, h: 60, text: 'API GW', shape: 'rect' },
      { x: 220, y: 190, w: 140, h: 60, text: 'Auth', shape: 'rect' },
      { x: 380, y: 190, w: 140, h: 60, text: 'Biz', shape: 'rect' },
      { x: 540, y: 190, w: 140, h: 60, text: 'Queue', shape: 'rect' },
      { x: 60, y: 330, w: 140, h: 60, text: 'MySQL', shape: 'cylinder' },
      { x: 220, y: 330, w: 140, h: 60, text: 'Redis', shape: 'cylinder' },
      { x: 380, y: 330, w: 140, h: 60, text: 'OSS', shape: 'cylinder' },
    ],
    [
      { from: 'k3', to: 'k6', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k4', to: 'k6', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k5', to: 'k6', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k6', to: 'k7', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k6', to: 'k8', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k8', to: 'k9', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k8', to: 'k10', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k8', to: 'k11', routing: 'orthogonal', arrowEnd: 'arrow' },
      { from: 'k9', to: 'k12', routing: 'orthogonal', arrowEnd: 'arrow' },
    ],
  )
  return buildData(raw, 940, 440)
}

/**
 * v0.21.12 · 思维导图自动布局
 * 支持三种布局:
 *   - radial: 中心向四周辐射
 *   - right : 左根向右展开
 *   - tree  : 上根向下展开
 *
 * 输入: 节点父子结构 (parentKey == null 为根)
 * 输出: 排好坐标的 nodes + 父子 edges (curve 路由, 无箭头)
 */
interface MindNode {
  key: string
  text: string
  parent: string | null
  depth: number
}
type MindLayout = 'radial' | 'right' | 'tree'
function layoutMindmap(
  mind: MindNode[],
  layout: MindLayout,
): { nodes: Omit<FlowNode, 'id'>[]; edges: Array<Omit<FlowEdge, 'id' | 'from' | 'to'> & { from: string; to: string }>; width: number; height: number } {
  // 按深度分层
  const byDepth: Record<number, MindNode[]> = {}
  let maxDepth = 0
  for (const n of mind) {
    ;(byDepth[n.depth] ??= []).push(n)
    if (n.depth > maxDepth) maxDepth = n.depth
  }
  const nodeW = 140
  const nodeH = 50
  const hgap = 200
  const vgap = 70
  const pos = new Map<string, { x: number; y: number }>()
  let W = 0
  let H = 0
  if (layout === 'right') {
    // 父节点居中, 子节点向右展开; 各列高度随叶子数均分
    const childrenOf = new Map<string, MindNode[]>()
    for (const n of mind) {
      if (n.parent) {
        if (!childrenOf.has(n.parent)) childrenOf.set(n.parent, [])
        childrenOf.get(n.parent)!.push(n)
      }
    }
    function cntLeaves(key: string): number {
      const cs = childrenOf.get(key) ?? []
      if (cs.length === 0) return 1
      let s = 0
      for (const c of cs) s += cntLeaves(c.key)
      return s
    }
    // 递归排 y
    function place(key: string, depth: number, yStart: number): number {
      const cs = childrenOf.get(key) ?? []
      const leaves = cntLeaves(key)
      const ySelf = yStart + ((leaves - 1) * vgap) / 2
      pos.set(key, { x: depth * hgap, y: ySelf })
      let cursor = yStart
      for (const c of cs) {
        const l = cntLeaves(c.key)
        place(c.key, depth + 1, cursor)
        cursor += l * vgap
      }
      return leaves
    }
    const root = mind.find((n) => n.parent === null)!
    place(root.key, 0, 0)
    W = (maxDepth + 1) * hgap + nodeW + 40
    H = cntLeaves(root.key) * vgap + nodeH + 40
  } else if (layout === 'tree') {
    // 上根向下
    const childrenOf = new Map<string, MindNode[]>()
    for (const n of mind) {
      if (n.parent) {
        if (!childrenOf.has(n.parent)) childrenOf.set(n.parent, [])
        childrenOf.get(n.parent)!.push(n)
      }
    }
    function cntLeaves(key: string): number {
      const cs = childrenOf.get(key) ?? []
      if (cs.length === 0) return 1
      let s = 0
      for (const c of cs) s += cntLeaves(c.key)
      return s
    }
    function place(key: string, depth: number, xStart: number): number {
      const cs = childrenOf.get(key) ?? []
      const leaves = cntLeaves(key)
      const xSelf = xStart + ((leaves - 1) * hgap) / 2
      pos.set(key, { x: xSelf, y: depth * vgap * 1.8 })
      let cursor = xStart
      for (const c of cs) {
        const l = cntLeaves(c.key)
        place(c.key, depth + 1, cursor)
        cursor += l * hgap
      }
      return leaves
    }
    const root = mind.find((n) => n.parent === null)!
    place(root.key, 0, 0)
    W = cntLeaves(root.key) * hgap + nodeW + 40
    H = (maxDepth + 1) * vgap * 1.8 + nodeH + 40
  } else {
    // radial: 根在中心, 第 1 层均匀分布在圆上, 更深层按父节点角度继续外扩
    const radius = [0, 200, 340, 460]
    const childrenOf = new Map<string, MindNode[]>()
    for (const n of mind) {
      if (n.parent) {
        if (!childrenOf.has(n.parent)) childrenOf.set(n.parent, [])
        childrenOf.get(n.parent)!.push(n)
      }
    }
    const angle = new Map<string, number>()
    const root = mind.find((n) => n.parent === null)!
    pos.set(root.key, { x: 0, y: 0 })
    const firstLevel = childrenOf.get(root.key) ?? []
    firstLevel.forEach((c, i) => {
      const a = (2 * Math.PI * i) / firstLevel.length
      angle.set(c.key, a)
      const r = radius[1]
      pos.set(c.key, { x: Math.cos(a) * r, y: Math.sin(a) * r })
    })
    function expand(key: string, myAngle: number, depth: number) {
      const cs = childrenOf.get(key) ?? []
      if (cs.length === 0 || depth >= radius.length - 1) return
      // 在 myAngle ± spread 之间均匀分布
      const spread = Math.PI / 4
      cs.forEach((c, i) => {
        const a =
          cs.length === 1 ? myAngle : myAngle - spread + (2 * spread * i) / (cs.length - 1)
        angle.set(c.key, a)
        const r = radius[depth + 1]
        pos.set(c.key, { x: Math.cos(a) * r, y: Math.sin(a) * r })
        expand(c.key, a, depth + 1)
      })
    }
    for (const c of firstLevel) {
      expand(c.key, angle.get(c.key)!, 1)
    }
    // 位置归一化 (以画布中心为参照)
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity
    for (const p of pos.values()) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    const pad = 60
    const offX = -minX + pad
    const offY = -minY + pad
    for (const [k, v] of pos) {
      pos.set(k, { x: v.x + offX, y: v.y + offY })
    }
    W = maxX - minX + nodeW + pad * 2
    H = maxY - minY + nodeH + pad * 2
  }

  const fillByDepth = ['#eef2ff', '#eff6ff', '#f0fdf4', '#fef2f2', '#fefce8']
  const outNodes: Omit<FlowNode, 'id'>[] = mind.map((n) => {
    const p = pos.get(n.key)!
    return {
      x: p.x,
      y: p.y,
      w: nodeW,
      h: nodeH,
      text: n.text,
      shape: n.depth === 0 ? 'ellipse' : 'rect',
      fill: fillByDepth[Math.min(n.depth, fillByDepth.length - 1)],
    }
  })
  const keyToIdx = new Map<string, number>()
  mind.forEach((n, i) => keyToIdx.set(n.key, i))
  const outEdges: Array<Omit<FlowEdge, 'id' | 'from' | 'to'> & { from: string; to: string }> = []
  for (const n of mind) {
    if (n.parent) {
      outEdges.push({
        from: `k${keyToIdx.get(n.parent)!}`,
        to: `k${keyToIdx.get(n.key)!}`,
        routing: 'curve',
        arrowEnd: 'none',
        stroke: '#94a3b8',
        strokeWidth: 1.5,
      })
    }
  }
  return { nodes: outNodes, edges: outEdges, width: Math.ceil(W), height: Math.ceil(H) }
}

function sampleMindmapData(): MindNode[] {
  return [
    { key: 'root', text: '核心主题', parent: null, depth: 0 },
    { key: 'a', text: '目标', parent: 'root', depth: 1 },
    { key: 'b', text: '现状', parent: 'root', depth: 1 },
    { key: 'c', text: '策略', parent: 'root', depth: 1 },
    { key: 'd', text: '风险', parent: 'root', depth: 1 },
    { key: 'a1', text: '短期', parent: 'a', depth: 2 },
    { key: 'a2', text: '长期', parent: 'a', depth: 2 },
    { key: 'b1', text: '数据', parent: 'b', depth: 2 },
    { key: 'b2', text: '问题', parent: 'b', depth: 2 },
    { key: 'c1', text: '产品', parent: 'c', depth: 2 },
    { key: 'c2', text: '运营', parent: 'c', depth: 2 },
    { key: 'd1', text: '技术', parent: 'd', depth: 2 },
    { key: 'd2', text: '合规', parent: 'd', depth: 2 },
  ]
}

function mindmapTemplate(layout: MindLayout): WhiteboardData {
  const laid = layoutMindmap(sampleMindmapData(), layout)
  const raw = freshenIds(laid.nodes, laid.edges)
  return buildData(raw, laid.width, laid.height)
}

function treeTemplate(): WhiteboardData {
  const raw = freshenIds(
    [
      { x: 360, y: 30, w: 140, h: 50, text: '项目', shape: 'rect', fill: '#eef2ff' },
      { x: 120, y: 140, w: 140, h: 50, text: '产品', shape: 'rect' },
      { x: 360, y: 140, w: 140, h: 50, text: '技术', shape: 'rect' },
      { x: 600, y: 140, w: 140, h: 50, text: '运营', shape: 'rect' },
      { x: 40, y: 250, w: 140, h: 50, text: '定位', shape: 'rect' },
      { x: 200, y: 250, w: 140, h: 50, text: '功能', shape: 'rect' },
      { x: 360, y: 250, w: 140, h: 50, text: '架构', shape: 'rect' },
      { x: 520, y: 250, w: 140, h: 50, text: '部署', shape: 'rect' },
      { x: 680, y: 250, w: 140, h: 50, text: '获客', shape: 'rect' },
    ],
    [
      { from: 'k0', to: 'k1', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k0', to: 'k2', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k0', to: 'k3', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k1', to: 'k4', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k1', to: 'k5', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k2', to: 'k6', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k2', to: 'k7', routing: 'orthogonal', arrowEnd: 'none' },
      { from: 'k3', to: 'k8', routing: 'orthogonal', arrowEnd: 'none' },
    ],
  )
  return buildData(raw, 860, 340)
}

function pyramidTemplate(): WhiteboardData {
  // 4 层梯形, 自上而下依次加宽
  const cx = 430
  const layerH = 70
  const widths = [220, 360, 500, 640]
  const labels = ['愿景', '战略', '战术', '执行']
  const fills = ['#fef2f2', '#fefce8', '#eff6ff', '#ecfdf5']
  const nodes: Omit<FlowNode, 'id'>[] = widths.map((w, i) => ({
    x: cx - w / 2,
    y: 30 + i * (layerH + 10),
    w,
    h: layerH,
    text: labels[i],
    shape: 'trapezoid',
    fill: fills[i],
  }))
  const raw = freshenIds(nodes, [])
  return buildData(raw, 860, 30 + 4 * (layerH + 10) + 30)
}

function flywheelTemplate(): WhiteboardData {
  // 中心 + 4 阶段环形 + 曲线连接
  const cx = 400
  const cy = 260
  const r = 180
  const positions: [number, number, string, string][] = [
    [cx, cy - r, '获客', '#eff6ff'],
    [cx + r, cy, '激活', '#ecfdf5'],
    [cx, cy + r, '留存', '#fefce8'],
    [cx - r, cy, '推荐', '#fef2f2'],
  ]
  const nodes: Omit<FlowNode, 'id'>[] = [
    { x: cx - 80, y: cy - 40, w: 160, h: 80, text: '增长飞轮', shape: 'ellipse', fill: '#eef2ff' },
    ...positions.map(([x, y, text, fill]) => ({
      x: x - 70,
      y: y - 30,
      w: 140,
      h: 60,
      text,
      shape: 'rect' as const,
      fill,
    })),
  ]
  const edges: Array<Omit<FlowEdge, 'id' | 'from' | 'to'> & { from: string; to: string }> = [
    { from: 'k1', to: 'k2', routing: 'curve', arrowEnd: 'arrow' },
    { from: 'k2', to: 'k3', routing: 'curve', arrowEnd: 'arrow' },
    { from: 'k3', to: 'k4', routing: 'curve', arrowEnd: 'arrow' },
    { from: 'k4', to: 'k1', routing: 'curve', arrowEnd: 'arrow' },
  ]
  const raw = freshenIds(nodes, edges)
  return buildData(raw, 820, 520)
}

function retroTemplate(): WhiteboardData {
  const raw = freshenIds(
    [
      { x: 20, y: 30, w: 260, h: 380, text: '✓ Keep · 做得好', shape: 'rect', fill: '#ecfdf5' },
      { x: 300, y: 30, w: 260, h: 380, text: '✗ Problem · 不足', shape: 'rect', fill: '#fef2f2' },
      { x: 580, y: 30, w: 260, h: 380, text: '→ Change · 改进', shape: 'rect', fill: '#eff6ff' },
      { x: 40, y: 100, w: 220, h: 60, text: '...', shape: 'sticky' },
      { x: 320, y: 100, w: 220, h: 60, text: '...', shape: 'sticky' },
      { x: 600, y: 100, w: 220, h: 60, text: '...', shape: 'sticky' },
    ],
    [],
  )
  return buildData(raw, 860, 440)
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
    case 'timeline':
      return timelineTemplate()
    case 'org':
      return orgTemplate()
    case 'arch':
      return archTemplate()
    case 'mindmap-radial':
      return mindmapTemplate('radial')
    case 'mindmap-right':
      return mindmapTemplate('right')
    case 'mindmap-tree':
      return mindmapTemplate('tree')
    case 'tree':
      return treeTemplate()
    case 'pyramid':
      return pyramidTemplate()
    case 'flywheel':
      return flywheelTemplate()
    case 'retro':
      return retroTemplate()
  }
}
