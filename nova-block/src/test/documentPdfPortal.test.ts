/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_PDF_IFRAME_CLASS,
  configureDocumentPdfFrameEntry,
  createDocumentPdfFrameEntry,
  getDocumentPdfLayer,
  placeDocumentPdfFrame,
} from '../lib/documentPdfPortal'

describe('document pdf portal helpers', () => {
  it('creates a non-interactive fixed portal layer below modal overlays', () => {
    const layer = getDocumentPdfLayer()

    expect(layer.dataset.qzDocumentPdfLayer).toBe('true')
    expect(layer.style.position).toBe('fixed')
    expect(layer.style.pointerEvents).toBe('none')
    expect(layer.style.zIndex).toBe('var(--qz-z-document-preview, 12)')
    expect(getDocumentPdfLayer()).toBe(layer)
  })

  it('configures a reusable iframe entry for stable inline pdf preview', () => {
    const entry = createDocumentPdfFrameEntry('/files/demo.pdf')
    configureDocumentPdfFrameEntry(entry, 'demo.pdf')

    expect(entry.wrapper.dataset.qzDocumentPdfWrapper).toBe('true')
    expect(entry.wrapper.style.visibility).toBe('hidden')
    expect(entry.iframe.src).toContain('/files/demo.pdf')
    expect(entry.iframe.title).toBe('demo.pdf')
    expect(entry.iframe.className).toBe(DOCUMENT_PDF_IFRAME_CLASS)
    expect(entry.iframe.style.width).toBe('100%')
    expect(entry.iframe.style.height).toBe('100%')
  })

  it('places the iframe from the flow placeholder without reading iframe size back', () => {
    const entry = createDocumentPdfFrameEntry('/files/demo.pdf')
    const host = document.createElement('div')
    document.body.appendChild(host)
    host.getBoundingClientRect = () => new DOMRect(12.345, 40.678, 320.222, 180.444)

    placeDocumentPdfFrame(entry, host, false, { width: 1024, height: 768 })

    expect(entry.wrapper.style.transform).toBe('translate3d(12.35px, 40.68px, 0)')
    expect(entry.wrapper.style.width).toBe('320.22px')
    expect(entry.wrapper.style.height).toBe('180.44px')
    expect(entry.wrapper.style.visibility).toBe('visible')
    expect(entry.wrapper.style.pointerEvents).toBe('auto')

    placeDocumentPdfFrame(entry, host, true, { width: 1024, height: 768 })
    expect(entry.wrapper.style.visibility).toBe('hidden')
    expect(entry.wrapper.style.pointerEvents).toBe('none')
  })
})
