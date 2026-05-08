/**
 * v0.21.7 · A1 · PlantUML 预览组件 (SVG foreignObject 内嵌)
 *
 * 用途:
 *   Board (编辑器) 和 FreehandNodeView (展示) 共用.
 *   传入 source + bbox, 内部调 renderPlantUml 获取 SVG, 渲染到 foreignObject.
 *
 * 状态:
 *   - loading: 显示虚线 + "渲染中..."
 *   - ready:   dangerouslySetInnerHTML 注入 SVG (PlantUML server 回返的是完整 svg 文档)
 *   - error:   显示错误, 提示可双击编辑源码
 */
import { useEffect, useState } from 'react'
import { renderPlantUml } from '../../lib/whiteboard/plantumlCache'

interface Props {
  source: string
  x: number
  y: number
  w: number
  h: number
}

export function PlantUmlPreview({ source, x, y, w, h }: Props) {
  const [svg, setSvg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setErr(null)
    renderPlantUml(source)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg)
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [source])

  if (err) {
    return (
      <foreignObject x={x} y={y} width={w} height={h}>
        <div
          style={{
            width: '100%',
            height: '100%',
            border: '1.5px dashed #ef4444',
            borderRadius: 6,
            padding: 8,
            fontSize: 11,
            color: '#b91c1c',
            background: '#fef2f2',
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
            pointerEvents: 'none',
          }}
        >
          <b>PlantUML 渲染失败</b>
          <div style={{ opacity: 0.8, marginTop: 2 }}>{err}</div>
          <div style={{ opacity: 0.6, marginTop: 4 }}>双击编辑源码</div>
        </div>
      </foreignObject>
    )
  }

  if (!svg) {
    return (
      <foreignObject x={x} y={y} width={w} height={h}>
        <div
          style={{
            width: '100%',
            height: '100%',
            border: '1.5px dashed #94a3b8',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b',
            fontSize: 11,
            background: '#f8fafc',
            pointerEvents: 'none',
          }}
        >
          PlantUML 渲染中…
        </div>
      </foreignObject>
    )
  }

  // 已拿到 SVG, 用 foreignObject + div.innerHTML 注入, 让浏览器原生缩放
  return (
    <foreignObject x={x} y={y} width={w} height={h} style={{ overflow: 'hidden' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
        // SVG 是 PlantUML 官方服务器返回的, 信任;
        // 若需更严格可改成 DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } })
        dangerouslySetInnerHTML={{
          __html: fitSvg(svg),
        }}
      />
    </foreignObject>
  )
}

/**
 * PlantUML 返回的 <svg> 通常没有 width=100% 设置, 这里强行塞一份,
 * 并强制移除白底, 让它在 foreignObject 内按 bbox 自适应.
 */
function fitSvg(svg: string): string {
  return svg.replace(
    /<svg([^>]*)>/,
    '<svg$1 style="width:100%;height:100%;max-width:100%;max-height:100%;display:block" preserveAspectRatio="xMidYMid meet">',
  )
}
