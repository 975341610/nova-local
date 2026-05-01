/**
 * v0.21.6 · 白板编辑器 store (轻量自研, 无第三方依赖)
 *
 * 设计:
 *   - 持有 WhiteboardData + 编辑期瞬态 (selection / dragBaseline)
 *   - 变更通过 action 触发, 大多数 action = 1 次 commit
 *   - viewport 变化不进入 undo 栈 (视口仅为显示)
 *   - drag 通过 beginDrag/dragBy/endDrag 聚合为 1 次 undo 条目
 */
import type { FlowEdge, FlowNode, Viewport, WhiteboardData } from '../../lib/whiteboard/types'

export interface WhiteboardState {
  data: WhiteboardData
  selectedIds: string[]
}

type Listener = (s: WhiteboardState) => void

interface DragBaseline {
  snapshot: WhiteboardData
  startPositions: Record<string, { x: number; y: number }>
}

export interface WhiteboardStore {
  getState(): WhiteboardState
  subscribe(listener: Listener): () => void

  // history
  canUndo(): boolean
  canRedo(): boolean
  undo(): void
  redo(): void

  // nodes
  addNode(node: FlowNode): void
  updateNode(id: string, patch: Partial<FlowNode>): void
  removeNode(id: string): void
  removeSelected(): void

  // edges
  addEdge(edge: FlowEdge): void
  updateEdge(id: string, patch: Partial<FlowEdge>): void
  removeEdge(id: string): void

  // strokes
  addStroke(stroke: WhiteboardData['strokes'][number]): void
  clearStrokes(): void

  // selection
  select(ids: string[]): void
  toggleSelect(id: string): void
  clearSelection(): void

  // drag aggregation
  beginDrag(): void
  dragBy(dx: number, dy: number): void
  endDrag(): void

  // viewport (no history)
  setViewport(v: Viewport): void

  // bulk
  replace(data: WhiteboardData): void
}

function deepCloneData(d: WhiteboardData): WhiteboardData {
  return {
    strokes: d.strokes.map((s) => ({ ...s, points: s.points.map((p) => [p[0], p[1]] as [number, number]) })),
    nodes: d.nodes.map((n) => ({ ...n })),
    edges: d.edges.map((e) => ({ ...e })),
    width: d.width,
    height: d.height,
    viewport: d.viewport ? { ...d.viewport } : undefined,
    version: 2,
  }
}

export function createWhiteboardStore(initial: WhiteboardData): WhiteboardStore {
  let state: WhiteboardState = {
    data: deepCloneData(initial),
    selectedIds: [],
  }
  const listeners = new Set<Listener>()
  const past: WhiteboardData[] = []
  const future: WhiteboardData[] = []
  let dragBaseline: DragBaseline | null = null

  function emit() {
    for (const l of listeners) l(state)
  }
  function commit(mutator: (d: WhiteboardData) => WhiteboardData) {
    past.push(deepCloneData(state.data))
    if (past.length > 100) past.shift()
    future.length = 0
    state = { ...state, data: mutator(deepCloneData(state.data)) }
    emit()
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    undo() {
      if (past.length === 0) return
      const prev = past.pop()!
      future.push(deepCloneData(state.data))
      state = { ...state, data: prev }
      emit()
    },
    redo() {
      if (future.length === 0) return
      const next = future.pop()!
      past.push(deepCloneData(state.data))
      state = { ...state, data: next }
      emit()
    },

    addNode(node) {
      commit((d) => {
        d.nodes.push({ ...node })
        return d
      })
    },
    updateNode(id, patch) {
      commit((d) => {
        d.nodes = d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n))
        return d
      })
    },
    removeNode(id) {
      commit((d) => {
        d.nodes = d.nodes.filter((n) => n.id !== id)
        d.edges = d.edges.filter((e) => e.from !== id && e.to !== id)
        return d
      })
      state = { ...state, selectedIds: state.selectedIds.filter((x) => x !== id) }
      emit()
    },
    removeSelected() {
      const ids = new Set(state.selectedIds)
      if (ids.size === 0) return
      commit((d) => {
        d.nodes = d.nodes.filter((n) => !ids.has(n.id))
        d.edges = d.edges.filter((e) => !ids.has(e.id) && !ids.has(e.from) && !ids.has(e.to))
        return d
      })
      state = { ...state, selectedIds: [] }
      emit()
    },

    addEdge(edge) {
      commit((d) => {
        d.edges.push({ ...edge })
        return d
      })
    },
    updateEdge(id, patch) {
      commit((d) => {
        d.edges = d.edges.map((e) => (e.id === id ? { ...e, ...patch } : e))
        return d
      })
    },
    removeEdge(id) {
      commit((d) => {
        d.edges = d.edges.filter((e) => e.id !== id)
        return d
      })
    },

    addStroke(stroke) {
      commit((d) => {
        d.strokes.push(stroke)
        return d
      })
    },
    clearStrokes() {
      commit((d) => {
        d.strokes = []
        return d
      })
    },

    select(ids) {
      state = { ...state, selectedIds: [...ids] }
      emit()
    },
    toggleSelect(id) {
      const exists = state.selectedIds.includes(id)
      const next = exists ? state.selectedIds.filter((x) => x !== id) : [...state.selectedIds, id]
      state = { ...state, selectedIds: next }
      emit()
    },
    clearSelection() {
      if (state.selectedIds.length === 0) return
      state = { ...state, selectedIds: [] }
      emit()
    },

    beginDrag() {
      const snapshot = deepCloneData(state.data)
      const ids = new Set(state.selectedIds)
      const startPositions: Record<string, { x: number; y: number }> = {}
      for (const n of state.data.nodes) {
        if (ids.has(n.id)) startPositions[n.id] = { x: n.x, y: n.y }
      }
      dragBaseline = { snapshot, startPositions }
    },
    dragBy(dx, dy) {
      if (!dragBaseline) return
      const { startPositions } = dragBaseline
      const next = deepCloneData(state.data)
      next.nodes = next.nodes.map((n) =>
        startPositions[n.id]
          ? { ...n, x: startPositions[n.id].x + dx, y: startPositions[n.id].y + dy }
          : n,
      )
      state = { ...state, data: next }
      emit()
    },
    endDrag() {
      if (!dragBaseline) return
      past.push(dragBaseline.snapshot)
      if (past.length > 100) past.shift()
      future.length = 0
      dragBaseline = null
      emit()
    },

    setViewport(v) {
      const next = deepCloneData(state.data)
      next.viewport = { ...v }
      state = { ...state, data: next }
      emit()
    },

    replace(data) {
      past.push(deepCloneData(state.data))
      future.length = 0
      state = { ...state, data: deepCloneData(data) }
      emit()
    },
  }
}
