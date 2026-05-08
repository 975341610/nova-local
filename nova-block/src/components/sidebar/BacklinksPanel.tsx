/**
 * v0.21.4 · BacklinksPanel（合并 Rich Summary Cards）
 *
 * - 每条反向/正向链接都可以展开成"富媒体摘要卡片"：
 *     · 封面图（从正文正则抽取 img）
 *     · 摘要（note.summary 或正文前 N 字）
 *     · 标签 / 更新时间
 * - 折叠态仅显示标题与图标（保持原 v0.19 紧凑形态）
 * - 顶部提供"展开全部 / 收起全部"切换
 */
import React, { useMemo, useState } from 'react';
import {
  Link as LinkIcon,
  FileText,
  ArrowRightLeft,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
} from 'lucide-react';
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

function extractCover(content?: string | null): string | null {
  if (!content) return null;
  const imgTag = content.match(/<img\s[^>]*src=["']([^"']+)["']/i);
  if (imgTag?.[1]) return imgTag[1];
  const mdImg = content.match(/!\[[^\]]*\]\(([^)\s]+)/);
  if (mdImg?.[1]) return mdImg[1];
  return null;
}

function extractExcerpt(content?: string | null, max = 160): string {
  if (!content) return '';
  const stripped = content
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_`~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= max) return stripped;
  return stripped.slice(0, max) + '…';
}

interface LinkRowProps {
  note: Note;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  accent: 'backward' | 'forward';
}

const LinkRow: React.FC<LinkRowProps> = ({ note, expanded, onToggleExpand, onSelect, accent }) => {
  const cover = useMemo(() => extractCover(note.content), [note.content]);
  const excerpt = useMemo(
    () => note.summary?.trim() || extractExcerpt(note.content),
    [note.summary, note.content],
  );
  const tags = note.tags ?? [];
  const updatedAt = note.updated_at;

  const iconBadgeClass =
    accent === 'backward'
      ? 'bg-primary/5 text-primary group-hover:bg-primary/10'
      : 'bg-accent text-muted-foreground/50 group-hover:text-primary group-hover:bg-primary/5';

  return (
    <div
      className={`rounded-xl border border-transparent transition-all ${
        expanded ? 'bg-accent/30 border-border/20' : 'hover:bg-accent/30'
      }`}
    >
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          onClick={onToggleExpand}
          className="shrink-0 p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-accent/50 transition-all"
          aria-label={expanded ? '收起摘要' : '展开摘要'}
          title={expanded ? '收起摘要' : '展开摘要'}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button
          onClick={onSelect}
          className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground transition-all text-left group"
        >
          <div
            className={`flex items-center justify-center w-6 h-6 rounded-lg transition-colors shrink-0 ${iconBadgeClass}`}
          >
            {note.icon ? (
              <span className="text-[13px]">{note.icon}</span>
            ) : (
              <FileText size={14} />
            )}
          </div>
          <span className="truncate flex-1">{note.title || 'Untitled'}</span>
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          {cover ? (
            <div
              className="w-full aspect-[16/9] rounded-lg bg-cover bg-center bg-muted/30 border border-border/20"
              style={{ backgroundImage: `url(${JSON.stringify(cover)})` }}
            />
          ) : (
            <div className="w-full aspect-[16/9] rounded-lg flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/50 bg-gradient-to-br from-accent/40 to-transparent border border-border/20">
              <ImageIcon size={12} />
              无封面
            </div>
          )}
          <div className="text-[11px] leading-relaxed text-muted-foreground/90 line-clamp-4">
            {excerpt || <span className="italic text-muted-foreground/50">（空笔记）</span>}
          </div>
          {(tags.length > 0 || updatedAt) && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1 min-w-0 flex-1">
                {tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/80"
                  >
                    #{t}
                  </span>
                ))}
              </div>
              {updatedAt && (
                <div className="text-[9px] font-mono text-muted-foreground/50 shrink-0">
                  {new Date(updatedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const BacklinksPanel: React.FC<BacklinksPanelProps> = ({ currentNoteId, notes, onSelectNote }) => {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const { links, backlinks } = useMemo(() => {
    if (!currentNoteId) {
      return { links: [] as Note[], backlinks: [] as Note[] };
    }

    try {
      const current = notes.find((note) => note.id === currentNoteId);
      const forwardLinkIds = extractLinkedIds(current);

      return {
        links: notes.filter((note) => forwardLinkIds.includes(note.id)),
        backlinks: notes.filter(
          (note) => note.id !== currentNoteId && extractLinkedIds(note).includes(currentNoteId),
        ),
      };
    } catch (error) {
      console.error('Failed to parse links:', error);
      return { links: [] as Note[], backlinks: [] as Note[] };
    }
  }, [currentNoteId, notes]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allIds = useMemo(
    () => [...backlinks.map((n) => n.id), ...links.map((n) => n.id)],
    [backlinks, links],
  );
  const allExpanded = allIds.length > 0 && allIds.every((id) => expandedIds.has(id));

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(allIds));
    }
  };

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
        <div className="flex items-center gap-1">
          <button
            onClick={toggleAll}
            disabled={allIds.length === 0}
            className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            title={allExpanded ? '收起全部摘要' : '展开全部摘要'}
          >
            {allExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={() => undefined}
            className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground transition-all"
            title="刷新"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-6">
        <section className="space-y-3">
          <h4 className="px-2 text-[10px] font-semibold text-primary/60 flex items-center gap-1.5">
            <LinkIcon size={10} className="rotate-45" />
            反向链接
            {backlinks.length > 0 && (
              <span className="text-muted-foreground/40 font-normal ml-1">({backlinks.length})</span>
            )}
          </h4>
          <div className="space-y-1">
            {backlinks.length > 0 ? (
              backlinks.map((note) => (
                <LinkRow
                  key={note.id}
                  note={note}
                  expanded={expandedIds.has(note.id)}
                  onToggleExpand={() => toggleExpand(note.id)}
                  onSelect={() => onSelectNote(note)}
                  accent="backward"
                />
              ))
            ) : (
              <div className="px-3 py-4 text-[10px] text-muted-foreground/40 italic">
                暂时没有笔记链接到这里
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="px-2 text-[10px] font-semibold text-muted-foreground/60 flex items-center gap-1.5">
            <LinkIcon size={10} />
            正向链接
            {links.length > 0 && (
              <span className="text-muted-foreground/40 font-normal ml-1">({links.length})</span>
            )}
          </h4>
          <div className="space-y-1">
            {links.length > 0 ? (
              links.map((note) => (
                <LinkRow
                  key={note.id}
                  note={note}
                  expanded={expandedIds.has(note.id)}
                  onToggleExpand={() => toggleExpand(note.id)}
                  onSelect={() => onSelectNote(note)}
                  accent="forward"
                />
              ))
            ) : (
              <div className="px-3 py-4 text-[10px] text-muted-foreground/40 italic">
                这篇笔记没有引用其他笔记
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default BacklinksPanel;
