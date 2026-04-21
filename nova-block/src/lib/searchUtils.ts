import type { Note } from './types'
import { searchIndex } from './searchIndex'

export type SearchResult = {
  note: Note
  snippet: string
  matches: number
}

export function stripHtmlToText(html: string) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim()
}

export function getNotesMissingContent(notes: Note[]) {
  return notes.filter((note) => !note.is_folder && note.content === undefined)
}

export function buildSearchableText(note: Note) {
  let fullContent = note.content || ''

  if (note.sticky_notes && note.sticky_notes.length > 0) {
    fullContent += ` ${note.sticky_notes.map((item) => item.content || '').join(' ')}`
  }

  if (note.tags && note.tags.length > 0) {
    fullContent += ` ${note.tags.join(' ')}`
  }

  return stripHtmlToText(fullContent)
}

export function searchNotes(notes: Note[], query: string, limit?: number) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery || normalizedQuery.length < 1) {
    return []
  }

  // 兜底：如果索引为空但传入了笔记，则构建索引（主要用于测试或首次加载）
  // @ts-ignore
  if (searchIndex.miniSearch.documentCount === 0 && notes.length > 0) {
    searchIndex.buildIndex(
      notes
        .filter((n) => !n.is_folder)
        .map((n) => ({
          id: n.id,
          title: n.title,
          content: buildSearchableText(n),
          tags: n.tags || [],
          type: n.type,
        }))
    )
  }

  const results = searchIndex.search(normalizedQuery)
  const searchResults: SearchResult[] = []

  // 记录索引中确实存在内容匹配的结果
  const foundIds = new Set(results.map(r => String(r.id)))

  for (const note of notes) {
    if (note.is_folder) continue
    const noteId = String(note.id)

    const titleMatch = (note.title || '').toLowerCase().includes(normalizedQuery.toLowerCase())
    const searchableText = buildSearchableText(note)
    const contentMatchIndex = searchableText.toLowerCase().indexOf(normalizedQuery.toLowerCase())
    const needsHydration = note.content === undefined && !titleMatch && normalizedQuery.length >= 2

    // 如果满足以下任一条件：
    // 1. 标题匹配
    // 2. 正文内容匹配 (通过 buildSearchableText 实时检测，不论索引结果如何)
    // 3. MiniSearch 索引认为匹配 (且内容不冲突)
    // 4. 需要水合 (标题不匹配且内容尚未加载)
    const indexMatch = foundIds.has(noteId)

    if (titleMatch || contentMatchIndex !== -1 || indexMatch || needsHydration) {
      let snippet = ''
      let matches = 0

      if (titleMatch) {
        matches += 100
      }
      
      if (contentMatchIndex !== -1) {
        matches += 10
        const start = Math.max(0, contentMatchIndex - 30)
        const end = Math.min(searchableText.length, contentMatchIndex + normalizedQuery.length + 50)
        snippet = searchableText.substring(start, end)
        if (start > 0) snippet = `...${snippet}`
        if (end < searchableText.length) snippet = `${snippet}...`
      } else if (indexMatch) {
        matches += (results.find(r => String(r.id) === noteId)?.score || 1)
        snippet = searchableText.substring(0, 80)
        if (searchableText.length > 80) snippet += '...'
      } else {
        matches += 1
        snippet = (note.content ? searchableText.substring(0, 80) : '') + (note.content && searchableText.length > 80 ? '...' : '')
      }

      searchResults.push({
        note,
        snippet,
        matches,
      })
    }
  }

  // 重新按匹配度排序
  searchResults.sort((a, b) => b.matches - a.matches)

  return typeof limit === 'number' ? searchResults.slice(0, limit) : searchResults
}
