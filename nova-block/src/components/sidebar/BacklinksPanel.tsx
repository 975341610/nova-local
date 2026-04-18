import React, { useMemo } from 'react';
import { Link as LinkIcon, FileText, ArrowRightLeft, RefreshCw } from 'lucide-react';
import type { Note } from '../../lib/types';

interface BacklinksPanelProps {
  currentNoteId: number | null;
  notes: Note[];
  onSelectNote: (note: Note) => void;
}

function extractLinkedIds(note: Note | undefined | null) {
  if (!note) {
    return [];
  }

  if (Array.isArray(note.links) && note.links.length > 0) {
    return Array.from(new Set(note.links.map(Number).filter(Number.isFinite)));
  }

  if (!note.content) {
    return [];
  }

  const patterns = [/data-id="(\d+)"/g, /data-wiki-id="(\d+)"/g];
  const ids = new Set<number>();

  for (const pattern of patterns) {
    for (const match of note.content.matchAll(pattern)) {
      const nextId = Number(match[1]);
      if (Number.isFinite(nextId)) {
        ids.add(nextId);
      }
    }
  }

  return Array.from(ids);
}

const BacklinksPanel: React.FC<BacklinksPanelProps> = ({ currentNoteId, notes, onSelectNote }) => {
  const { links, backlinks } = useMemo(() => {
    if (!currentNoteId) {
      return { links: [] as Note[], backlinks: [] as Note[] };
    }

    try {
      const current = notes.find((note) => note.id === currentNoteId);
      const forwardLinkIds = extractLinkedIds(current);

      return {
        links: notes.filter((note) => forwardLinkIds.includes(note.id)),
        backlinks: notes.filter((note) => note.id !== currentNoteId && extractLinkedIds(note).includes(currentNoteId)),
      };
    } catch (error) {
      console.error('Failed to parse links:', error);
      return { links: [] as Note[], backlinks: [] as Note[] };
    }
  }, [currentNoteId, notes]);

  if (!currentNoteId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4 opacity-40">
        <ArrowRightLeft size={32} className="text-muted-foreground" />
        <div className="text-xs text-muted-foreground">选择一篇笔记以查看它的双向链接</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background/30">
      <div className="p-4 flex items-center justify-between border-b border-border/10">
        <div className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest flex items-center gap-2">
          <ArrowRightLeft size={12} />
          双向链接
        </div>
        <button
          onClick={() => undefined}
          className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground transition-all"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-6">
        <section className="space-y-3">
          <h4 className="px-2 text-[10px] font-semibold text-primary/60 flex items-center gap-1.5">
            <LinkIcon size={10} className="rotate-45" />
            反向链接
          </h4>
          <div className="space-y-1">
            {backlinks.length > 0 ? (
              backlinks.map((note) => (
                <button
                  key={note.id}
                  onClick={() => onSelectNote(note)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-xl text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-all text-left group"
                >
                  <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/5 text-primary group-hover:bg-primary/10 transition-colors shrink-0">
                    {note.icon || <FileText size={14} />}
                  </div>
                  <span className="truncate flex-1">{note.title}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-[10px] text-muted-foreground/40 italic">暂时没有笔记链接到这里</div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="px-2 text-[10px] font-semibold text-muted-foreground/60 flex items-center gap-1.5">
            <LinkIcon size={10} />
            正向链接
          </h4>
          <div className="space-y-1">
            {links.length > 0 ? (
              links.map((note) => (
                <button
                  key={note.id}
                  onClick={() => onSelectNote(note)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-xl text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-all text-left group"
                >
                  <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent text-muted-foreground/50 group-hover:text-primary group-hover:bg-primary/5 transition-colors shrink-0">
                    {note.icon || <FileText size={14} />}
                  </div>
                  <span className="truncate flex-1">{note.title}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-[10px] text-muted-foreground/40 italic">这篇笔记没有引用其他笔记</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default BacklinksPanel;
