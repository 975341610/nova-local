import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquare, Paperclip, Plus, Send, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { aiMarkdownToHtml } from '../../lib/aiMarkdown';
import type { Citation, ImportPreviewItem, ImportTemplateId } from '../../lib/types';
import { useNoteStore } from '../../store/useNoteStore';

type ImportSourceRef = {
  kind?: string;
  title?: string;
  name?: string;
  url?: string;
};

type ImportChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
};

type ComposerMode = 'ask' | 'source';

type UploadedFileRef = {
  url: string;
  name: string;
  size?: number;
  type?: string;
};

const getImportChatStorageKey = (batchId: string) => `nova.ai.importChat.${batchId}`;

const readImportChatMessages = (batchId: string): ImportChatMessage[] => {
  if (!batchId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getImportChatStorageKey(batchId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ImportChatMessage => (
      item !== null &&
      typeof item === 'object' &&
      (item.role === 'user' || item.role === 'assistant') &&
      typeof item.text === 'string'
    ));
  } catch {
    return [];
  }
};

const writeImportChatMessages = (batchId: string, messages: ImportChatMessage[]) => {
  if (!batchId || typeof window === 'undefined') return;
  const key = getImportChatStorageKey(batchId);
  if (!messages.length) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(messages.slice(-40)));
};

const mergeImportProperties = (
  currentProperties: Array<{ name: string; type: string; value: string }> = [],
  sourceType: string,
  metadata: Record<string, unknown>,
) => {
  const nextProperties = currentProperties
    .filter((property) => !['import_batch_id', 'import_source_type', 'import_template_id', 'import_sources'].includes(property.name))
    .map(({ name, type, value }) => ({ name, type: type as 'text', value }));
  return [...nextProperties, ...buildImportNoteProperties(sourceType, metadata)];
};

interface AIImportPanelProps {
  selectedNoteId?: string | null;
  onSelectNoteId?: (noteId: string) => void;
}

const buildImportNoteProperties = (sourceType: string, metadata: Record<string, unknown>) => {
  const importBatchId = typeof metadata.import_batch_id === 'string' ? metadata.import_batch_id : '';
  const sourceRefs = Array.isArray(metadata.source_refs) ? metadata.source_refs : [];
  const templateId = typeof metadata.template_id === 'string' ? metadata.template_id : 'general';
  return [
    ...(importBatchId ? [{ name: 'import_batch_id', type: 'text' as const, value: importBatchId }] : []),
    { name: 'import_source_type', type: 'text' as const, value: sourceType || 'unknown' },
    { name: 'import_template_id', type: 'text' as const, value: templateId },
    { name: 'import_sources', type: 'text' as const, value: JSON.stringify(sourceRefs) },
  ];
};

const getImportBatchIdFromNote = (note: { properties?: Array<{ name: string; value: string }> } | undefined) => {
  const property = note?.properties?.find((item) => item.name === 'import_batch_id');
  return property?.value || '';
};

const getImportSourcesFromNote = (note: { properties?: Array<{ name: string; value: string }> } | undefined): ImportSourceRef[] => {
  const rawValue = note?.properties?.find((item) => item.name === 'import_sources')?.value || '';
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ImportSourceRef => item !== null && typeof item === 'object');
  } catch {
    return [];
  }
};

const parseAiImportUrls = (value: string) => {
  const seen = new Set<string>();
  return value
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getVideoEmbedUrl = (url: string) => {
  const biliMatch = url.match(/(?:https?:\/\/)?(?:www\.|m\.)?(?:bilibili\.com\/video\/|b23\.tv\/)(BV[\w]+)/i)
    || url.match(/[?&]bvid=(BV[\w]+)/i)
    || url.match(/\/(BV[\w]+)/i);
  if (biliMatch) {
    return `https://player.bilibili.com/player.html?bvid=${biliMatch[1]}&high_quality=1&danmaku=0&autoplay=0`;
  }
  const youtubeMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }
  return '';
};

