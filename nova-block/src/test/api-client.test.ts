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

  it('can request changed vault paths through Electron IPC without a full note reload', async () => {
    const ipcInvoke = vi.fn().mockResolvedValue([])
    ;(window as typeof window & { electron?: { ipcInvoke: typeof ipcInvoke } }).electron = { ipcInvoke }

    await api.getChangedNotes(['C:/vault/Daily.md'])

    expect(ipcInvoke).toHaveBeenCalledWith('notes:changed', {
      filenames: ['C:/vault/Daily.md'],
      includeContent: true,
    })
  })

  it('routes protected desktop-only actions through dedicated Electron IPC without fetch fallback', async () => {
    const ipcInvoke = vi.fn().mockResolvedValue({ status: 'ok' })
    ;(window as typeof window & { electron?: { ipcInvoke: typeof ipcInvoke } }).electron = { ipcInvoke }
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await api.updateOllama()

    expect(ipcInvoke).toHaveBeenCalledWith('ai:update-ollama', {})
    expect(ipcInvoke).not.toHaveBeenCalledWith('desktop:api-request', expect.anything())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens local files through dedicated Electron IPC without HTTP proxying', async () => {
    const ipcInvoke = vi.fn().mockResolvedValue({ status: 'ok' })
    ;(window as typeof window & { electron?: { ipcInvoke: typeof ipcInvoke } }).electron = { ipcInvoke }
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await api.openFile('C:/vault/asset.pdf')

    expect(ipcInvoke).toHaveBeenCalledWith('system:open-file', { path: 'C:/vault/asset.pdf' })
    expect(ipcInvoke).not.toHaveBeenCalledWith('desktop:api-request', expect.anything())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('routes local system maintenance actions through dedicated Electron IPC channels', async () => {
    const ipcInvoke = vi.fn().mockResolvedValue({ status: 'ok' })
    ;(window as typeof window & { electron?: { ipcInvoke: typeof ipcInvoke } }).electron = { ipcInvoke }
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await api.switchDataPath('D:/NovaData')
    await api.importData('E:/NovaBackup')
    await api.updateSystem(true)
    await api.restartSystem()

    expect(ipcInvoke).toHaveBeenCalledWith('system:switch-data-path', { data_path: 'D:/NovaData' })
    expect(ipcInvoke).toHaveBeenCalledWith('system:import-data', { source_path: 'E:/NovaBackup' })
    expect(ipcInvoke).toHaveBeenCalledWith('system:update', { force: true })
    expect(ipcInvoke).toHaveBeenCalledWith('system:restart', {})
    expect(ipcInvoke).not.toHaveBeenCalledWith('desktop:api-request', expect.anything())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not request or attach desktop auth tokens from the renderer', async () => {
    const ipcInvoke = vi.fn().mockResolvedValue(null)
    ;(window as typeof window & { electron?: { ipcInvoke: typeof ipcInvoke } }).electron = { ipcInvoke }

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await api.listMusicLibrary()

    expect(ipcInvoke).not.toHaveBeenCalledWith('desktop:get-auth-token')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/media/music-library',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'x-nova-desktop-token': expect.any(String),
        }),
      }),
    )
  })


  it('parses SSE error frames from inline AI fetch fallback and rejects instead of hanging', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"error":"Remote AI failed"}\n\n'))
        controller.close()
      },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    const onChunk = vi.fn()

    await expect(api.streamInlineAI({ prompt: 'p', context: 'c', action: 'ask' }, onChunk)).rejects.toThrow('Remote AI failed')
    expect(onChunk).not.toHaveBeenCalled()
  })

  it('flushes the final unterminated SSE frame from inline AI fetch fallback', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"text":"hello"}\n\n'))
        controller.enqueue(encoder.encode('data: {"text":" world"}'))
        controller.close()
      },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    const chunks: string[] = []

    await api.streamInlineAI({ prompt: 'p', context: 'c', action: 'ask' }, (chunk) => chunks.push(chunk))

    expect(chunks).toEqual(['hello', ' world'])
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
    expect(formatUrl('/api/media/static/files/example.png')).toBe(
      'http://127.0.0.1:8765/api/media/static/files/example.png',
    )
    expect(formatUrl('/C:/api/media/static/files/example.png')).toBe(
      'http://127.0.0.1:8765/api/media/static/files/example.png',
    )
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

  it('removes script tags from stored editor HTML', () => {
    const content = '<p>safe</p><script>window.evil = true</script>'
    const sanitized = sanitizeLegacyApiUrlsInHtml(content)
    expect(sanitized).toContain('<p>safe</p>')
    expect(sanitized).not.toContain('<script')
    expect(sanitized).not.toContain('window.evil')
  })

  it('removes event handler attributes from stored editor HTML', () => {
    const content = '<img src="/api/media/static/files/example.png" onerror="window.evil = true" />'
    const sanitized = sanitizeLegacyApiUrlsInHtml(content)
    expect(sanitized).toContain('src="http://127.0.0.1:8765/api/media/static/files/example.png"')
    expect(sanitized).not.toContain('onerror')
  })

  it('removes javascript URLs from stored editor HTML', () => {
    const content = '<a href="javascript:alert(1)">click</a>'
    const sanitized = sanitizeLegacyApiUrlsInHtml(content)
    expect(sanitized).toContain('click')
    expect(sanitized).not.toContain('javascript:')
  })

  it('removes obfuscated javascript URLs from stored editor HTML', () => {
    const content = '<a href="java\nscript:alert(1)">click</a>'
    const sanitized = sanitizeLegacyApiUrlsInHtml(content)
    expect(sanitized).toContain('click')
    expect(sanitized.toLowerCase()).not.toContain('java\nscript:')
    expect(sanitized.toLowerCase()).not.toContain('alert(1)')
  })

  it('keeps trusted video iframe cards in stored editor HTML', () => {
    const content = '<figure data-ai-source-card="video"><iframe src="https://player.bilibili.com/player.html?bvid=BV1xx411c7mD" data-embed="true"></iframe><figcaption>B站</figcaption></figure>'
    const sanitized = sanitizeLegacyApiUrlsInHtml(content)

    expect(sanitized).toContain('<iframe')
    expect(sanitized).toContain('https://player.bilibili.com/player.html?bvid=BV1xx411c7mD')
    expect(sanitized).toContain('data-ai-source-card="video"')
    expect(sanitized).toContain('data-embed="true"')
  })

  it('removes untrusted iframe cards from stored editor HTML', () => {
    const content = '<p>safe</p><iframe src="https://evil.example/embed"></iframe>'
    const sanitized = sanitizeLegacyApiUrlsInHtml(content)

    expect(sanitized).toContain('<p>safe</p>')
    expect(sanitized).not.toContain('<iframe')
    expect(sanitized).not.toContain('evil.example')
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

  it('exposes note revision history endpoints through the API client', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ))

    await api.listNoteRevisions(12)
    await api.getNoteRevision(12, 3)
    await api.restoreNoteRevision(12, 3)
    await api.captureNoteSnapshot(12, 'save')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:8765/api/notes/12/revisions',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8765/api/notes/12/revisions/3',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:8765/api/notes/12/revisions/3/restore',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:8765/api/notes/12/snapshot',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ source: 'save' }),
      }),
    )
  })

  it('downloads the full data export as a zip blob', async () => {
    const zipBlob = new Blob(['zip'], { type: 'application/zip' })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(zipBlob, {
        status: 200,
        headers: { 'Content-Type': 'application/zip' },
      }),
    )

    const result = await api.exportAllData({ 'nova.example': true })

    expect(result).toBeInstanceOf(Blob)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/system/export-all',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        body: JSON.stringify({ localstorage: { 'nova.example': true } }),
      }),
    )
  })
})
