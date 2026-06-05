export const QINGZHI_FLOATING_LAYERS = {
  editorUnderlay: 1,
  editorContent: 10,
  documentPreview: 12,
  tableEdge: 20,
  editorAffordance: 20,
  blockHandle: 25,
  editorToolbar: 80,
  sidePanel: 90,
  popover: 120,
  editorToprail: 900,
  appTopbar: 1000,
  modal: 1000,
  systemDialog: 10020,
} as const

export type QingzhiFloatingLayer = keyof typeof QINGZHI_FLOATING_LAYERS

export const QINGZHI_FLOATING_LAYER_CSS_VARS: Record<QingzhiFloatingLayer, string> = {
  editorUnderlay: '--qz-z-editor-underlay',
  editorContent: '--qz-z-editor-content',
  documentPreview: '--qz-z-document-preview',
  tableEdge: '--qz-z-table-edge',
  editorAffordance: '--qz-z-editor-affordance',
  blockHandle: '--qz-z-block-handle',
  editorToolbar: '--qz-z-editor-toolbar',
  sidePanel: '--qz-z-side-panel',
  popover: '--qz-z-popover',
  editorToprail: '--qz-z-editor-toprail',
  appTopbar: '--qz-z-app-topbar',
  modal: '--qz-z-modal',
  systemDialog: '--qz-z-system-dialog',
}

export function isLayerAbove(upper: QingzhiFloatingLayer, lower: QingzhiFloatingLayer): boolean {
  return QINGZHI_FLOATING_LAYERS[upper] > QINGZHI_FLOATING_LAYERS[lower]
}

export function getFloatingLayerCssVar(layer: QingzhiFloatingLayer): string {
  return `var(${QINGZHI_FLOATING_LAYER_CSS_VARS[layer]}, ${QINGZHI_FLOATING_LAYERS[layer]})`
}
