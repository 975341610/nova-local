// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RevisionHistoryDrawer } from '../components/editor/RevisionHistoryDrawer'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({
  api: {
    listNoteRevisions: vi.fn(),
    getNoteRevision: vi.fn(),
    restoreNoteRevision: vi.fn(),
  },
}))

vi.mock('../lib/confirmCompat', () => ({
  confirmCompat: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/readerContent', () => ({
  renderReaderHtml: (content: string) => content,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('RevisionHistoryDrawer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('ignores stale revision list responses from a previous note', async () => {
    const first = deferred<any[]>()
    const second = deferred<any[]>()
    const listNoteRevisions = vi.mocked(api.listNoteRevisions)
    listNoteRevisions.mockImplementation((noteId: number) => {
      if (noteId === 1) return first.promise as any
      if (noteId === 2) return second.promise as any
      return Promise.resolve([]) as any
    })
    vi.mocked(api.getNoteRevision).mockResolvedValue({
      id: 201,
      note_id: 2,
      content: '<p>note two</p>',
      missing: false,
    } as any)

    const { rerender } = render(
      <RevisionHistoryDrawer
        isOpen
        noteId={1}
        onClose={() => {}}
      />,
    )

    rerender(
      <RevisionHistoryDrawer
        isOpen
        noteId={2}
        onClose={() => {}}
      />,
    )

    await act(async () => {
      second.resolve([
        {
          id: 201,
          note_id: 2,
          created_at: '2026-05-08T01:00:00Z',
          content_hash: 'two',
          title_snapshot: 'Note Two Revision',
          byte_size: 20,
          source: 'auto',
        },
      ])
      await second.promise
    })

    expect(await screen.findByText('Note Two Revision')).toBeTruthy()

    await act(async () => {
      first.resolve([
        {
          id: 101,
          note_id: 1,
          created_at: '2026-05-08T00:00:00Z',
          content_hash: 'one',
          title_snapshot: 'Note One Revision',
          byte_size: 10,
          source: 'auto',
        },
      ])
      await first.promise
    })

    await waitFor(() => {
      expect(screen.queryByText('Note One Revision')).toBeNull()
      expect(screen.getByText('Note Two Revision')).toBeTruthy()
    })
  })

  it('keeps the current revision list during a transient null note while restoring', async () => {
    const listNoteRevisions = vi.mocked(api.listNoteRevisions)
    listNoteRevisions.mockResolvedValue([
      {
        id: 201,
        note_id: 2,
        created_at: '2026-05-08T01:00:00Z',
        content_hash: 'two',
        title_snapshot: 'Note Two Revision',
        byte_size: 20,
        source: 'auto',
      },
    ] as any)
    vi.mocked(api.getNoteRevision).mockResolvedValue({
      id: 201,
      note_id: 2,
      content: '<p>note two</p>',
      missing: false,
    } as any)

    const { rerender } = render(
      <RevisionHistoryDrawer
        isOpen
        noteId={2}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('Note Two Revision')).toBeTruthy()

    rerender(
      <RevisionHistoryDrawer
        isOpen
        noteId={null}
        onClose={() => {}}
      />,
    )

    expect(screen.getByText('Note Two Revision')).toBeTruthy()
  })

  it('refreshes the current note revision list after restore without closing the drawer', async () => {
    const onClose = vi.fn()
    const onRestored = vi.fn()
    const listNoteRevisions = vi.mocked(api.listNoteRevisions)
    listNoteRevisions
      .mockResolvedValueOnce([
        {
          id: 201,
          note_id: 2,
          created_at: '2026-05-08T01:00:00Z',
          content_hash: 'before',
          title_snapshot: 'Before Restore',
          byte_size: 20,
          source: 'auto',
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          id: 202,
          note_id: 2,
          created_at: '2026-05-08T01:01:00Z',
          content_hash: 'after',
          title_snapshot: 'After Restore',
          byte_size: 24,
          source: 'restore',
        },
      ] as any)
    vi.mocked(api.getNoteRevision).mockResolvedValue({
      id: 201,
      note_id: 2,
      content: '<p>note two</p>',
      missing: false,
    } as any)
    vi.mocked(api.restoreNoteRevision).mockResolvedValue({
      id: 2,
      content: '<p>restored</p>',
    } as any)

    render(
      <RevisionHistoryDrawer
        isOpen
        noteId={2}
        onClose={onClose}
        onRestored={onRestored}
      />,
    )

    expect(await screen.findByText('Before Restore')).toBeTruthy()

    fireEvent.click(screen.getByText(/恢复到此版本|鎭㈠鍒版鐗堟湰/))

    expect(await screen.findByText('After Restore')).toBeTruthy()
    expect(onRestored).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(listNoteRevisions).toHaveBeenCalledWith(2)
  })

  it('keeps the refreshed revision list when a follow-up reload briefly returns empty', async () => {
    const listNoteRevisions = vi.mocked(api.listNoteRevisions)
    listNoteRevisions
      .mockResolvedValueOnce([
        {
          id: 201,
          note_id: 2,
          created_at: '2026-05-08T01:00:00Z',
          content_hash: 'before',
          title_snapshot: 'Before Restore',
          byte_size: 20,
          source: 'auto',
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          id: 202,
          note_id: 2,
          created_at: '2026-05-08T01:01:00Z',
          content_hash: 'after',
          title_snapshot: 'After Restore',
          byte_size: 24,
          source: 'restore',
        },
      ] as any)
      .mockResolvedValueOnce([] as any)
    vi.mocked(api.getNoteRevision)
      .mockResolvedValueOnce({
        id: 201,
        note_id: 2,
        content: '<p>note two</p>',
        missing: false,
      } as any)
      .mockResolvedValue({
        id: 202,
        note_id: 2,
        content: '',
        missing: true,
      } as any)
    vi.mocked(api.restoreNoteRevision).mockResolvedValue({
      id: 2,
      content: '<p>restored</p>',
    } as any)

    render(
      <RevisionHistoryDrawer
        isOpen
        noteId={2}
        onClose={() => {}}
        onRestored={() => {}}
      />,
    )

    expect(await screen.findByText('Before Restore')).toBeTruthy()

    fireEvent.click(screen.getByText(/恢复到此版本|鎭㈠鍒版鐗堟湰/))

    expect(await screen.findByText('After Restore')).toBeTruthy()

    await waitFor(() => {
      expect(listNoteRevisions.mock.calls.length).toBeGreaterThanOrEqual(3)
    })
    expect(screen.getByText('After Restore')).toBeTruthy()
    expect(screen.queryByText('暂无历史版本 · 保存后会自动生成')).toBeNull()
  })

  it('keeps the restored note revision list if parent state briefly switches note while drawer stays open', async () => {
    const listNoteRevisions = vi.mocked(api.listNoteRevisions)
    listNoteRevisions.mockImplementation((noteId: number) => {
      if (noteId === 2) {
        return Promise.resolve([
          {
            id: 202,
            note_id: 2,
            created_at: '2026-05-08T01:01:00Z',
            content_hash: 'after',
            title_snapshot: 'After Restore',
            byte_size: 24,
            source: 'restore',
          },
        ]) as any
      }
      return Promise.resolve([]) as any
    })
    vi.mocked(api.getNoteRevision).mockResolvedValue({
      id: 202,
      note_id: 2,
      content: '<p>restored</p>',
      missing: false,
    } as any)

    const { rerender } = render(
      <RevisionHistoryDrawer
        isOpen
        noteId={2}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('After Restore')).toBeTruthy()

    rerender(
      <RevisionHistoryDrawer
        isOpen
        noteId={99}
        onClose={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('After Restore')).toBeTruthy()
      expect(screen.queryByText('鏆傛棤鍘嗗彶鐗堟湰 路 淇濆瓨鍚庝細鑷姩鐢熸垚')).toBeNull()
    })
    expect(listNoteRevisions).not.toHaveBeenCalledWith(99)
  })

  it('restores cached revisions when reopening the drawer after a transient empty reload', async () => {
    const listNoteRevisions = vi.mocked(api.listNoteRevisions)
    listNoteRevisions
      .mockResolvedValueOnce([
        {
          id: 302,
          note_id: 30,
          created_at: '2026-05-08T02:01:00Z',
          content_hash: 'cached',
          title_snapshot: 'Cached Revision',
          byte_size: 24,
          source: 'restore',
        },
      ] as any)
      .mockResolvedValueOnce([] as any)
    vi.mocked(api.getNoteRevision).mockResolvedValue({
      id: 302,
      note_id: 30,
      content: '<p>cached</p>',
      missing: false,
    } as any)

    const { rerender } = render(
      <RevisionHistoryDrawer
        isOpen
        noteId={30}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('Cached Revision')).toBeTruthy()

    rerender(
      <RevisionHistoryDrawer
        isOpen={false}
        noteId={30}
        onClose={() => {}}
      />,
    )
    rerender(
      <RevisionHistoryDrawer
        isOpen
        noteId={30}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('Cached Revision')).toBeTruthy()
    expect(screen.queryByText('鏆傛棤鍘嗗彶鐗堟湰 路 淇濆瓨鍚庝細鑷姩鐢熸垚')).toBeNull()
  })

  it('does not reopen with a transient note id captured while the drawer was closed', async () => {
    const listNoteRevisions = vi.mocked(api.listNoteRevisions)
    listNoteRevisions.mockImplementation((noteId: number) => {
      if (noteId === 8) {
        return Promise.resolve([
          {
            id: 808,
            note_id: 8,
            created_at: '2026-05-08T03:01:00Z',
            content_hash: 'note-8',
            title_snapshot: 'Note 8 Revision',
            byte_size: 24,
            source: 'restore',
          },
        ]) as any
      }
      return Promise.resolve([]) as any
    })
    vi.mocked(api.getNoteRevision).mockResolvedValue({
      id: 808,
      note_id: 8,
      content: '<p>note 8</p>',
      missing: false,
    } as any)

    const { rerender } = render(
      <RevisionHistoryDrawer
        isOpen
        noteId={8}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('Note 8 Revision')).toBeTruthy()

    rerender(
      <RevisionHistoryDrawer
        isOpen={false}
        noteId={24}
        onClose={() => {}}
      />,
    )
    rerender(
      <RevisionHistoryDrawer
        isOpen
        noteId={null}
        onClose={() => {}}
      />,
    )

    await waitFor(() => {
      expect(listNoteRevisions).not.toHaveBeenCalledWith(24)
    })

    rerender(
      <RevisionHistoryDrawer
        isOpen
        noteId={8}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('Note 8 Revision')).toBeTruthy()
  })

  it('does not eagerly fetch revision detail when reopening from cached metadata', async () => {
    const listNoteRevisions = vi.mocked(api.listNoteRevisions)
    const getNoteRevision = vi.mocked(api.getNoteRevision)
    listNoteRevisions.mockResolvedValue([
      {
        id: 909,
        note_id: 90,
        created_at: '2026-05-08T04:01:00Z',
        content_hash: 'cached-only',
        title_snapshot: 'Cached Only Revision',
        byte_size: 24,
        source: 'auto',
      },
    ] as any)
    getNoteRevision.mockResolvedValue({
      id: 909,
      note_id: 90,
      content: '<p>detail</p>',
      missing: false,
    } as any)
    getNoteRevision.mockClear()

    const { rerender } = render(
      <RevisionHistoryDrawer
        isOpen
        noteId={90}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('Cached Only Revision')).toBeTruthy()
    await waitFor(() => expect(getNoteRevision).toHaveBeenCalledTimes(1))

    rerender(
      <RevisionHistoryDrawer
        isOpen={false}
        noteId={90}
        onClose={() => {}}
      />,
    )
    getNoteRevision.mockClear()
    rerender(
      <RevisionHistoryDrawer
        isOpen
        noteId={90}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('Cached Only Revision')).toBeTruthy()
    expect(getNoteRevision).not.toHaveBeenCalled()
  })
})
