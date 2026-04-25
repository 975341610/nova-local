// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, formatUrl, sanitizeLegacyApiUrlsInHtml } from '../lib/api'

describe('api browser fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as typeof window & { electron?: unknown }).electron
    window.localStorage.clear()
  })

  it('sends updateNote as PUT with JSON body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 5, title: 'Renamed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await api.updateNote(5, { title: 'Renamed' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8765/api/notes/5')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ title: 'Renamed' }),
    })
  })

  it('sends deleteNote as DELETE', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await api.deleteNote(9)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8765/api/notes/9')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'DELETE',
    })
  })

  it('creates folders through the dedicated folders endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 11, title: 'Folder' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await api.createFolder({ title: 'Folder', parent_id: null, tags: [] })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8765/api/folders')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ title: 'Folder', parent_id: null, tags: [] }),
    })
  })

  it('uses Electron IPC for desktop note updates', async () => {
    const ipcInvoke = vi.fn().mockResolvedValue({ id: 7, title: 'Desktop Rename' })
    ;(window as typeof window & { electron?: { ipcInvoke: typeof ipcInvoke } }).electron = { ipcInvoke }
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await api.updateNote(7, {
      title: 'Desktop Rename',
      content: '<p>Body</p>',
      file_path: 'C:/vault/Notes/Desktop Rename.md',
      summary: 'should not pass',
      created_at: '2026-04-18T00:00:00.000Z',
    } as any)

    expect(ipcInvoke).toHaveBeenCalledWith('notes:update', {
      id: 7,
      title: 'Desktop Rename',
      content: '<p>Body</p>',
      file_path: 'C:/vault/Notes/Desktop Rename.md',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('can request full note bodies through Electron IPC when startup needs local content hydration', async () => {
    const ipcInvoke = vi.fn().mockResolvedValue([])
    ;(window as typeof window & { electron?: { ipcInvoke: typeof ipcInvoke } }).electron = { ipcInvoke }

    await api.listNotes(true)

    expect(ipcInvoke).toHaveBeenCalledWith('notes:list', {
      includeContent: true,
    })
  })

  it('attaches desktop auth token headers for desktop-only HTTP fallback endpoints', async () => {
    const ipcInvoke = vi.fn(async (channel: string) => {
      if (channel === 'desktop:get-auth-token') {
        return 'desktop-token'
      }
      return null
    })
    ;(window as typeof window & { electron?: { ipcInvoke: typeof ipcInvoke } }).electron = { ipcInvoke }

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await api.listMusicLibrary()

    expect(ipcInvoke).toHaveBeenCalledWith('desktop:get-auth-token')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/media/music-library',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-nova-desktop-token': 'desktop-token',
        }),
      }),
    )
  })

  it('uses real note property API endpoints instead of dummy local implementations', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      new Response(JSON.stringify({ id: 2, name: 'Status', type: 'select', value: 'Doing' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ))

    await api.updateNoteProperty(11, 2, { value: 'Doing' })
    await api.createNoteProperty(11, { name: 'Status', type: 'select', value: 'Todo' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:8765/api/notes/11/properties/2',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8765/api/notes/11/properties',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('ignores malformed local desktop API base values and falls back to localhost backend', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    window.localStorage.setItem('nova.api.base_url', 'C:/api')
    await api.deleteNote(3)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8765/api/notes/3')
  })

  it('normalizes legacy windows-style API paths when formatting media URLs', () => {
    expect(formatUrl('C:/api/media/static/files/example.png')).toBe(
      'http://127.0.0.1:8765/api/media/static/files/example.png',
    )
    expect(formatUrl('file:///C:/api/media/static/files/example.png')).toBe(
      'http://127.0.0.1:8765/api/media/static/files/example.png',
    )
  })

  it('sanitizes legacy file API links in stored HTML content', () => {
    const content = '<p><img src="file:///C:/api/media/static/files/example.png" /></p>'
    expect(sanitizeLegacyApiUrlsInHtml(content)).toContain('src="http://127.0.0.1:8765/api/media/static/files/example.png"')
  })

  it('sanitizes legacy file API links inside css url() declarations', () => {
    const content = '<p style="background-image:url(\'file:///C:/api/media/static/files/example.png\')">x</p>'
    expect(sanitizeLegacyApiUrlsInHtml(content)).toContain("url('http://127.0.0.1:8765/api/media/static/files/example.png')")
  })

  it('rebases plain /api links to absolute backend URLs for file:// desktop runtime', () => {
    const content = '<p><img src="/api/media/static/files/example.png" /></p>'
    expect(sanitizeLegacyApiUrlsInHtml(content)).toContain('src="http://127.0.0.1:8765/api/media/static/files/example.png"')
  })

  it('requests vault health reports from the backend system endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ summary: { total_issues: 0 }, issues: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await api.getVaultHealth()

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/system/vault-health',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
  })
})
