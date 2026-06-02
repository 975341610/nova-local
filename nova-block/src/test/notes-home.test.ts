import { describe, expect, it } from 'vitest'
import {
  NOTES_HOME_TITLE,
  getDefaultNoteParentId,
  getNotesHomeFolder,
  getRootNotesNeedingHome,
} from '../lib/notesHome'

const makeNode = (overrides: any) => ({
  id: 1,
  title: 'Node',
  parent_id: null,
  is_folder: false,
  ...overrides,
})

describe('notes home folder helpers', () => {
  it('finds the dedicated notes home folder by title at the root', () => {
    const home = makeNode({ id: 10, title: NOTES_HOME_TITLE, is_folder: true })
    const nestedSameName = makeNode({ id: 11, title: NOTES_HOME_TITLE, is_folder: true, parent_id: 99 })

    expect(getNotesHomeFolder([nestedSameName, home])).toEqual(home)
    expect(getDefaultNoteParentId([nestedSameName, home])).toBe(10)
  })

  it('only migrates root-level regular notes into the notes home folder', () => {
    const home = makeNode({ id: 10, title: NOTES_HOME_TITLE, is_folder: true })
    const rootNote = makeNode({ id: 20, title: 'Root note' })
    const rootCanvas = makeNode({ id: 21, title: 'Canvas', type: 'canvas' })
    const nestedNote = makeNode({ id: 22, title: 'Nested note', parent_id: 7 })
    const folder = makeNode({ id: 23, title: 'Folder', is_folder: true })

    expect(getRootNotesNeedingHome([home, rootNote, rootCanvas, nestedNote, folder], home.id).map((n) => n.id))
      .toEqual([20, 21])
  })
})
