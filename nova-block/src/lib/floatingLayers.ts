export const QINGZHI_FLOATING_LAYERS = {
  editorUnderlay: 1,
  editorContent: 10,
  documentPreview: 12,
  tableEdge: 20,
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

export function isLayerAbove(upper: QingzhiFloatingLayer, lower: QingzhiFloatingLayer): boolean {
  return QINGZHI_FLOATING_LAYERS[upper] > QINGZHI_FLOATING_LAYERS[lower]
}

