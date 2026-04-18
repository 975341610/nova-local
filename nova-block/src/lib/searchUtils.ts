import type { Note } from './types'

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
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery || normalizedQuery.length < 2) {
    return []
  }

  const results: SearchResult[] = []

  for (const note of notes) {
    if (note.is_folder) {
      continue
    }

    const title = (note.title || '').toLowerCase()
    const searchableText = buildSearchableText(note)
    const searchableLower = searchableText.toLowerCase()
    const titleMatch = title.includes(normalizedQuery)
    const contentMatchIndex = searchableLower.indexOf(normalizedQuery)

    if (!titleMatch && contentMatchIndex === -1) {
      continue
    }

    let snippet = ''
    if (contentMatchIndex !== -1) {
      const start = Math.max(0, contentMatchIndex - 30)
      const end = Math.min(searchableText.length, contentMatchIndex + normalizedQuery.length + 50)
      snippet = searchableText.substring(start, end)
      if (start > 0) snippet = `...${snippet}`
      if (end < searchableText.length) snippet = `${snippet}...`
    } else {
      snippet = searchableText.substring(0, 80)
      if (searchableText.length > 80) {
        snippet += '...'
      }
    }

    results.push({
      note,
      snippet,
      matches: (searchableLower.match(new RegExp(normalizedQuery, 'g')) || []).length + (titleMatch ? 1 : 0),
    })
  }

  const sorted = results.sort((a, b) => b.matches - a.matches)
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted
}
