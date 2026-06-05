import { describe, expect, it } from 'vitest'
import {
  getOrCreateFifoMapEntry,
  limitFifoMapSize,
} from '../lib/documentPreviewSession'

describe('document preview session cache helpers', () => {
  it('keeps the oldest entries evicted when the cache grows past the limit', () => {
    const cache = new Map<string, { value: string }>()

    getOrCreateFifoMapEntry(cache, 'a', () => ({ value: 'A' }), 2)
    getOrCreateFifoMapEntry(cache, 'b', () => ({ value: 'B' }), 2)
    getOrCreateFifoMapEntry(cache, 'c', () => ({ value: 'C' }), 2)

    expect(Array.from(cache.keys())).toEqual(['b', 'c'])
  })

  it('returns the existing entry without changing FIFO order', () => {
    const cache = new Map<string, { value: string }>()

    const first = getOrCreateFifoMapEntry(cache, 'a', () => ({ value: 'A' }), 2)
    getOrCreateFifoMapEntry(cache, 'b', () => ({ value: 'B' }), 2)
    const again = getOrCreateFifoMapEntry(cache, 'a', () => ({ value: 'changed' }), 2)
    getOrCreateFifoMapEntry(cache, 'c', () => ({ value: 'C' }), 2)

    expect(again).toBe(first)
    expect(Array.from(cache.keys())).toEqual(['b', 'c'])
  })

  it('does not evict when the cache is at the limit', () => {
    const cache = new Map([
      ['a', { value: 'A' }],
      ['b', { value: 'B' }],
    ])

    limitFifoMapSize(cache, 2)

    expect(Array.from(cache.keys())).toEqual(['a', 'b'])
  })
})