const buildSourcePreviewHtml = (sourceRefs: ImportSourceRef[]) => {
  const blocks = sourceRefs
    .filter((source) => source.url)
    .map((source) => {
      const url = source.url || '';
      const title = source.title || source.name || url;
      const embedUrl = getVideoEmbedUrl(url);
      if (embedUrl) {
        return [
          '<figure data-ai-source-card="video">',
          `<iframe src="${escapeHtml(embedUrl)}" data-embed="true"></iframe>`,
          `<figcaption><strong>${escapeHtml(title)}</strong><br><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></figcaption>`,
          '</figure>',
        ].join('\n');
      }
      return [
        '<blockquote data-ai-source-card="link">',
        `<p><strong>${escapeHtml(title)}</strong><br><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></p>`,
        '</blockquote>',
      ].join('\n');
    });
  if (!blocks.length) return '';
  return ['<h2>来源预览</h2>', ...blocks].join('\n');
};

const buildAttachmentHtml = (uploads: UploadedFileRef[]) => {
  if (!uploads.length) return '';
  const items = uploads.map((file) => {
    const type = file.type || '';
    const url = file.url;
    const name = file.name || url;
    if (type.startsWith('image/')) {
      return `<li><p><strong>${escapeHtml(name)}</strong></p><img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" /></li>`;
    }
    if (type.startsWith('video/')) {
      return `<li><p><strong>${escapeHtml(name)}</strong></p><video src="${escapeHtml(url)}" controls="true"></video></li>`;
    }
    if (type.startsWith('audio/')) {
      return `<li><p><strong>${escapeHtml(name)}</strong></p><audio src="${escapeHtml(url)}" controls="true"></audio></li>`;
    }
    return `<li><p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a></p></li>`;
  });
  return ['<h2>附件</h2>', '<ul>', ...items, '</ul>'].join('\n');
};

const composeGeneratedImportHtml = (
  markdown: string,
  sourceRefs: ImportSourceRef[],
  uploads: UploadedFileRef[] = [],
) => [
  aiMarkdownToHtml(markdown),
  buildSourcePreviewHtml(sourceRefs),
  buildAttachmentHtml(uploads),
].filter(Boolean).join('\n');

