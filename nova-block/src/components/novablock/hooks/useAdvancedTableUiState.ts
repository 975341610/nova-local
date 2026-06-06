import { useCallback, useState } from 'react'

import type { AdvancedTableEdgeIntent } from '../../../lib/advancedTableEdges'

export type AdvancedTablePopover = 'text' | 'color' | null
export type AdvancedTableSelectionScope = 'cell' | 'row' | 'column' | null
export type AdvancedTableInsertTarget = { kind: 'row' | 'column'; key: string } | null

const DEFAULT_ADVANCED_TABLE_SIZE = { open: false, rows: 4, cols: 4 }

export function useAdvancedTableUiState() {
  const [showAdvancedTableToolbar, setShowAdvancedTableToolbar] = useState(false)
  const [advancedTableSize, setAdvancedTableSize] = useState(DEFAULT_ADVANCED_TABLE_SIZE)
  const [advancedTableEdgeIntent, setAdvancedTableEdgeIntent] = useState<AdvancedTableEdgeIntent>(null)
  const [hoveredInsertTarget, setHoveredInsertTarget] = useState<AdvancedTableInsertTarget>(null)
  const [advancedTableSelectionScope, setAdvancedTableSelectionScope] = useState<AdvancedTableSelectionScope>(null)
  const [advancedTablePopover, setAdvancedTablePopover] = useState<AdvancedTablePopover>(null)
  const [isAdvancedTableResizeCursor, setIsAdvancedTableResizeCursor] = useState(false)

  const resetAdvancedTableUi = useCallback(() => {
    setShowAdvancedTableToolbar(false)
    setAdvancedTableSize(DEFAULT_ADVANCED_TABLE_SIZE)
    setAdvancedTableEdgeIntent(null)
    setHoveredInsertTarget(null)
    setAdvancedTableSelectionScope(null)
    setAdvancedTablePopover(null)
    setIsAdvancedTableResizeCursor(false)
  }, [])

  return {
    showAdvancedTableToolbar,
    setShowAdvancedTableToolbar,
    advancedTableSize,
    setAdvancedTableSize,
    advancedTableEdgeIntent,
    setAdvancedTableEdgeIntent,
    hoveredInsertTarget,
    setHoveredInsertTarget,
    advancedTableSelectionScope,
    setAdvancedTableSelectionScope,
    advancedTablePopover,
    setAdvancedTablePopover,
    isAdvancedTableResizeCursor,
    setIsAdvancedTableResizeCursor,
    resetAdvancedTableUi,
  }
}
