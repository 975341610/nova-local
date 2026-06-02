import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('sticky notes autosave guard', () => {
  it('schedules a metadata save whenever sticky notes change', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/novablock/NovaBlockEditor.tsx'),
      'utf8',
    )

    expect(source).toContain('stickyNotesSaveTimerRef')
    expect(source).toContain('scheduleStickyNotesSave')
    expect(source).toContain('handleSaveRef.current(undefined, {')
    expect(source).toContain('sticky_notes: stickyNotesRef.current')
  })
})
