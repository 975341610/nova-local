/**
 * v0.21.11 · 节点形状几何
 *
 * 把 shape → SVG path d 字符串 或 polygon points 的构造集中到此处,
 * Board / NodeView / exportSvg 共用, 避免每加一种形状要改三个文件.
 *
 * 对于带 rx 的矩形(rect/sticky/plantuml/bubble)或圆(ellipse), 由调用方直接
 * 绘制 <rect>/<ellipse>; 这里只负责 polygon/path 类自由形状.
 */
import type { FlowNode, FlowShape } from './types'

export interface ShapeBox {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 返回形状的 SVG path d (或 polygon points, 以 d 的 "M…Z" 形式给出).
 * 返回 null 表示该 shape 不走 path, 调用方自己画 rect / ellipse.
 */
export function shapePath(shape: FlowShape, box: ShapeBox): string | null {
  const { x, y, w, h } = box
  const cx = x + w / 2
  const cy = y + h / 2
  switch (shape) {
    case 'triangle':
      return `M ${cx} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`
    case 'diamond':
      return `M ${cx} ${y} L ${x + w} ${cy} L ${cx} ${y + h} L ${x} ${cy} Z`
    case 'hexagon': {
      const qx = w * 0.25
      return `M ${x + qx} ${y} L ${x + w - qx} ${y} L ${x + w} ${cy} L ${x + w - qx} ${y + h} L ${x + qx} ${y + h} L ${x} ${cy} Z`
    }
    case 'pentagon': {
      const top = { x: cx, y }
      const r1 = { x: x + w, y: y + h * 0.38 }
      const r2 = { x: x + w * 0.82, y: y + h }
      const l2 = { x: x + w * 0.18, y: y + h }
      const l1 = { x, y: y + h * 0.38 }
      return `M ${top.x} ${top.y} L ${r1.x} ${r1.y} L ${r2.x} ${r2.y} L ${l2.x} ${l2.y} L ${l1.x} ${l1.y} Z`
    }
    case 'star': {
      const rx = w / 2
      const ry = h / 2
      const inner = 0.42
      const pts: string[] = []
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 === 0 ? 1 : inner
        pts.push(`${cx + Math.cos(ang) * rx * r} ${cy + Math.sin(ang) * ry * r}`)
      }
      return 'M ' + pts.join(' L ') + ' Z'
    }
    case 'parallelogram': {
      const sk = Math.min(24, w * 0.2)
      return `M ${x + sk} ${y} L ${x + w} ${y} L ${x + w - sk} ${y + h} L ${x} ${y + h} Z`
    }
    case 'trapezoid': {
      const sk = Math.min(24, w * 0.18)
      return `M ${x + sk} ${y} L ${x + w - sk} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`
    }
    case 'arrow-shape': {
      // 指向右的宽箭头
      const headW = Math.min(w * 0.3, 40)
      const bodyH = h * 0.5
      const top = y + (h - bodyH) / 2
      const bot = top + bodyH
      const neck = x + w - headW
      return `M ${x} ${top} L ${neck} ${top} L ${neck} ${y} L ${x + w} ${cy} L ${neck} ${y + h} L ${neck} ${bot} L ${x} ${bot} Z`
    }
    case 'plus': {
      // 十字
      const tw = w * 0.32
      const th = h * 0.32
      return [
        `M ${cx - tw / 2} ${y}`,
        `L ${cx + tw / 2} ${y}`,
        `L ${cx + tw / 2} ${cy - th / 2}`,
        `L ${x + w} ${cy - th / 2}`,
        `L ${x + w} ${cy + th / 2}`,
        `L ${cx + tw / 2} ${cy + th / 2}`,
        `L ${cx + tw / 2} ${y + h}`,
        `L ${cx - tw / 2} ${y + h}`,
        `L ${cx - tw / 2} ${cy + th / 2}`,
        `L ${x} ${cy + th / 2}`,
        `L ${x} ${cy - th / 2}`,
        `L ${cx - tw / 2} ${cy - th / 2}`,
        'Z',
      ].join(' ')
    }
    case 'cloud': {
      // 5-arc 云朵近似
      const rx = w / 6
      const ry = h / 4
      return [
        `M ${x + rx} ${y + h - ry}`,
        `A ${rx} ${ry} 0 0 1 ${x + rx * 2} ${y + ry * 2}`,
        `A ${rx} ${ry} 0 0 1 ${x + w * 0.45} ${y + ry}`,
        `A ${rx} ${ry} 0 0 1 ${x + w * 0.75} ${y + ry * 1.4}`,
        `A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h - ry}`,
        `A ${rx} ${ry} 0 0 1 ${x + w * 0.5} ${y + h}`,
        `A ${rx} ${ry} 0 0 1 ${x + rx} ${y + h - ry}`,
        'Z',
      ].join(' ')
    }
    default:
      return null
  }
}

/**
 * 对于 cylinder/bubble 这类带"额外装饰"的形状, 主体是 rect + 附加 path.
 * 返回附加装饰的 path (不填充轮廓), 或 null.
 */
export function shapeDecorationPath(shape: FlowShape, box: ShapeBox): string | null {
  const { x, y, w, h } = box
  switch (shape) {
    case 'cylinder': {
      // 顶面椭圆 + 底面椭圆弧
      const ry = Math.min(12, h * 0.15)
      return [
        // 底部椭圆弧
        `M ${x} ${y + ry}`,
        `A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry}`,
      ].join(' ')
    }
    default:
      return null
  }
}

/** 气泡尾巴 path (bubble) */
export function bubbleTailPath(box: ShapeBox): string {
  const { x, y, w, h } = box
  const tipX = x + w * 0.2
  const tipY = y + h + 12
  return `M ${x + w * 0.3} ${y + h} L ${tipX} ${tipY} L ${x + w * 0.45} ${y + h} Z`
}

/** 是否该 shape 的主体由 path 绘制 (否则由调用方画 rect/ellipse) */
export function isPathShape(shape: FlowShape): boolean {
  return shapePath(shape, { x: 0, y: 0, w: 1, h: 1 }) !== null
}

export function cylinderMainPath(box: ShapeBox): string {
  const { x, y, w, h } = box
  const ry = Math.min(12, h * 0.15)
  return [
    `M ${x} ${y + ry}`,
    `A ${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry}`,
    `L ${x + w} ${y + h - ry}`,
    `A ${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry}`,
    'Z',
  ].join(' ')
}

export function geometryKeywords(n: FlowNode): string {
  // 用于调试 / tooltip
  return `${n.shape} ${n.w}x${n.h}`
}
