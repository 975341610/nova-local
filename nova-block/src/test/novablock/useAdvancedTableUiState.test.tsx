// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useAdvancedTableUiState } from '../../components/novablock/hooks/useAdvancedTableUiState'

describe('useAdvancedTableUiState', () => {
  it('centralizes transient advanced table overlay state and can reset it together', () => {
    const { result } = renderHook(() => useAdvancedTableUiState())

    expect(result.current.showAdvancedTableToolbar).toBe(false)
    expect(result.current.advancedTableSize).toEqual({ open: false, rows: 4, cols: 4 })
    expect(result.current.advancedTableEdgeIntent).toBeNull()
    expect(result.current.advancedTablePopover).toBeNull()

    act(() => {
      result.current.setShowAdvancedTableToolbar(true)
      result.current.setAdvancedTableSize({ open: true, rows: 6, cols: 5 })
      result.current.setAdvancedTableSelectionScope('row')
      result.current.setAdvancedTablePopover('color')
      result.current.setIsAdvancedTableResizeCursor(true)
    })

    expect(result.current.showAdvancedTableToolbar).toBe(true)
    expect(result.current.advancedTableSelectionScope).toBe('row')

    act(() => {
      result.current.resetAdvancedTableUi()
    })

    expect(result.current.showAdvancedTableToolbar).toBe(false)
    expect(result.current.advancedTableSize).toEqual({ open: false, rows: 4, cols: 4 })
    expect(result.current.advancedTableSelectionScope).toBeNull()
    expect(result.current.advancedTablePopover).toBeNull()
    expect(result.current.isAdvancedTableResizeCursor).toBe(false)
  })
})
