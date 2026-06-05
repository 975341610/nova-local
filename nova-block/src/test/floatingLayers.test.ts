import { describe, expect, it } from 'vitest'

import { isLayerAbove, QINGZHI_FLOATING_LAYERS } from '../lib/floatingLayers'

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
})
