/**
 * v0.21.6 · WhiteboardEditorHost
 * 挂在 App 根部, 监听 bus 打开 Modal, 关闭时写回 tiptap attrs.
 */
import { useEffect, useState } from 'react'
import { onWhiteboardOpen } from './whiteboardBus'
import { WhiteboardModal } from './WhiteboardModal'
import type { WhiteboardData } from '../../lib/whiteboard/types'

interface Session {
  key: number
  data: WhiteboardData
  commitBack: (next: WhiteboardData) => void
}

export function WhiteboardEditorHost() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    return onWhiteboardOpen((d) => {
      setSession({
        key: Date.now(),
        data: d.data,
        commitBack: d.commitBack,
      })
    })
  }, [])

  if (!session) return null
  return (
    <WhiteboardModal
      key={session.key}
      initial={session.data}
      onSave={(next) => session.commitBack(next)}
      onClose={() => setSession(null)}
    />
  )
}
