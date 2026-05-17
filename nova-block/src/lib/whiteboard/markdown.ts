/**
 * v0.21.7 · C2 · 白板 → Markdown 片段
 * v0.21.8 · B  · 新增 data-URL 图片片段 (笔记块互通)
 *
 * 输出:
 *   - toMarkdownInlineSvg(data): `<div class="whiteboard"><svg>…</svg></div>`
 *   - toMarkdownDataUrlImg(data): `![whiteboard](data:image/svg+xml;base64,…)`
 *
 * 两者都可以直接插入笔记块(tiptap / Markdown 编辑器); data-URL 形式更"便携",
 * 可在任何无法保留原生 SVG 的场景里作为后备.
 */
import { exportSvg } from './export'
import type { WhiteboardData } from './types'

export function toMarkdownInlineSvg(data: WhiteboardData): string {
  const svg = exportSvg(data)
  // 去掉 XML 声明, 保留纯 <svg>
  const cleaned = svg.replace(/^<\?xml[^>]*\?>\s*/, '')
  return ['<div class="whiteboard">', cleaned, '</div>', ''].join('\n')
}

/**
 * v0.21.8 · 把白板渲染成 `data:image/svg+xml;base64,...`
 * 生成的 Markdown 片段形如:
 *   ![whiteboard](data:image/svg+xml;base64,XXXX)
 * 适合纯文本 Markdown / Issue / RAG chunk 等不保留 HTML 的场合.
 *
 * 注: 在 node 环境下依赖 Buffer; 在浏览器下使用 btoa 编码 UTF-8.
 */
export function toMarkdownDataUrlImg(data: WhiteboardData, alt = 'whiteboard'): string {
  const svg = exportSvg(data)
  const b64 = encodeBase64Utf8(svg)
  return `![${alt}](data:image/svg+xml;base64,${b64})`
}

function encodeBase64Utf8(s: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf-8').toString('base64')
  }
  // 浏览器回退: 先 UTF-8 编码, 再 btoa
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return (globalThis as any).btoa(bin)
}
