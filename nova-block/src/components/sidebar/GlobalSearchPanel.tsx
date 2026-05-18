import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, FileText, Hash, Search, Tag, X } from 'lucide-react'

import { api } from '../../lib/api'
import { getNotesMissingContent, searchNotes } from '../../lib/searchUtils'
import type { Note } from '../../lib/types'

interface GlobalSearchPanelProps {
  notes: Note[]
  onSelectNote: (note: Note) => void
  onClose: () => void
}

const HYDRATION_BATCH_SIZE = 8
const RECENT_SEARCH_KEY = 'qingzhi:search:recent'
const RECENT_OPEN_KEY = 'qingzhi:search:opened'

type SearchScope = 'all' | 'title' | 'content' | 'tag'

const SEARCH_FILTERS: Array<{ id: SearchScope; label: string; testId: string }> = [
  { id: 'all', label: '全部', testId: 'qz-search-filter-all' },
  { id: 'title', label: '标题', testId: 'qz-search-filter-title' },
  { id: 'content', label: '正文', testId: 'qz-search-filter-content' },
  { id: 'tag', label: '标签', testId: 'qz-search-filter-tag' },
]

function stripHtml(value?: string | null) {
  return (value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function readStringArray(key: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function writeStringArray(key: string, values: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(values.slice(0, 8)))
}

function rememberValue(key: string, value: string) {
  const trimmed = value.trim()
  if (!trimmed) return
  const next = [trimmed, ...readStringArray(key).filter((item) => item !== trimmed)]
  writeStringArray(key, next)
}

const GlobalSearchPanel: React.FC<GlobalSearchPanelProps> = ({
  notes,
  onSelectNote,
  onClose,
}) => {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<SearchScope>('all')
  const [hydratedById, setHydratedById] = useState<Record<number, Note>>({})
  const requestedIdsRef = useRef<Set<number>>(new Set())

  const searchableNotes = useMemo(() => notes.map((note) => (
    note.content !== undefined ? note : (hydratedById[note.id] ?? note)
  )), [hydratedById, notes])

  useEffect(() => {
    let cancelled = false
    if (query.trim().length < 2) {
      return () => {
        cancelled = true
      }
    }

    const missingNotes = getNotesMissingContent(searchableNotes, HYDRATION_BATCH_SIZE)
      .filter((note) => !requestedIdsRef.current.has(note.id))

    if (missingNotes.length === 0) {
      return () => {
        cancelled = true
      }
    }

    for (const note of missingNotes) {
      requestedIdsRef.current.add(note.id)
      void api.getNote(note.id).then((fullNote) => {
        if (cancelled) {
          return
        }

        setHydratedById((prev) => ({
          ...prev,
          [fullNote.id]: fullNote,
        }))
      }).catch((error) => {
        requestedIdsRef.current.delete(note.id)
        console.error('Failed to hydrate note content for global search:', error)
      })
    }

    return () => {
      cancelled = true
    }
  }, [query, searchableNotes])

  const results = useMemo(() => {
    if (query.trim().length < 2) {
      return []
    }
    if (scope === 'all') {
      return searchNotes(searchableNotes, query)
    }

    const lowerQuery = query.trim().toLowerCase()
    return searchableNotes
      .map((note) => {
        const title = note.title || '无标题'
        const content = stripHtml(note.content)
        const tagText = (note.tags || []).map((tag) => `#${tag}`).join(' ')
        if (scope === 'title' && title.toLowerCase().includes(lowerQuery)) {
          return { note, snippet: content || note.summary || '' }
        }
        if (scope === 'content' && content.toLowerCase().includes(lowerQuery)) {
          return { note, snippet: content }
        }
        if (scope === 'tag' && tagText.toLowerCase().includes(lowerQuery)) {
          return { note, snippet: tagText }
        }
        return null
      })
      .filter((item): item is { note: Note; snippet: string } => Boolean(item))
  }, [query, scope, searchableNotes])

  const recentSearches = useMemo(() => {
    const stored = readStringArray(RECENT_SEARCH_KEY)
    return stored.length > 0 ? stored : ['灵感标签', 'AI 总结', '会议纪要']
  }, [query])

  const recentOpened = useMemo(() => {
    const openedTitles = readStringArray(RECENT_OPEN_KEY)
    const opened = openedTitles
      .map((title) => searchableNotes.find((note) => note.title === title))
      .filter((note): note is Note => Boolean(note))
    return opened.length > 0 ? opened.slice(0, 3) : searchableNotes.slice(0, 3)
  }, [searchableNotes, query])

  const handleSelectNote = (note: Note) => {
    rememberValue(RECENT_OPEN_KEY, note.title || '无标题')
    rememberValue(RECENT_SEARCH_KEY, query)
    onSelectNote(note)
  }

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text
    const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <mark key={i} className="bg-nova/30 text-nova-foreground rounded-sm px-0.5 font-medium border-b-2 border-nova/50">
              {part}
            </mark>
          ) : (
            part
          ),
        )}
      </span>
    )
  }

  return (
    <div className="qz-search-panel flex flex-col h-full bg-background/50 backdrop-blur-xl animate-in slide-in-from-left duration-300">
      <div className="p-4 border-b border-border/50 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Search className="w-4 h-4" /> 全局搜索
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-md transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="在所有笔记中搜索..."
            className="w-full pl-10 pr-4 py-2 bg-muted/50 border border-border/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-nova/20 transition-all"
          />
        </div>
        <div className="qz-search-filter-row flex flex-wrap gap-1.5">
          {SEARCH_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              data-testid={filter.testId}
              onClick={() => setScope(filter.id)}
              className={`qz-search-filter-chip ${scope === filter.id ? 'is-active' : ''}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {results.length > 0 ? (
          <div className="space-y-1">
            {results.map(({ note, snippet }) => (
              <button
                key={note.id}
                onClick={() => handleSelectNote(note)}
                className="w-full text-left p-3 rounded-xl hover:bg-muted/50 transition-all border border-transparent hover:border-border/30 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <FileText className="w-4 h-4 text-muted-foreground group-hover:text-nova transition-colors" />
                  <span className="text-sm font-medium truncate">
                    {highlightText(note.title || '无标题', query)}
                  </span>
                </div>
                {snippet && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {highlightText(snippet, query)}
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : query.length >= 2 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground text-sm">未找到与 "{query}" 相关的结果</p>
          </div>
        ) : (
          <div className="qz-search-empty space-y-3 p-2">
            <section className="qz-search-empty-section">
              <div className="qz-search-empty-title">
                <Clock size={13} />
                最近搜索
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setQuery(item)}
                    className="qz-search-suggestion-chip"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>

            <section className="qz-search-empty-section">
              <div className="qz-search-empty-title">
                <FileText size={13} />
                最近打开
              </div>
              <div className="space-y-1">
                {recentOpened.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => handleSelectNote(note)}
                    className="qz-search-recent-note"
                  >
                    <span className="truncate">{note.title || '无标题'}</span>
                    {note.tags?.[0] && <span className="qz-search-recent-tag">#{note.tags[0]}</span>}
                  </button>
                ))}
              </div>
            </section>

            <section className="qz-search-empty-section">
              <div className="qz-search-empty-title">
                <Hash size={13} />
                搜索语法
              </div>
              <div className="qz-search-syntax-grid">
                <span><Tag size={11} /> tag:灵感</span>
                <span>title:会议</span>
                <span>folder:项目</span>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default GlobalSearchPanel
