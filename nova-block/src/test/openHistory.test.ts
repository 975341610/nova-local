/**
 * @vitest-environment jsdom
 *
 * Batch 5 · F2c · openHistory 单元契约
 *
 * 1. recordOpen → getLastOpened round-trip
 * 2. 未记录的 id 返回 0
 * 3. clearOpenHistory 重置
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordOpen,
  getLastOpened,
  loadOpenHistory,
  clearOpenHistory,
} from '../lib/novablock/openHistory'

describe('openHistory', () => {
  beforeEach(() => {
    localStorage.clear()
    clearOpenHistory()
  })

  it('round-trip: recordOpen then getLastOpened', () => {
    recordOpen('1', 12345)
    expect(getLastOpened('1')).toBe(12345)
  })

  it('returns 0 for unrecorded ids', () => {
    expect(getLastOpened('does-not-exist')).toBe(0)
  })

  it('clearOpenHistory resets all entries', () => {
    recordOpen('1', 1000)
    recordOpen('2', 2000)
    clearOpenHistory()
    expect(getLastOpened('1')).toBe(0)
    expect(getLastOpened('2')).toBe(0)
    expect(loadOpenHistory()).toEqual({})
  })

  it('persists across loadOpenHistory calls (via localStorage)', () => {
    recordOpen('42', 9999)
    const reloaded = loadOpenHistory()
    expect(reloaded['42']).toBe(9999)
  })
})
