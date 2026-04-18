import { describe, expect, it } from 'vitest'

import { computePlaylistPopoverPosition } from '../lib/playlistPopoverPosition'

describe('computePlaylistPopoverPosition', () => {
  it('centers the playlist under the trigger button when there is room', () => {
    expect(computePlaylistPopoverPosition({
      top: 100,
      left: 200,
      right: 240,
      bottom: 132,
      width: 40,
      height: 32,
    }, 1200, 800)).toEqual({
      left: 76,
      top: 140,
    })
  })

  it('keeps the playlist inside the viewport when the button is near the edge', () => {
    expect(computePlaylistPopoverPosition({
      top: 760,
      left: 1180,
      right: 1220,
      bottom: 792,
      width: 40,
      height: 32,
    }, 1280, 800)).toEqual({
      left: 982,
      top: 352,
    })
  })
})
