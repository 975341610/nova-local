import {
  DragHandlePlugin,
  defaultComputePositionConfig,
  dragHandlePluginDefaultKey,
  normalizeNestedOptions,
  type DragHandlePluginProps,
  type NestedOptions,
} from '@tiptap/extension-drag-handle'
import type { Node } from '@tiptap/pm/model'
import type { Plugin } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

type QingZhiDragHandleProps = {
  className?: string
  children: ReactNode
  editor: Editor
  pluginKey?: DragHandlePluginProps['pluginKey']
  onNodeChange?: (data: { node: Node | null; editor: Editor; pos: number }) => void
  onElementDragStart?: DragHandlePluginProps['onElementDragStart']
  onElementDragEnd?: DragHandlePluginProps['onElementDragEnd']
  computePositionConfig?: DragHandlePluginProps['computePositionConfig']
  getReferencedVirtualElement?: DragHandlePluginProps['getReferencedVirtualElement']
  nested?: boolean | NestedOptions
}

const QingZhiDragHandle = ({
  className = 'qz-block-drag-handle-floating',
  children,
  editor,
  pluginKey = dragHandlePluginDefaultKey,
  onNodeChange,
  onElementDragStart,
  onElementDragEnd,
  computePositionConfig = defaultComputePositionConfig,
  getReferencedVirtualElement,
  nested = false,
}: QingZhiDragHandleProps) => {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const plugin = useRef<Plugin | null>(null)
  const getReferencedVirtualElementRef = useRef(getReferencedVirtualElement)
  const onNodeChangeRef = useRef(onNodeChange)
  const onElementDragStartRef = useRef(onElementDragStart)
  const onElementDragEndRef = useRef(onElementDragEnd)

  getReferencedVirtualElementRef.current = getReferencedVirtualElement
  onNodeChangeRef.current = onNodeChange
  onElementDragStartRef.current = onElementDragStart
  onElementDragEndRef.current = onElementDragEnd

  const nestedKey = typeof nested === 'boolean' ? String(nested) : JSON.stringify(nested)
  const nestedOptions = useMemo(() => normalizeNestedOptions(nested), [nestedKey])

  useEffect(() => {
    let initPlugin: {
      plugin: Plugin
      unbind: () => void
    } | null = null

    if (!element || editor.isDestroyed) {
      return () => {
        plugin.current = null
      }
    }

    if (!plugin.current) {
      initPlugin = DragHandlePlugin({
        editor,
        element,
        pluginKey,
        computePositionConfig: {
          ...defaultComputePositionConfig,
          ...computePositionConfig,
        },
        getReferencedVirtualElement: () => getReferencedVirtualElementRef.current?.() ?? null,
        onElementDragStart: event => onElementDragStartRef.current?.(event),
        onElementDragEnd: event => onElementDragEndRef.current?.(event),
        onNodeChange: data => onNodeChangeRef.current?.(data),
        nestedOptions,
      })
      plugin.current = initPlugin.plugin
      editor.registerPlugin(plugin.current)
    }

    return () => {
      editor.unregisterPlugin(pluginKey)
      plugin.current = null
      if (initPlugin) {
        initPlugin.unbind()
        initPlugin = null
      }
    }
  }, [
    element,
    editor,
    pluginKey,
    computePositionConfig,
    nestedOptions,
  ])

  return (
    <div
      className={className}
      style={{ visibility: 'hidden', position: 'absolute' }}
      data-dragging="false"
      ref={setElement}
    >
      {children}
    </div>
  )
}

export default QingZhiDragHandle
