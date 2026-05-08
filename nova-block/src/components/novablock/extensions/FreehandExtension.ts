/**
 * v0.20.0 · D4 Excalidraw Freehand
 * v0.21.5 · 升级为白板(Whiteboard):在原手绘基础上增加节点 + 连线 + PlantUML
 *
 * 在笔记中插入一块"自由画板":
 *   - 原子块节点 (atom block)
 *   - 工具模式:选择 / 手绘 / 节点 / 连线 / 便签
 *   - 内部使用 HTML5 Canvas 记录笔画,节点/连线通过 SVG overlay 渲染
 *   - 节点支持形状:矩形 / 椭圆 / 菱形 / 便签,以及 PlantUML 源码节点
 *   - 节点可拖动,双击编辑文字;点击"连线"模式后先点起点再点终点创建边
 *   - 数据完全本地化,保存在 node.attrs 中
 *
 * 序列化格式(向后兼容 v0.20 freehand 笔记):
 *   strokes: Array<{ color; size; points: [x, y][] }>   ← 原手绘笔画
 *   nodes: Array<{ id; x; y; w; h; text; shape; color? }>
 *   edges: Array<{ id; from; to; label? }>
 *   width / height: 画布尺寸
 */
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { FreehandNodeView } from './FreehandNodeView'
import { exportSvg } from '../../../lib/whiteboard/export'
import { migrate } from '../../../lib/whiteboard/schemaMigration'

export interface FreehandStroke {
  color: string
  size: number
  points: Array<[number, number]>
}

export type FlowShape = 'rect' | 'ellipse' | 'diamond' | 'sticky' | 'plantuml'

export interface FlowNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  text: string
  shape: FlowShape
  color?: string
}

export interface FlowEdge {
  id: string
  from: string
  to: string
  label?: string
}

export interface FreehandOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    freehand: {
      setFreehand: (options?: { width?: number; height?: number }) => ReturnType
      /** v0.21.5 · 插入白板(默认带一个节点) */
      setWhiteboard: (options?: { width?: number; height?: number }) => ReturnType
    }
  }
}

function parseStrokes(raw: string | null): FreehandStroke[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter(
      (s) =>
        s &&
        typeof s.color === 'string' &&
        typeof s.size === 'number' &&
        Array.isArray(s.points),
    )
  } catch {
    return []
  }
}

function parseNodes(raw: string | null): FlowNode[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter(
      (n) =>
        n &&
        typeof n.id === 'string' &&
        typeof n.x === 'number' &&
        typeof n.y === 'number' &&
        typeof n.text === 'string',
    )
  } catch {
    return []
  }
}

function parseEdges(raw: string | null): FlowEdge[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter(
      (e) =>
        e && typeof e.id === 'string' && typeof e.from === 'string' && typeof e.to === 'string',
    )
  } catch {
    return []
  }
}

export const FreehandExtension = Node.create<FreehandOptions>({
  name: 'freehand',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      strokes: {
        default: [] as FreehandStroke[],
        parseHTML: (element) => parseStrokes(element.getAttribute('data-strokes')),
        renderHTML: (attributes) => ({
          'data-strokes': JSON.stringify(attributes.strokes || []),
        }),
      },
      nodes: {
        default: [] as FlowNode[],
        parseHTML: (element) => parseNodes(element.getAttribute('data-nodes')),
        renderHTML: (attributes) => ({
          'data-nodes': JSON.stringify(attributes.nodes || []),
        }),
      },
      edges: {
        default: [] as FlowEdge[],
        parseHTML: (element) => parseEdges(element.getAttribute('data-edges')),
        renderHTML: (attributes) => ({
          'data-edges': JSON.stringify(attributes.edges || []),
        }),
      },
      width: {
        default: 720,
        parseHTML: (element) => Number(element.getAttribute('data-width')) || 720,
        renderHTML: (attributes) => ({
          'data-width': String(attributes.width ?? 720),
        }),
      },
      height: {
        default: 440,
        parseHTML: (element) => Number(element.getAttribute('data-height')) || 440,
        renderHTML: (attributes) => ({
          'data-height': String(attributes.height ?? 440),
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="freehand"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    // v0.21.7 · C2 · 同时把内联 SVG 作为 data-svg 属性 (便于 Markdown/HTML 导出携带可视化).
    // 任何下游 HTML→MD 转换器都可以读取 data-svg 作为替代视图.
    let svgMarkup = ''
    try {
      const data = migrate({
        strokes: (node.attrs.strokes ?? []) as never,
        nodes: (node.attrs.nodes ?? []) as never,
        edges: (node.attrs.edges ?? []) as never,
        width: Number(node.attrs.width) || 720,
        height: Number(node.attrs.height) || 440,
      } as unknown as Parameters<typeof migrate>[0])
      svgMarkup = exportSvg(data)
    } catch {
      svgMarkup = ''
    }
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'freehand',
        'data-svg': svgMarkup,
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FreehandNodeView)
  },

  addCommands() {
    return {
      setFreehand:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              strokes: [],
              nodes: [],
              edges: [],
              width: options?.width ?? 720,
              height: options?.height ?? 440,
            },
          })
        },
      setWhiteboard:
        (options) =>
        ({ commands }) => {
          const seedId = Math.random().toString(36).slice(2, 9)
          return commands.insertContent({
            type: this.name,
            attrs: {
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
                } as FlowNode,
              ],
              edges: [],
              width: options?.width ?? 720,
              height: options?.height ?? 440,
            },
          })
        },
    }
  },
})

export default FreehandExtension
