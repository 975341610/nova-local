import { describe, expect, it } from 'vitest'

import { chooseCurrentNoteIdAfterRefresh } from '../lib/currentNoteRefresh'

describe('chooseCurrentNoteIdAfterRefresh', () => {
  it('keeps the restored note id during a refresh instead of falling back to another note', () => {
    const next = chooseCurrentNoteIdAfterRefresh({
      previousId: 4,
      preferredId: null,
      fallbackId: 24,
      protectedId: 4,
      notes: [{ id: 24 }],
      pickFallback: () => 24,
    })

    expect(next).toBe(4)
  })
})
