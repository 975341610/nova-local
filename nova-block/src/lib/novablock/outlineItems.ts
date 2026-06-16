export type OutlineItem = {
  id: string
  key: string
  text: string
  level: number
}

type OutlineNode = {
  type: { name: string }
  attrs: Record<string, any>
  textContent: string
  isBlock?: boolean
}

type OutlineDoc = {
  descendants(callback: (node: OutlineNode, pos: number) => boolean | void): void
}

export function collectOutlineItems(doc: OutlineDoc): OutlineItem[] {
  const items: OutlineItem[] = []
  let foldLevel: number | null = null

  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const currentLevel = node.attrs.level

      if (foldLevel !== null && currentLevel <= foldLevel) {
        foldLevel = null
      }

      if (foldLevel !== null) return false

      const text = node.textContent
      const displayText = text.trim() === '' ? '无标题' : text
      const baseId = node.attrs.id || `h-pending-${pos}`

      items.push({
        id: baseId,
        key: `${baseId}-${pos}-${currentLevel}`,
        text: displayText,
        level: currentLevel,
      })

      if (node.attrs.collapsed) {
        foldLevel = currentLevel
      }
      return false
    }

    if (node.isBlock && foldLevel !== null) return false
    return true
  })

  return items
}

export function shouldReuseOutlineItems(previous: OutlineItem[], next: OutlineItem[]): boolean {
  const hasPending = next.some((item) => item.id.startsWith('h-pending-'))
  const previousHasPending = previous.some((item) => item.id.startsWith('h-pending-'))

  if (hasPending || previousHasPending || previous.length !== next.length) {
    return false
  }

  return previous.every((item, index) => {
    const nextItem = next[index]
    return item.id === nextItem.id && item.text === nextItem.text && item.level === nextItem.level
  })
}
