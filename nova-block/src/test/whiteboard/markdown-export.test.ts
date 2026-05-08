/**
 * v0.21.8 · C2/B · Markdown 导出工具测试
 */
import { describe, expect, it } from 'vitest'
import {
  toMarkdownDataUrlImg,
  toMarkdownInlineSvg,
} from '../../lib/whiteboard/markdown'
import { createEmptyWhiteboard, type WhiteboardData } from '../../lib/whiteboard/types'

function sample(): WhiteboardData {
  const d = createEmptyWhiteboard()
  d.nodes.push({ id: 'a', x: 0, y: 0, w: 100, h: 40, text: 'hello', shape: 'rect' })
  return d
}

describe('toMarkdownInlineSvg', () => {
  it('wraps svg in whiteboard div, strips xml prolog', () => {
    const md = toMarkdownInlineSvg(sample())
    expect(md).toContain('<div class="whiteboard">')
    expect(md).toContain('</div>')
    expect(md).toContain('<svg')
    expect(md).not.toContain('<?xml')
    expect(md).toContain('hello')
  })
})

describe('toMarkdownDataUrlImg', () => {
  it('produces `![alt](data:image/svg+xml;base64,...)`', () => {
    const md = toMarkdownDataUrlImg(sample())
    expect(md.startsWith('![whiteboard](data:image/svg+xml;base64,')).toBe(true)
    expect(md.endsWith(')')).toBe(true)
    // 解码后应能还原为含节点文本的 SVG
    const b64 = md.replace(/^!\[whiteboard\]\(data:image\/svg\+xml;base64,/, '').replace(/\)$/, '')
    const decoded = Buffer.from(b64, 'base64').toString('utf-8')
    expect(decoded).toContain('<svg')
    expect(decoded).toContain('hello')
  })

  it('uses custom alt text', () => {
    const md = toMarkdownDataUrlImg(sample(), '流程图')
    expect(md.startsWith('![流程图](data:image/svg+xml;base64,')).toBe(true)
  })
})
