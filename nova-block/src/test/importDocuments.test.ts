/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'

describe('content import api client', () => {
  it('uploads importable files to the document upload endpoint', async () => {
    const file = new File(['# 标题'], 'note.md', { type: 'text/markdown' })
    const response = { imported_notes: [] }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(api.importDocuments([file])).resolves.toEqual(response)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/upload')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
  })
})
