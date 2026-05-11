import { describe, it, expect } from 'vitest'
import { createWhiteboardStore } from '../../store/whiteboard/whiteboardStore'
import { createEmptyWhiteboard, type FlowNode } from '../../lib/whiteboard/types'

function n(id: string, x = 0, y = 0): FlowNode {
  return { id, x, y, w: 100, h: 60, text: id, shape: 'rect' }
}

describe('whiteboardStore', () => {
  it('initialises with given data', () => {
    const store = createWhiteboardStore(createEmptyWhiteboard())
    expect(store.getState().data.nodes).toEqual([])
    expect(store.getState().data.version).toBe(2)
  })

  it('addNode commits a new node and enables undo', () => {
    const store = createWhiteboardStore(createEmptyWhiteboard())
    store.addNode(n('a', 10, 20))
    expect(store.getState().data.nodes).toHaveLength(1)
    expect(store.canUndo()).toBe(true)
    expect(store.canRedo()).toBe(false)
    store.undo()
    expect(store.getState().data.nodes).toHaveLength(0)
    expect(store.canRedo()).toBe(true)
    store.redo()
    expect(store.getState().data.nodes).toHaveLength(1)
  })

  it('updateNode merges attributes via a single commit', () => {
    const store = createWhiteboardStore(createEmptyWhiteboard())
    store.addNode(n('a'))
    store.updateNode('a', { text: 'hello', x: 200 })
    const node = store.getState().data.nodes[0]
    expect(node.text).toBe('hello')
    expect(node.x).toBe(200)
  })

  it('removeNode also removes dangling edges', () => {
    const store = createWhiteboardStore(createEmptyWhiteboard())
    store.addNode(n('a'))
    store.addNode(n('b'))
    store.addEdge({ id: 'e1', from: 'a', to: 'b' })
    store.removeNode('a')
    expect(store.getState().data.nodes.map((x) => x.id)).toEqual(['b'])
    expect(store.getState().data.edges).toEqual([])
  })

  it('select replaces selection; toggleSelect toggles membership', () => {
    const store = createWhiteboardStore(createEmptyWhiteboard())
    store.addNode(n('a'))
    store.addNode(n('b'))
    store.select(['a', 'b'])
    expect(store.getState().selectedIds).toEqual(['a', 'b'])
    store.toggleSelect('a')
    expect(store.getState().selectedIds).toEqual(['b'])
    store.toggleSelect('c')
    expect(store.getState().selectedIds).toEqual(['b', 'c'])
  })

  it('dragBy moves all selected nodes, undo reverts in one step', () => {
    const store = createWhiteboardStore(createEmptyWhiteboard())
    store.addNode(n('a', 0, 0))
    store.addNode(n('b', 100, 0))
    store.select(['a', 'b'])
    store.beginDrag()
    store.dragBy(20, 30)
    store.endDrag()
    const byId = Object.fromEntries(store.getState().data.nodes.map((x) => [x.id, x]))
    expect(byId.a.x).toBe(20)
    expect(byId.b.x).toBe(120)
    expect(byId.a.y).toBe(30)
    store.undo()
    const afterUndo = Object.fromEntries(store.getState().data.nodes.map((x) => [x.id, x]))
    expect(afterUndo.a.x).toBe(0)
    expect(afterUndo.b.x).toBe(100)
  })

  it('setViewport does NOT enter undo stack', () => {
    const store = createWhiteboardStore(createEmptyWhiteboard())
    store.setViewport({ x: 10, y: 10, zoom: 2 })
    expect(store.canUndo()).toBe(false)
    expect(store.getState().data.viewport?.zoom).toBe(2)
  })

  it('subscribe fires on state change and can be unsubscribed', () => {
    const store = createWhiteboardStore(createEmptyWhiteboard())
    let calls = 0
    const unsub = store.subscribe(() => {
      calls++
    })
    store.addNode(n('a'))
    expect(calls).toBeGreaterThanOrEqual(1)
    const snap = calls
    unsub()
    store.addNode(n('b'))
    expect(calls).toBe(snap)
  })
})