export const AIImportPanel = ({ selectedNoteId, onSelectNoteId }: AIImportPanelProps) => {
  const notes = useNoteStore((state) => state.notes);
  const setNotes = useNoteStore((state) => state.setNotes);
  const aiImportInputRef = useRef<HTMLInputElement>(null);
  const [isAiImporting, setIsAiImporting] = useState(false);
  const [aiImportFiles, setAiImportFiles] = useState<File[]>([]);
  const [aiImportUrls, setAiImportUrls] = useState<string[]>([]);
  const [aiImportUrlDraft, setAiImportUrlDraft] = useState('');
  const [aiImportPreview, setAiImportPreview] = useState<ImportPreviewItem[]>([]);
  const [aiImportTemplate, setAiImportTemplate] = useState<ImportTemplateId>('general');
  const [aiImportError, setAiImportError] = useState<string | null>(null);
  const [lastImportBatchId, setLastImportBatchId] = useState('');
  const [lastImportSources, setLastImportSources] = useState<ImportSourceRef[]>([]);
  const [importBatchQuestion, setImportBatchQuestion] = useState('');
  const [importBatchMessages, setImportBatchMessages] = useState<ImportChatMessage[]>([]);
  const [isAskingImportBatch, setIsAskingImportBatch] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>('source');
  const [hydratedImportBatchId, setHydratedImportBatchId] = useState('');
  const [aiImportStatus, setAiImportStatus] = useState('');

  const selectedNoteForImport = useMemo(() => {
    if (!selectedNoteId) return undefined;
    return notes.find((note) => String(note.id) === String(selectedNoteId));
  }, [notes, selectedNoteId]);

  const selectedImportBatchId = useMemo(() => getImportBatchIdFromNote(selectedNoteForImport), [selectedNoteForImport]);
  const selectedImportSources = useMemo(() => getImportSourcesFromNote(selectedNoteForImport), [selectedNoteForImport]);
  const activeImportBatchId = lastImportBatchId || selectedImportBatchId;
  const activeImportSources = selectedImportSources.length > 0 ? selectedImportSources : lastImportSources;
  const canAppendToSelectedNote = Boolean(selectedNoteForImport && !selectedNoteForImport.is_folder);

  useEffect(() => {
    if (!activeImportBatchId) {
      setImportBatchMessages([]);
      setComposerMode('source');
      setHydratedImportBatchId('');
      return;
    }
    setImportBatchMessages(readImportChatMessages(activeImportBatchId));
    setComposerMode('ask');
    setHydratedImportBatchId(activeImportBatchId);
  }, [activeImportBatchId]);

  useEffect(() => {
    if (!activeImportBatchId || hydratedImportBatchId !== activeImportBatchId) return;
    writeImportChatMessages(activeImportBatchId, importBatchMessages);
  }, [activeImportBatchId, hydratedImportBatchId, importBatchMessages]);

  const clearImportDraft = () => {
    setAiImportFiles([]);
    setAiImportUrls([]);
    setAiImportPreview([]);
    setAiImportError(null);
    setAiImportStatus('');
    setLastImportBatchId('');
    setLastImportSources([]);
    setImportBatchQuestion('');
    setImportBatchMessages([]);
    setComposerMode(activeImportBatchId ? 'ask' : 'source');
  };

  const previewFiles = async (files: File[]) => {
    if (!files.length || isAiImporting) return;

    setIsAiImporting(true);
    setAiImportError(null);
    setAiImportStatus('正在读取文件...');
    try {
      const preview = await api.previewImportFiles(files);
      setAiImportFiles(files);
      setAiImportUrls([]);
      setAiImportPreview(preview.items || []);
      setAiImportStatus('文件预览已生成');
    } catch (error) {
      console.error('AI import preview failed:', error);
      setAiImportFiles([]);
      setAiImportPreview([]);
      setAiImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAiImporting(false);
    }
  };

  const handleAIImportPreview = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    await previewFiles(files);
  };

  const previewUrls = async (urls: string[]) => {
    if (!urls.length || isAiImporting) return;
    setIsAiImporting(true);
    setAiImportError(null);
    setAiImportStatus('正在读取链接...');
    try {
      const preview = await api.previewImportUrls(urls);
      setAiImportFiles([]);
      setAiImportUrls(urls);
      setAiImportPreview(preview.items || []);
      setAiImportStatus('链接预览已生成');
    } catch (error) {
      console.error('AI import URL preview failed:', error);
      setAiImportFiles([]);
      setAiImportUrls([]);
      setAiImportPreview([]);
      setAiImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAiImporting(false);
    }
  };

  const handleAIImportUrlPreview = async () => {
    const urls = parseAiImportUrls(aiImportUrlDraft);
    await previewUrls(urls);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) {
      void previewFiles(files);
      return;
    }

    const droppedText =
      event.dataTransfer.getData('text/uri-list') ||
      event.dataTransfer.getData('text/plain') ||
      '';
    const urls = parseAiImportUrls(droppedText);
    if (urls.length > 0) {
      setAiImportUrlDraft(urls.join('\n'));
      void previewUrls(urls);
    }
  };

  const generateImportContent = () => (
    aiImportUrls.length
      ? api.importUrlsAndGenerateNote(aiImportUrls, { templateId: aiImportTemplate })
      : api.importAndGenerateNote(aiImportFiles, { templateId: aiImportTemplate })
  );

  const getSourceRefsFromMetadata = (metadata: Record<string, unknown> = {}) => {
    const sourceRefs = Array.isArray(metadata.source_refs) ? metadata.source_refs : [];
    return sourceRefs.filter((item): item is ImportSourceRef => item !== null && typeof item === 'object');
  };

  const uploadLocalImportFiles = async (noteId: number | string) => {
    if (!aiImportFiles.length) return [];
    setAiImportStatus('正在插入本地附件...');
    return api.upload(aiImportFiles, noteId) as Promise<UploadedFileRef[]>;
  };

  const rememberGeneratedImport = (metadata: Record<string, unknown> = {}) => {
    const importBatchId = typeof metadata.import_batch_id === 'string' ? metadata.import_batch_id : '';
    setLastImportBatchId(importBatchId);
    setLastImportSources(getSourceRefsFromMetadata(metadata));
    setImportBatchQuestion('');
    setImportBatchMessages([]);
    setAiImportFiles([]);
    setAiImportUrls([]);
    setAiImportPreview([]);
    setAiImportUrlDraft('');
    setComposerMode(importBatchId ? 'ask' : 'source');
    setAiImportStatus(importBatchId ? '已生成，可继续提问' : '已生成');
  };

  const handleConfirmAIImportGenerate = async () => {
    if ((!aiImportFiles.length && !aiImportUrls.length) || isAiImporting) return;

    setIsAiImporting(true);
    setAiImportError(null);
    setAiImportStatus('正在生成结构化笔记...');
    try {
      const generated = await generateImportContent();
      const sourceRefs = getSourceRefsFromMetadata(generated.metadata || {});
      const nextNote = await api.createNote({
        title: generated.title,
        icon: 'AI',
        content: composeGeneratedImportHtml(generated.markdown, sourceRefs),
        type: 'note',
        tags: ['AI Import'],
        properties: buildImportNoteProperties(generated.source_type, generated.metadata || {}),
        notebook_id: null,
        parent_id: null,
        is_title_manually_edited: true,
        background_paper: 'none',
        sort_key: 'm',
        stickers: [],
        sticky_notes: [],
      });
      let completedNote = nextNote;
      const uploads = await uploadLocalImportFiles(nextNote.id);
      if (uploads.length > 0) {
        completedNote = await api.updateNote(Number(nextNote.id), {
          content: composeGeneratedImportHtml(generated.markdown, sourceRefs, uploads),
        });
      }
      setNotes((prev) => {
        const exists = prev.some((note) => note.id === completedNote.id);
        return exists
          ? prev.map((note) => (note.id === completedNote.id ? { ...note, ...completedNote } : note))
          : [...prev, completedNote];
      });
      onSelectNoteId?.(String(completedNote.id));
      rememberGeneratedImport(generated.metadata || {});
    } catch (error) {
      console.error('AI import generate failed:', error);
      setAiImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAiImporting(false);
    }
  };

  const handleAppendAIImportToCurrentNote = async () => {
    if ((!aiImportFiles.length && !aiImportUrls.length) || isAiImporting || !selectedNoteForImport || selectedNoteForImport.is_folder) return;

    setIsAiImporting(true);
    setAiImportError(null);
    setAiImportStatus('正在生成追加内容...');
    try {
      const generated = await generateImportContent();
      const sourceRefs = getSourceRefsFromMetadata(generated.metadata || {});
      const latestNote = selectedNoteForImport.content === undefined
        ? await api.getNote(Number(selectedNoteForImport.id))
        : selectedNoteForImport;
      const existingContent = latestNote.content || '';
      const uploads = await uploadLocalImportFiles(latestNote.id);
      const generatedContent = composeGeneratedImportHtml(generated.markdown, sourceRefs, uploads);
      const appendedContent = [
        existingContent,
        '<hr data-ai-import-update="true" />',
        `<h2>${escapeHtml(generated.title || 'AI 资料更新')}</h2>`,
        generatedContent,
      ].filter(Boolean).join('\n');
      const updatedNote = await api.updateNote(Number(latestNote.id), {
        content: appendedContent,
        properties: mergeImportProperties(latestNote.properties || [], generated.source_type, generated.metadata || {}),
      });
      setNotes((prev) => prev.map((note) => (
        String(note.id) === String(updatedNote.id) ? { ...note, ...updatedNote } : note
      )));
      onSelectNoteId?.(String(updatedNote.id));
      rememberGeneratedImport(generated.metadata || {});
    } catch (error) {
      console.error('AI import append failed:', error);
      setAiImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAiImporting(false);
    }
  };

  const handleAskImportBatch = async () => {
    const question = importBatchQuestion.trim();
    if (!activeImportBatchId || !question || isAskingImportBatch) return;

    setIsAskingImportBatch(true);
    setAiImportError(null);
    setAiImportStatus('问题已发送，AI 正在生成...');
    const timestamp = Date.now();
    setImportBatchQuestion('');
    setImportBatchMessages((prev) => [
      ...prev,
      { id: `${timestamp}-user`, role: 'user', text: question },
    ]);
    try {
      const response = await api.askImportBatch(activeImportBatchId, question);
      setImportBatchMessages((prev) => [
        ...prev,
        {
          id: `${timestamp}-assistant`,
          role: 'assistant',
          text: response.answer,
          citations: response.citations || [],
        },
      ]);
      setAiImportStatus('AI 已回复');
    } catch (error) {
      console.error('AI import batch ask failed:', error);
      setAiImportError(error instanceof Error ? error.message : String(error));
      setImportBatchMessages((prev) => [
        ...prev,
        {
          id: `${timestamp}-assistant-error`,
          role: 'assistant',
          text: `生成失败：${error instanceof Error ? error.message : String(error)}`,
          citations: [],
        },
      ]);
    } finally {
      setIsAskingImportBatch(false);
    }
  };

  const handleComposerSend = () => {
    if (activeImportBatchId && composerMode === 'ask' && importBatchQuestion.trim()) {
      void handleAskImportBatch();
      return;
    }
    void handleAIImportUrlPreview();
  };

  const handleClearImportChatHistory = () => {
    if (activeImportBatchId) {
      writeImportChatMessages(activeImportBatchId, []);
    }
    setImportBatchMessages([]);
    setImportBatchQuestion('');
  };

  return (
    <div
      data-testid="ai-import-panel"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      className="flex h-full min-h-0 flex-col"
    >
      <input
        ref={aiImportInputRef}
        data-testid="ai-import-generate-input"
        type="file"
        multiple
        className="hidden"
        accept=".txt,.md,.csv,.pdf,text/plain,text/markdown,text/csv,application/pdf"
        onChange={handleAIImportPreview}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-3 custom-scrollbar">
        <div className="px-1 py-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles size={16} className="text-primary" />
            AI
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            导入文件、链接和视频页面，整理成可追溯的结构化笔记。
          </div>
        </div>

        {(aiImportPreview.length > 0 || aiImportError) && (
          <div
            data-testid="ai-import-preview-panel"
            className="rounded-lg border border-primary/15 bg-primary/5 p-3 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-foreground">导入预览</div>
              <select
                aria-label="import-template-select"
                value={aiImportTemplate}
                onChange={(event) => setAiImportTemplate(event.target.value as ImportTemplateId)}
                className="h-8 rounded-lg border border-border/40 bg-background px-2 text-xs text-foreground"
              >
                <option value="general">通用整理</option>
                <option value="video">视频笔记</option>
                <option value="meeting">会议纪要</option>
                <option value="study">学习笔记</option>
                <option value="paper">论文/长文阅读</option>
                <option value="table">表格/数据摘要</option>
              </select>
            </div>
            {aiImportPreview.length > 0 && (
              <div className="space-y-2">
                {aiImportPreview.map((item) => (
                  <div key={`${item.file_name}-${item.size}`} className="rounded-lg bg-background/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">{item.file_name}</span>
                      <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{item.status}</span>
                    </div>
                    {(item.summary || item.message) && (
                      <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                        {item.summary || item.message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {aiImportError && (
              <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                {aiImportError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-label="generate-ai-import-note"
                onClick={handleConfirmAIImportGenerate}
                disabled={isAiImporting || !aiImportPreview.some((item) => item.status === 'ok')}
                className="min-h-8 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-medium leading-tight text-primary-foreground disabled:opacity-50"
              >
                {isAiImporting ? '处理中...' : '生成新笔记'}
              </button>
              <button
                type="button"
                aria-label="append-ai-import-note"
                onClick={handleAppendAIImportToCurrentNote}
                disabled={isAiImporting || !canAppendToSelectedNote || !aiImportPreview.some((item) => item.status === 'ok')}
                className="min-h-8 rounded-lg border border-primary/30 px-2 py-1.5 text-[11px] font-medium leading-tight text-primary disabled:opacity-50"
              >
                追加当前
              </button>
              <button
                type="button"
                onClick={clearImportDraft}
                className="col-span-2 min-h-8 rounded-lg border border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                清空
              </button>
            </div>
          </div>
        )}

        {activeImportBatchId && (
          <div className="rounded-lg border border-border/30 bg-background/70 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-foreground">导入问答</div>
              {importBatchMessages.length > 0 && (
                <button
                  type="button"
                  aria-label="clear-import-chat-history"
                  onClick={handleClearImportChatHistory}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  清理历史
                </button>
              )}
            </div>
            {activeImportSources.length > 0 && (
              <div data-testid="import-source-list" className="space-y-1">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">引用来源</div>
                {activeImportSources.map((source, index) => {
                  const title = source.title || source.name || source.url || `来源 ${index + 1}`;
                  const detail = source.url || source.name || source.kind || '';
                  return (
                    <div
                      key={`${title}-${detail}-${index}`}
                      className="rounded-lg border border-border/30 bg-background/70 px-2 py-1.5"
                    >
                      <div className="truncate text-[11px] font-medium text-foreground">{title}</div>
                      {detail && <div className="truncate text-[10px] text-muted-foreground">{detail}</div>}
                    </div>
                  );
                })}
              </div>
            )}
            {importBatchMessages.length > 0 && (
              <div className="space-y-2">
                {importBatchMessages.map((message) => (
                  <div key={message.id} className="space-y-1">
                    <div
                      className={`rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                        message.role === 'user'
                          ? 'ml-6 bg-accent/50 text-foreground'
                          : 'mr-6 bg-primary/5 text-foreground'
                      }`}
                    >
                      {message.text}
                    </div>
                    {message.role === 'assistant' && message.citations && message.citations.length > 0 && (
                      <div className="space-y-1">
                        {message.citations.map((citation) => (
                          <button
                            key={`${message.id}-${citation.chunk_id}-${citation.note_id ?? 'none'}`}
                            type="button"
                            aria-label={`open-import-citation-${citation.note_id}`}
                            onClick={() => {
                              if (citation.note_id !== null) {
                                onSelectNoteId?.(String(citation.note_id));
                              }
                            }}
                            className="w-full rounded-lg border border-border/30 px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/40"
                          >
                            <div className="truncate font-medium">{citation.title}</div>
                            <div className="line-clamp-1 opacity-70">{citation.excerpt}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/20 p-3">
        {aiImportStatus && (
          <div role="status" aria-live="polite" className="mb-2 flex min-h-5 items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
            {(isAiImporting || isAskingImportBatch) && <Loader2 size={12} className="shrink-0 animate-spin" />}
            <span className="min-w-0 break-words">{aiImportStatus}</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="upload-ai-import-file"
            onClick={() => aiImportInputRef.current?.click()}
            disabled={isAiImporting}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-50"
            title="Upload files"
          >
            <Paperclip size={15} />
          </button>
          {activeImportBatchId && (
            <button
              type="button"
              aria-label="toggle-ai-import-composer-mode"
              onClick={() => setComposerMode((mode) => (mode === 'ask' ? 'source' : 'ask'))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent/40"
              title={composerMode === 'ask' ? '添加来源' : '切回问答'}
            >
              {composerMode === 'ask' ? <Plus size={15} /> : <MessageSquare size={15} />}
            </button>
          )}
          <textarea
            aria-label={activeImportBatchId && composerMode === 'ask' ? 'ask-import-batch-input' : 'ai-import-url-input'}
            value={activeImportBatchId && composerMode === 'ask' ? importBatchQuestion : aiImportUrlDraft}
            onChange={(event) => {
              if (activeImportBatchId && composerMode === 'ask') {
                setImportBatchQuestion(event.target.value);
              } else {
                setAiImportUrlDraft(event.target.value);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                handleComposerSend();
              }
            }}
            placeholder={activeImportBatchId && composerMode === 'ask' ? '询问这批资料...' : '粘贴链接，每行一个...'}
            rows={2}
            className="min-h-9 min-w-0 flex-1 resize-none rounded-lg border border-border/30 bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary/40"
          />
          <button
            type="button"
            aria-label={activeImportBatchId && composerMode === 'ask' ? 'ask-import-batch' : 'preview-ai-import-url'}
            onClick={handleComposerSend}
            disabled={
              isAiImporting ||
              isAskingImportBatch ||
              (activeImportBatchId && composerMode === 'ask' ? !importBatchQuestion.trim() : !parseAiImportUrls(aiImportUrlDraft).length)
            }
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
            title="Send"
          >
            {isAskingImportBatch ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIImportPanel;
