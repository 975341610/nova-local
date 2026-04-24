import { describe, expect, it } from 'vitest'

import { clampStickyNotePosition } from '../components/editor/StickyNotesLayer'

describe('clampStickyNotePosition', () => {
  it('keeps note position inside layer bounds', () => {
    const next = clampStickyNotePosition(
      500,
      800,
      { width: 300, height: 400 },
      { width: 120, height: 160 },
    )

    expect(next).toEqual({ x: 180, y: 240 })
  })

  it('clamps negative positions to zero', () => {
    const next = clampStickyNotePosition(
      -40,
      -12,
      { width: 300, height: 400 },
      { width: 120, height: 160 },
    )

    expect(next).toEqual({ x: 0, y: 0 })
  })

  it('returns original position when bounds are not ready', () => {
    const next = clampStickyNotePosition(
      120,
      160,
      { width: 0, height: 0 },
      { width: 120, height: 160 },
    )

    expect(next).toEqual({ x: 120, y: 160 })
  })
})

