import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search, FileText, X } from 'lucide-react'

import { api } from '../../lib/api'
import { getNotesMissingContent, searchNotes } from '../../lib/searchUtils'
import type { Note } from '../../lib/types'

interface GlobalSearchPanelProps {
  notes: Note[]
  onSelectNote: (note: Note) => void
  onClose: () => void
}

const HYDRATION_BATCH_SIZE = 8

const GlobalSearchPanel: React.FC<GlobalSearchPanelProps> = ({
  notes,
  onSelectNote,
  onClose,
}) => {
  const [query, setQuery] = useState('')
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

  const results = useMemo(() => searchNotes(searchableNotes, query), [query, searchableNotes])

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'))
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
    <div className="flex flex-col h-full bg-background/50 backdrop-blur-xl animate-in slide-in-from-left duration-300">
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
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {results.length > 0 ? (
          <div className="space-y-1">
            {results.map(({ note, snippet }) => (
              <button
                key={note.id}
                onClick={() => onSelectNote(note)}
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
          <div className="py-12 text-center">
            <p className="text-muted-foreground text-xs opacity-60">输入至少两个字符开始搜索</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default GlobalSearchPanel
