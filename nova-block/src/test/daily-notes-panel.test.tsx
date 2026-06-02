/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DailyNotesPanel } from '../components/daily/DailyNotesPanel'
import { buildJournalProperties } from '../lib/journal'
import type { Note } from '../lib/types'

const makePersistedProperties = (properties: ReturnType<typeof buildJournalProperties>, noteId = 10) =>
  properties.map((property, index) => ({
    id: index + 1,
    note_id: noteId,
    ...property,
  }))

const makeNote = (overrides: Partial<Note>): Note => ({
  id: 10,
  title: 'Renamed Daily',
  icon: 'D',
  content: '<p>hello</p>',
  summary: '',
  is_title_manually_edited: true,
  tags: ['daily'],
  properties: [],
  links: [],
  notebook_id: null,
  parent_id: null,
  position: 0,
  is_folder: false,
  created_at: '2026-06-02T08:00:00Z',
  updated_at: '2026-06-02T09:00:00Z',
  ...overrides,
})

describe('DailyNotesPanel calendar center interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-02T10:00:00+08:00'))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('single click selects a day and double click opens an existing renamed daily note', () => {
    const onOpenNote = vi.fn()
    const onCreateDailyNote = vi.fn()
    render(
      <DailyNotesPanel
        isOpen
        notes={[makeNote({ properties: makePersistedProperties(buildJournalProperties('daily', '2026-06-02')) })]}
        onClose={() => {}}
        onOpenNote={onOpenNote}
        onCreateDailyNote={onCreateDailyNote}
      />,
    )

    const day = screen.getByLabelText('Select 2026-06-02')
    fireEvent.click(day)

    expect(onOpenNote).not.toHaveBeenCalled()
    expect(onCreateDailyNote).not.toHaveBeenCalled()
    expect(screen.getAllByText('Renamed Daily').length).toBeGreaterThan(0)

    fireEvent.doubleClick(day)
    expect(onOpenNote).toHaveBeenCalledWith(10)
  })

  it('double click creates a daily note for an empty selected day', async () => {
    const onCreateDailyNote = vi.fn().mockResolvedValue(makeNote({ id: 11, title: '2026-06-03' }))
    render(
      <DailyNotesPanel
        isOpen
        notes={[]}
        onClose={() => {}}
        onOpenNote={() => {}}
        onCreateDailyNote={onCreateDailyNote}
      />,
    )

    const day = screen.getByLabelText('Select 2026-06-03')
    fireEvent.click(day)
    expect(onCreateDailyNote).not.toHaveBeenCalled()

    fireEvent.doubleClick(day)
    expect(onCreateDailyNote).toHaveBeenCalledWith('2026-06-03', expect.stringContaining('2026年6月3日'))
  })

  it('shows created and updated note activity for the selected day', () => {
    render(
      <DailyNotesPanel
        isOpen
        notes={[
          makeNote({ properties: makePersistedProperties(buildJournalProperties('daily', '2026-06-02')) }),
          makeNote({
            id: 20,
            title: 'Project Brief',
            tags: [],
            properties: [],
            created_at: '2026-06-02T02:00:00Z',
            updated_at: '2026-06-02T02:00:00Z',
          }),
          makeNote({
            id: 21,
            title: 'Reading Update',
            tags: [],
            properties: [],
            created_at: '2026-06-01T02:00:00Z',
            updated_at: '2026-06-02T04:00:00Z',
          }),
          makeNote({
            id: 22,
            title: 'Older Note',
            tags: [],
            properties: [],
            created_at: '2026-05-31T02:00:00Z',
            updated_at: '2026-05-31T04:00:00Z',
          }),
        ]}
        onClose={() => {}}
        onOpenNote={() => {}}
        onCreateDailyNote={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('Select 2026-06-02'))

    expect(screen.getByText('已创建笔记')).toBeTruthy()
    expect(screen.getByText('Project Brief')).toBeTruthy()
    expect(screen.getByText('已更新笔记')).toBeTruthy()
    expect(screen.getByText('Reading Update')).toBeTruthy()
    expect(screen.queryByText('Older Note')).toBeNull()
  })
})
