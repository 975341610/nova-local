// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '../lib/api'

describe('api browser fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as typeof window & { electron?: unknown }).electron
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
})
