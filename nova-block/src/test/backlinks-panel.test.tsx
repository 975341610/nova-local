// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import BacklinksPanel from '../components/sidebar/BacklinksPanel'
import type { Note } from '../lib/types'

const makeNote = (overrides: Partial<Note>): Note => ({
  id: 1,
  title: 'Note',
  icon: '📝',
  summary: '',
  content: '<p></p>',
  is_title_manually_edited: false,
  tags: [],
  properties: [],
  links: [],
  notebook_id: null,
  parent_id: null,
  position: 0,
  sort_key: 'm',
  is_folder: false,
  created_at: '2026-04-18T00:00:00.000Z',
  ...overrides,
})

describe('BacklinksPanel', () => {
  it('renders forward links and backlinks immediately from the incoming notes prop', () => {
    render(
      <BacklinksPanel
        currentNoteId={1}
        notes={[
          makeNote({ id: 1, title: 'Current', links: [2] }),
          makeNote({ id: 2, title: 'Linked Target' }),
          makeNote({ id: 3, title: 'Backlink Source', links: [1] }),
        ]}
        onSelectNote={() => {}}
      />,
    )

    expect(screen.getByText('Linked Target')).toBeTruthy()
    expect(screen.getByText('Backlink Source')).toBeTruthy()
  })
})
