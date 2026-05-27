/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  DocumentAttachmentView,
  __getDocumentPreviewSessionCacheSizeForTests,
  __resetDocumentPreviewSessionCacheForTests,
} from '../components/document/DocumentAttachmentView'
import { MediaNodeView } from '../components/MediaNodeView'
import { createElement } from 'react'

afterEach(() => {
  vi.restoreAllMocks()
  __resetDocumentPreviewSessionCacheForTests()
  delete document.body.dataset.qzDocumentPreviewSuspended
  document.body.innerHTML = ''
})

describe('DocumentAttachmentView', () => {
  it('keeps inline pdf previews in a stable body layer so the native viewer is not remounted', () => {
    const source = readFileSync(resolve(__dirname, '../components/document/DocumentAttachmentView.tsx'), 'utf8')

    expect(source).not.toContain('data-qz-document-pdf-host')
    expect(source).toContain('data-qz-document-pdf-layer')
  })

  it('loads pdf preview once and renders the iframe instead of staying in loading state', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        kind: 'pdf',
        title: 'demo.pdf',
        extension: 'pdf',
        can_preview: true,
        page_count: 3,
        sections: [{ title: '第 1 页', page: 1 }],
        html: '',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    render(
      <DocumentAttachmentView
        src="/api/media/static/files/demo.pdf"
        name="demo.pdf"
        size={12}
        type="application/pdf"
        viewMode="preview"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    await waitFor(() => expect(screen.queryByText('正在读取文档...')).toBeNull())
    const iframe = document.body.querySelector('iframe[title="demo.pdf"]') as HTMLIFrameElement | null
    expect(iframe).toBeTruthy()
    expect(iframe?.style.margin).toBe('0px')
    expect(iframe?.style.display).toBe('block')
    expect(document.body.querySelector('[data-qz-document-pdf-layer]')).toBeTruthy()
    expect(fetchSpy.mock.calls.filter(([input]) => String(input).includes('/api/documents/preview'))).toHaveLength(1)
  })

  it('does not leak inline pdf previews above overlay panels', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        kind: 'pdf',
        title: 'demo.pdf',
        extension: 'pdf',
        can_preview: true,
        page_count: 1,
        sections: [{ title: 'Page 1', page: 1 }],
        html: '',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    render(
      <DocumentAttachmentView
        src="/api/media/static/files/demo.pdf"
        name="demo.pdf"
        size={12}
        type="application/pdf"
        viewMode="preview"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    window.dispatchEvent(new CustomEvent('qz:document-preview-suspend'))

    await waitFor(() => {
      expect(screen.getByTestId('document-preview-suspended')).toBeTruthy()
    })
    const iframe = document.body.querySelector('iframe[title="demo.pdf"]') as HTMLIFrameElement | null
    expect(iframe).toBeTruthy()
    expect(iframe?.parentElement?.style.visibility).toBe('hidden')
    expect(document.body.querySelector('[data-qz-document-pdf-host]')).toBeNull()
  })

  it('keeps inline pdf previews in normal document flow during overlay scrolling', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          kind: 'pdf',
          can_preview: true,
          page_count: 1,
          html: '',
          text: '',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    render(
      <DocumentAttachmentView
        src="/api/media/static/files/overlay.pdf"
        name="overlay.pdf"
        type="application/pdf"
        viewMode="preview"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    await waitFor(() => {
      expect(document.body.querySelector('iframe[title="overlay.pdf"]')).toBeTruthy()
    })
    document.body.dataset.qzDocumentPreviewSuspended = 'true'

    window.dispatchEvent(new Event('scroll'))

    expect(document.body.querySelector('[data-qz-document-pdf-host]')).toBeNull()
  })

  it('renders fullscreen as a body portal so editor block handles cannot leak over it', () => {
    render(
      <DocumentAttachmentView
        src="/api/media/static/files/demo.pdf"
        name="demo.pdf"
        size={12}
        type="application/pdf"
        viewMode="card"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    fireEvent.click(screen.getByTitle('全屏浏览'))
    const fullscreen = screen.getByTestId('document-fullscreen-viewer')
    expect(fullscreen.parentElement).toBe(document.body)
    expect(fullscreen.querySelector('[data-drag-handle]')).toBeNull()
    expect(screen.getByTitle('退出全屏')).toBeTruthy()
  })

  it('updates the fullscreen pdf frame when changing pages or zooming', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        kind: 'pdf',
        title: 'demo.pdf',
        extension: 'pdf',
        can_preview: true,
        page_count: 3,
        sections: [{ title: '第 1 页', page: 1 }, { title: '第 2 页', page: 2 }, { title: '第 3 页', page: 3 }],
        html: '',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    render(
      <DocumentAttachmentView
        src="/api/media/static/files/demo.pdf"
        name="demo.pdf"
        size={12}
        type="application/pdf"
        viewMode="card"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    fireEvent.click(screen.getByTitle('全屏浏览'))
    await waitFor(() => expect(screen.getByText('1/3')).toBeTruthy())

    const firstFrame = screen.getByTestId('document-pdf-frame')
    expect(firstFrame.getAttribute('data-page')).toBe('1')
    expect(firstFrame.getAttribute('data-zoom')).toBe('100')
    const iframe = firstFrame.querySelector('iframe')
    const initialSrc = iframe?.getAttribute('src')
    expect(initialSrc).toContain('#toolbar=0&navpanes=0')

    fireEvent.click(screen.getByTitle('下一页'))
    await waitFor(() => expect(screen.getByText('2/3')).toBeTruthy())
    expect(screen.getByTestId('document-pdf-frame').getAttribute('data-page')).toBe('2')
    expect(screen.getByTestId('document-pdf-frame').querySelector('iframe')?.getAttribute('src')).toBe(initialSrc)

    fireEvent.click(screen.getByTitle('放大'))
    expect(screen.getByTestId('document-pdf-frame').getAttribute('data-zoom')).toBe('110')
    expect(screen.getByTestId('document-pdf-frame').querySelector('iframe')?.getAttribute('src')).toBe(initialSrc)
  })

  it('keeps document preview state and data across note switches without writing it to the note', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        kind: 'markdown',
        title: 'memo.md',
        extension: 'md',
        can_preview: true,
        page_count: null,
        sections: [{ title: 'Memo', page: 1 }],
        html: '<h1>Memo</h1><p>cached preview</p>',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    const first = render(
      <DocumentAttachmentView
        src="/api/media/static/files/memo.md"
        name="memo.md"
        size={12}
        type="text/markdown"
        viewMode="card"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    fireEvent.click(screen.getByTitle('预览视图'))
    await screen.findByText('cached preview')
    first.unmount()

    render(
      <DocumentAttachmentView
        src="/api/media/static/files/memo.md"
        name="memo.md"
        size={12}
        type="text/markdown"
        viewMode="card"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    expect(await screen.findByText('cached preview')).toBeTruthy()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps pdf preview metadata across note switches while using the stable file url for rendering', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      expect(String(input)).toContain('/api/documents/preview')
      return Promise.resolve(
        new Response(JSON.stringify({
          kind: 'pdf',
          title: 'memo.pdf',
          extension: 'pdf',
          can_preview: true,
          page_count: 1,
          sections: [{ title: 'Page 1', page: 1 }],
          html: '',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      )
    })

    const first = render(
      <DocumentAttachmentView
        src="/api/media/static/files/memo.pdf"
        name="memo.pdf"
        size={12}
        type="application/pdf"
        viewMode="card"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    fireEvent.click(screen.getByTitle('预览视图'))
    await waitFor(() => {
      expect(document.body.querySelector('iframe[title="memo.pdf"]')?.getAttribute('src')).toContain('/api/media/static/files/memo.pdf#toolbar=0&navpanes=0')
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    first.unmount()

    render(
      <DocumentAttachmentView
        src="/api/media/static/files/memo.pdf"
        name="memo.pdf"
        size={12}
        type="application/pdf"
        viewMode="card"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    await waitFor(() => {
      expect(document.body.querySelector('iframe[title="memo.pdf"]')?.getAttribute('src')).toContain('/api/media/static/files/memo.pdf#toolbar=0&navpanes=0')
    })
    expect(document.body.querySelector('[data-qz-document-pdf-host]')).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('reuses the mounted pdf iframe across note switches to avoid native viewer reloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        kind: 'pdf',
        title: 'memo.pdf',
        extension: 'pdf',
        can_preview: true,
        page_count: 1,
        sections: [{ title: 'Page 1', page: 1 }],
        html: '',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    const first = render(
      <DocumentAttachmentView
        src="/api/media/static/files/memo.pdf"
        name="memo.pdf"
        size={12}
        type="application/pdf"
        viewMode="card"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    fireEvent.click(screen.getByTitle('预览视图'))
    await waitFor(() => {
      expect(document.body.querySelector('iframe[title="memo.pdf"]')).toBeTruthy()
    })
    const firstIframe = document.body.querySelector('iframe[title="memo.pdf"]')
    first.unmount()

    expect(firstIframe?.parentElement?.style.visibility).toBe('hidden')

    render(
      <DocumentAttachmentView
        src="/api/media/static/files/memo.pdf"
        name="memo.pdf"
        size={12}
        type="application/pdf"
        viewMode="card"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    await waitFor(() => {
      expect(document.body.querySelector('iframe[title="memo.pdf"]')).toBe(firstIframe)
    })
  })

  it('keeps the same pdf iframe mounted when overlay panels suspend and resume previews', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        kind: 'pdf',
        title: 'panel.pdf',
        extension: 'pdf',
        can_preview: true,
        page_count: 1,
        sections: [{ title: 'Page 1', page: 1 }],
        html: '',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    render(
      <DocumentAttachmentView
        src="/api/media/static/files/panel.pdf"
        name="panel.pdf"
        size={12}
        type="application/pdf"
        viewMode="preview"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    await waitFor(() => expect(document.body.querySelector('iframe[title="panel.pdf"]')).toBeTruthy())
    const iframe = document.body.querySelector('iframe[title="panel.pdf"]')

    window.dispatchEvent(new CustomEvent('qz:document-preview-suspend'))
    await waitFor(() => expect(screen.getByTestId('document-preview-suspended')).toBeTruthy())
    expect(document.body.querySelector('iframe[title="panel.pdf"]')).toBe(iframe)

    window.dispatchEvent(new CustomEvent('qz:document-preview-resume'))
    await waitFor(() => expect(screen.queryByTestId('document-preview-suspended')).toBeNull())
    expect(document.body.querySelector('iframe[title="panel.pdf"]')).toBe(iframe)
  })

  it('keeps docx preview mode across note switches even when metadata changes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        kind: 'docx',
        title: 'draft.docx',
        extension: 'docx',
        can_preview: true,
        page_count: null,
        sections: [{ title: 'Draft', level: 1 }],
        html: '<h1>Draft</h1><p>docx preview</p>',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    const first = render(
      <DocumentAttachmentView
        src="/api/media/static/files/draft.docx"
        name="draft.docx"
        size={12}
        type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        viewMode="card"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    fireEvent.click(screen.getByTitle('预览视图'))
    await screen.findByText('docx preview')
    first.unmount()

    render(
      <DocumentAttachmentView
        src="/api/media/static/files/draft.docx"
        name="draft.docx"
        size={12}
        type=""
        viewMode="card"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )

    expect(await screen.findByText('docx preview')).toBeTruthy()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('limits document preview session cache with FIFO eviction', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const src = String(input)
      const match = src.match(/doc-(\d+)\.md/)
      const index = match?.[1] || 'x'
      return Promise.resolve(
        new Response(JSON.stringify({
          kind: 'markdown',
          title: `doc-${index}.md`,
          extension: 'md',
          can_preview: true,
          page_count: null,
          sections: [{ title: `Doc ${index}`, page: 1 }],
          html: `<p>preview ${index}</p>`,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      )
    })

    for (let index = 0; index < 9; index += 1) {
      const view = render(
        <DocumentAttachmentView
          src={`/api/media/static/files/doc-${index}.md`}
          name={`doc-${index}.md`}
          size={12}
          type="text/markdown"
          viewMode="card"
          onViewModeChange={() => {}}
          onDelete={() => {}}
        />,
      )
      fireEvent.click(screen.getByTitle('预览视图'))
      await screen.findByText(`preview ${index}`)
      view.unmount()
    }

    expect(__getDocumentPreviewSessionCacheSizeForTests()).toBe(8)

    render(
      <DocumentAttachmentView
        src="/api/media/static/files/doc-0.md"
        name="doc-0.md"
        size={12}
        type="text/markdown"
        viewMode="card"
        onViewModeChange={() => {}}
        onDelete={() => {}}
      />,
    )
    fireEvent.click(screen.getByTitle('预览视图'))
    await screen.findByText('preview 0')
    expect(fetchSpy).toHaveBeenCalledTimes(10)
  })
})

describe('MediaNodeView document state', () => {
  it('does not write view mode switches into the editor document', () => {
    const updateAttributes = vi.fn()
    const props = {
      node: { attrs: { src: '/api/media/static/files/demo.pdf', width: '100%', name: 'demo.pdf', size: 12, type: 'application/pdf' }, type: { name: 'file' } },
      updateAttributes,
      deleteNode: () => {},
      selected: false,
      kind: 'file',
      editor: null,
      decorations: [],
      extension: { name: 'file' },
      getPos: () => 0,
      HTMLAttributes: {},
      innerDecorations: [],
      view: null,
    } as never

    render(createElement(MediaNodeView, props))
    fireEvent.click(screen.getByTitle('预览视图'))

    expect(updateAttributes).not.toHaveBeenCalled()
    expect(screen.getByText('正在读取文档...')).toBeTruthy()
  })
})
