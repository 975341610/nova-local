import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  FileText,
  Command,
  ArrowRight,
  BookOpen,
  Calendar as CalendarIcon,
  Share2,
  Settings,
  Plus,
  FileDown,
  Moon,
  Sun,
} from 'lucide-react';
import { api } from '../../lib/api';
import { getNotesMissingContent, searchNotes } from '../../lib/searchUtils';
import type { Note } from '../../lib/types';
import { useNoteStore } from '../../store/useNoteStore';

/**
 * Command Palette 动作定义。
 * 除了跳转笔记，还可以触发编辑器/视图/设置级命令。
 */
export type PaletteAction = {
  id: string;
  label: string;
  hint?: string;
  keywords?: string[];
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  section?: string;
  run: () => void;
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNote: (note: Note) => void;
  actions?: PaletteAction[];
}

type Entry =
  | { kind: 'note'; note: Note }
  | { kind: 'action'; action: PaletteAction };

const HYDRATION_BATCH_SIZE = 8;

const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectNote,
  actions = [],
}) => {
  const notes = useNoteStore((state) => state.notes);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hydratedById, setHydratedById] = useState<Record<number, Note>>({});
  const requestedIdsRef = useRef<Set<number>>(new Set());

  const searchableNotes = useMemo(
    () =>
      notes.map((note) =>
        note.content !== undefined ? note : hydratedById[note.id] ?? note,
      ),
    [hydratedById, notes],
  );

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => {
      const hay = [a.label, a.hint ?? '', ...(a.keywords ?? [])]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, actions]);

  const filteredNotes = useMemo(() => {
    if (!query.trim()) {
      return searchableNotes.filter((n) => !n.is_folder).slice(0, 10);
    }
    return searchNotes(searchableNotes, query, 10).map((result) => result.note);
  }, [query, searchableNotes]);

  const entries: Entry[] = useMemo(() => {
    const list: Entry[] = [];
    for (const a of filteredActions) list.push({ kind: 'action', action: a });
    for (const n of filteredNotes) list.push({ kind: 'note', note: n });
    return list;
  }, [filteredActions, filteredNotes]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Hydrate missing note contents for fuzzy search against body
  useEffect(() => {
    let cancelled = false;
    if (!isOpen || query.trim().length < 2) {
      return () => {
        cancelled = true;
      };
    }

    const missingNotes = getNotesMissingContent(searchableNotes, HYDRATION_BATCH_SIZE).filter(
      (note) => !requestedIdsRef.current.has(note.id),
    );

    if (missingNotes.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    for (const note of missingNotes) {
      requestedIdsRef.current.add(note.id);
      void api
        .getNote(note.id)
        .then((fullNote) => {
          if (cancelled) return;
          setHydratedById((prev) => ({ ...prev, [fullNote.id]: fullNote }));
        })
        .catch((error) => {
          requestedIdsRef.current.delete(note.id);
          console.error('Failed to hydrate note content for command palette:', error);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, query, searchableNotes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, entries.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(
          (prev) => (prev - 1 + entries.length) % Math.max(1, entries.length),
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const entry = entries[selectedIndex];
        if (!entry) return;
        if (entry.kind === 'note') {
          onSelectNote(entry.note);
          onClose();
        } else {
          entry.action.run();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, entries, selectedIndex, onSelectNote, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0"
            style={{
              background: 'color-mix(in srgb, var(--nv-color-bg) 65%, transparent)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -12 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className="nv-glass relative w-full max-w-2xl overflow-hidden"
          >
            <div
              className="flex items-center px-4 py-3"
              style={{ borderBottom: '1px solid var(--nv-color-border)' }}
            >
              <Search size={18} style={{ color: 'var(--nv-color-fg-muted)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="输入命令或搜索笔记…"
                className="flex-1 bg-transparent border-none outline-none ml-3"
                style={{
                  color: 'var(--nv-color-fg)',
                  fontSize: 16,
                  fontFamily: 'var(--nv-font-sans)',
                }}
              />
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  fontSize: 11,
                  color: 'var(--nv-color-fg-muted)',
                  background: 'var(--nv-color-surface-3)',
                  border: '1px solid var(--nv-color-border)',
                  borderRadius: 'var(--nv-radius-sm)',
                }}
              >
                <Command size={12} />
                <span>K</span>
              </div>
            </div>

            <div
              className="max-h-[60vh] overflow-y-auto custom-scrollbar"
              style={{ padding: 6 }}
            >
              {entries.length === 0 ? (
                <div
                  style={{
                    padding: '48px 0',
                    textAlign: 'center',
                    color: 'var(--nv-color-fg-subtle)',
                    fontSize: 13,
                  }}
                >
                  无匹配项
                </div>
              ) : (
                renderEntries({
                  entries,
                  selectedIndex,
                  setSelectedIndex,
                  onPick: (entry) => {
                    if (entry.kind === 'note') {
                      onSelectNote(entry.note);
                    } else {
                      entry.action.run();
                    }
                    onClose();
                  },
                })
              )}
            </div>

            <div
              className="flex items-center justify-between px-4 py-2"
              style={{
                borderTop: '1px solid var(--nv-color-border)',
                fontSize: 11,
                color: 'var(--nv-color-fg-muted)',
                background: 'var(--nv-color-surface-1)',
              }}
            >
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="nv-kbd">↑↓</kbd> 选择
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <kbd className="nv-kbd">↵</kbd> 执行
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="nv-kbd">Esc</kbd> 关闭
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

function renderEntries({
  entries,
  selectedIndex,
  setSelectedIndex,
  onPick,
}: {
  entries: Entry[];
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  onPick: (entry: Entry) => void;
}) {
  // Group by section
  const actionEntries = entries.filter((e) => e.kind === 'action');
  const noteEntries = entries.filter((e) => e.kind === 'note');

  const indexOf = (e: Entry) => entries.indexOf(e);

  return (
    <>
      {actionEntries.length > 0 && (
        <>
          <div
            style={{
              padding: '8px 10px 4px',
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--nv-color-fg-subtle)',
            }}
          >
            命令
          </div>
          {actionEntries.map((entry) => {
            const idx = indexOf(entry);
            const a = (entry as Extract<Entry, { kind: 'action' }>).action;
            const Icon = a.icon ?? Command;
            return (
              <button
                key={`action-${a.id}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => onPick(entry)}
                className="nv-transition"
                style={rowStyle(idx === selectedIndex)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 'var(--nv-radius-sm)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background:
                        idx === selectedIndex
                          ? 'var(--nv-color-accent-muted)'
                          : 'var(--nv-color-bg-subtle)',
                      color:
                        idx === selectedIndex
                          ? 'var(--nv-color-accent-fg)'
                          : 'var(--nv-color-fg-muted)',
                    }}
                  >
                    <Icon size={14} />
                  </span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13.5, color: 'var(--nv-color-fg)' }}>
                      {a.label}
                    </div>
                    {a.hint && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--nv-color-fg-subtle)',
                          marginTop: 1,
                        }}
                      >
                        {a.hint}
                      </div>
                    )}
                  </div>
                </div>
                <ArrowRight
                  size={14}
                  style={{
                    opacity: idx === selectedIndex ? 1 : 0,
                    color: 'var(--nv-color-fg-muted)',
                    transition: 'opacity var(--nv-motion-fast)',
                  }}
                />
              </button>
            );
          })}
        </>
      )}
      {noteEntries.length > 0 && (
        <>
          <div
            style={{
              padding: '8px 10px 4px',
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--nv-color-fg-subtle)',
            }}
          >
            笔记
          </div>
          {noteEntries.map((entry) => {
            const idx = indexOf(entry);
            const n = (entry as Extract<Entry, { kind: 'note' }>).note;
            return (
              <button
                key={`note-${n.id}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => onPick(entry)}
                className="nv-transition"
                style={rowStyle(idx === selectedIndex)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 'var(--nv-radius-sm)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background:
                        idx === selectedIndex
                          ? 'var(--nv-color-accent-muted)'
                          : 'var(--nv-color-bg-subtle)',
                      color:
                        idx === selectedIndex
                          ? 'var(--nv-color-accent-fg)'
                          : 'var(--nv-color-fg-muted)',
                    }}
                  >
                    <FileText size={14} />
                  </span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13.5, color: 'var(--nv-color-fg)' }}>
                      {n.title || '无标题'}
                    </div>
                    {n.tags && n.tags.length > 0 && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--nv-color-fg-subtle)',
                          marginTop: 1,
                        }}
                      >
                        {n.tags.map((t) => `#${t}`).join('  ')}
                      </div>
                    )}
                  </div>
                </div>
                <ArrowRight
                  size={14}
                  style={{
                    opacity: idx === selectedIndex ? 1 : 0,
                    color: 'var(--nv-color-fg-muted)',
                    transition: 'opacity var(--nv-motion-fast)',
                  }}
                />
              </button>
            );
          })}
        </>
      )}
    </>
  );
}

function rowStyle(active: boolean): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    border: 'none',
    borderRadius: 'var(--nv-radius-md)',
    background: active ? 'var(--nv-color-accent-muted)' : 'transparent',
    cursor: 'pointer',
    marginBottom: 2,
  };
}

export { BookOpen, CalendarIcon, Share2, Settings, Plus, FileDown, Moon, Sun };
export default CommandPalette;
