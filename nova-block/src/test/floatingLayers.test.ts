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

  it('keeps TypeScript layer values aligned with CSS design tokens', () => {
    const css = readFileSync(resolve(__dirname, '../styles/design-tokens.css'), 'utf8')

    Object.entries(QINGZHI_FLOATING_LAYER_CSS_VARS).forEach(([layer, cssVar]) => {
      const value = QINGZHI_FLOATING_LAYERS[layer as keyof typeof QINGZHI_FLOATING_LAYERS]
      expect(css).toContain(`${cssVar}: ${value};`)
      expect(getFloatingLayerCssVar(layer as keyof typeof QINGZHI_FLOATING_LAYERS)).toBe(`var(${cssVar}, ${value})`)
    })
  })
})
