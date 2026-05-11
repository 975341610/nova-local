/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'

describe('AI import and generate note api client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads one or more files to the AI import generate note endpoint', async () => {
    const files = [
      new File(['# 第一份资料'], 'a.md', { type: 'text/markdown' }),
      new File(['第二份资料'], 'b.txt', { type: 'text/plain' }),
    ]
    const response = {
      title: 'AI整理 - 多文件导入',
      markdown: '## 摘要\n内容',
      source_type: 'file',
      metadata: { file_count: 2, source_names: ['a.md', 'b.txt'] },
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    await expect(api.importAndGenerateNote(files, { templateId: 'meeting' })).resolves.toEqual(response)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/import/generate-note')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
    expect((init?.body as FormData).get('template_id')).toBe('meeting')
  })

  it('uploads one or more files to the AI import preview endpoint', async () => {
    const files = [
      new File(['# Brief'], 'brief.md', { type: 'text/markdown' }),
    ]
    const response = {
      items: [
        {
          file_name: 'brief.md',
          file_type: 'md',
          size: 7,
          title: 'brief',
          status: 'ok',
          message: '',
          summary: 'Brief',
          block_count: 1,
        },
      ],
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    await expect(api.previewImportFiles(files)).resolves.toEqual(response)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/import/preview')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
  })

  it('posts urls to the AI import preview and generate endpoints', async () => {
    const previewResponse = {
      items: [
        {
          file_name: 'https://example.com/post',
          file_type: 'url',
          size: 128,
          title: 'Example post',
          status: 'ok',
          message: '',
          summary: 'A useful article.',
          block_count: 2,
        },
      ],
    }
    const generateResponse = {
      title: 'AI整理 - Example post',
      markdown: '## Summary\nA useful article.',
      source_type: 'url',
      metadata: { url_count: 1, source_urls: ['https://example.com/post'], template_id: 'study' },
    }
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(previewResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(generateResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(api.previewImportUrls(['https://example.com/post'])).resolves.toEqual(previewResponse)
    await expect(api.importUrlsAndGenerateNote(['https://example.com/post'], { templateId: 'study' })).resolves.toEqual(generateResponse)

    const [previewUrl, previewInit] = vi.mocked(fetch).mock.calls[0]
    expect(String(previewUrl)).toContain('/import/url/preview')
    expect(previewInit?.method).toBe('POST')
    expect(previewInit?.body).toBe(JSON.stringify({ urls: ['https://example.com/post'] }))

    const [generateUrl, generateInit] = vi.mocked(fetch).mock.calls[1]
    expect(String(generateUrl)).toContain('/import/url/generate-note')
    expect(generateInit?.method).toBe('POST')
    expect(generateInit?.body).toBe(JSON.stringify({ urls: ['https://example.com/post'], template_id: 'study' }))
  })

  it('asks a question scoped to one import batch', async () => {
    const response = {
      answer: 'This import is about source material.',
      citations: [{ note_id: 202, title: 'AI Import', chunk_id: 'import-batch-202', score: 1, excerpt: 'Source material' }],
      mode: 'import_batch',
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    await expect(api.askImportBatch('imp_123', '讲了什么？')).resolves.toEqual(response)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/import/batches/imp_123/ask')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ question: '讲了什么？' }))
  })
})
