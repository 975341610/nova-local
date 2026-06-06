import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  getFloatingLayerCssVar,
  isLayerAbove,
  QINGZHI_FLOATING_LAYER_CSS_VARS,
  QINGZHI_FLOATING_LAYERS,
} from '../lib/floatingLayers'

describe('QingZhi floating layer contract', () => {
  it('keeps editor affordances below the editor toolbar and topbar', () => {
    expect(isLayerAbove('blockHandle', 'tableEdge')).toBe(true)
    expect(isLayerAbove('editorToolbar', 'blockHandle')).toBe(true)
    expect(isLayerAbove('editorToprail', 'editorToolbar')).toBe(true)
    expect(isLayerAbove('appTopbar', 'editorToprail')).toBe(true)
  })

  it('keeps document previews below editing affordances and modal dialogs', () => {
    expect(QINGZHI_FLOATING_LAYERS.documentPreview).toBeLessThan(QINGZHI_FLOATING_LAYERS.tableEdge)
    expect(isLayerAbove('modal', 'documentPreview')).toBe(true)
    expect(isLayerAbove('systemDialog', 'modal')).toBe(true)
  })

  it('keeps fullscreen previews above app chrome but below system dialogs', () => {
    expect(isLayerAbove('fullscreen', 'appTopbar')).toBe(true)
    expect(isLayerAbove('systemDialog', 'fullscreen')).toBe(true)
  })

  it('keeps TypeScript layer values aligned with CSS design tokens', () => {
    const css = readFileSync(resolve(__dirname, '../styles/design-tokens.css'), 'utf8')

    Object.entries(QINGZHI_FLOATING_LAYER_CSS_VARS).forEach(([layer, cssVar]) => {
      const value = QINGZHI_FLOATING_LAYERS[layer as keyof typeof QINGZHI_FLOATING_LAYERS]
      expect(css).toContain(`${cssVar}: ${value};`)
      expect(getFloatingLayerCssVar(layer as keyof typeof QINGZHI_FLOATING_LAYERS)).toBe(`var(${cssVar}, ${value})`)
    })
  })

  it('uses the fullscreen layer for document, image, and web fullscreen previews', () => {
    const documentSource = readFileSync(resolve(__dirname, '../components/document/DocumentAttachmentView.tsx'), 'utf8')
    const mediaSource = readFileSync(resolve(__dirname, '../components/MediaNodeView.tsx'), 'utf8')
    const webSource = readFileSync(resolve(__dirname, '../components/web/WebEmbedView.tsx'), 'utf8')

    for (const source of [documentSource, mediaSource, webSource]) {
      expect(source).toContain("getFloatingLayerCssVar('fullscreen')")
      expect(source).not.toContain('214748')
    }
  })
})
