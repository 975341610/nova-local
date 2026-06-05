import { getFloatingLayerCssVar } from './floatingLayers'

export const DOCUMENT_PDF_IFRAME_CLASS = 'qz-document-pdf-iframe h-full min-h-[420px] w-full rounded-xl bg-white'

export type DocumentPdfFrameCacheEntry = {
  iframe: HTMLIFrameElement
  wrapper: HTMLDivElement
  src: string
  attached: boolean
  lastPlacement?: string
}

export type DocumentPdfViewport = {
  width: number
  height: number
}

export function getDocumentPdfLayer(ownerDocument: Document = document) {
  let layer = ownerDocument.querySelector('[data-qz-document-pdf-layer]') as HTMLDivElement | null
  if (!layer) {
    layer = ownerDocument.createElement('div')
    layer.dataset.qzDocumentPdfLayer = 'true'
    layer.style.position = 'fixed'
    layer.style.inset = '0'
    layer.style.pointerEvents = 'none'
    layer.style.zIndex = getFloatingLayerCssVar('documentPreview')
    ownerDocument.body.appendChild(layer)
  }
  return layer
}

export function createDocumentPdfFrameEntry(
  src: string,
  ownerDocument: Document = document,
): DocumentPdfFrameCacheEntry {
  const wrapper = ownerDocument.createElement('div')
  wrapper.dataset.qzDocumentPdfWrapper = 'true'
  wrapper.style.position = 'fixed'
  wrapper.style.left = '0'
  wrapper.style.top = '0'
  wrapper.style.overflow = 'hidden'
  wrapper.style.borderRadius = '12px'
  wrapper.style.background = '#fff'
  wrapper.style.pointerEvents = 'auto'
  wrapper.style.visibility = 'hidden'
  wrapper.style.transform = 'translate3d(-10000px, -10000px, 0)'
  wrapper.style.willChange = 'transform, width, height'

  const iframe = ownerDocument.createElement('iframe')
  iframe.src = src
  wrapper.appendChild(iframe)

  return { iframe, wrapper, src, attached: false }
}

export function configureDocumentPdfFrameEntry(entry: DocumentPdfFrameCacheEntry, title: string) {
  entry.iframe.title = title
  entry.iframe.className = DOCUMENT_PDF_IFRAME_CLASS
  entry.iframe.style.border = '0'
  entry.iframe.style.display = 'block'
  entry.iframe.style.margin = '0'
  entry.iframe.style.width = '100%'
  entry.iframe.style.height = '100%'
}

export function getDocumentPdfViewport(win: Window = window): DocumentPdfViewport {
  return {
    width: win.visualViewport?.width || win.innerWidth || document.documentElement.clientWidth || 0,
    height: win.visualViewport?.height || win.innerHeight || document.documentElement.clientHeight || 0,
  }
}

export function isDocumentPdfRectVisible(rect: DOMRect, viewport = getDocumentPdfViewport()) {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < viewport.width &&
    rect.top < viewport.height
  )
}

export function placeDocumentPdfFrame(
  entry: DocumentPdfFrameCacheEntry,
  host: HTMLElement,
  hidden: boolean,
  viewport?: DocumentPdfViewport,
) {
  if (!host.isConnected) {
    entry.wrapper.style.visibility = 'hidden'
    entry.wrapper.style.pointerEvents = 'none'
    return
  }

  const rect = host.getBoundingClientRect()
  const shouldHide = hidden || !isDocumentPdfRectVisible(rect, viewport)
  const left = Math.round(rect.left * 100) / 100
  const top = Math.round(rect.top * 100) / 100
  const width = Math.max(0, Math.round(rect.width * 100) / 100)
  const height = Math.max(0, Math.round(rect.height * 100) / 100)
  const visibility = shouldHide ? 'hidden' : 'visible'
  const pointerEvents = shouldHide ? 'none' : 'auto'
  const placement = `${left}|${top}|${width}|${height}|${visibility}|${pointerEvents}`

  if (entry.lastPlacement !== placement) {
    entry.lastPlacement = placement
    entry.wrapper.style.transform = `translate3d(${left}px, ${top}px, 0)`
    entry.wrapper.style.width = `${width}px`
    entry.wrapper.style.height = `${height}px`
    entry.wrapper.style.visibility = visibility
    entry.wrapper.style.pointerEvents = pointerEvents
  }

  entry.iframe.style.width = '100%'
  entry.iframe.style.height = '100%'
}
