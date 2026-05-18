import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Copy, FilePlus2, Info, Loader2, MessageSquare, Paperclip, Plus, Send, Sparkles, TextCursorInput } from 'lucide-react';
import { api } from '../../lib/api';
import { aiMarkdownToHtmlWithFootnotes } from '../../lib/aiMarkdown';
import type { Citation, ImportPreviewItem, ImportTemplateId, Note } from '../../lib/types';
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
type WorkbenchMode = 'import' | 'ask' | 'write';
type WriteActionId = 'summarize' | 'outline' | 'tasks';
type AskScope = 'import' | 'note' | 'vault';

type UploadedFileRef = {
  url: string;
  name: string;
  size?: number;
  type?: string;
};

const AI_WRITE_ACTIONS: Array<{
  id: WriteActionId;
  label: string;
  action: string;
  prompt: string;
}> = [
  {
    id: 'summarize',
    label: '总结当前笔记',
    action: 'summarize',
    prompt: '请总结当前笔记，输出适合直接写回笔记的结构化摘要。',
  },
  {
    id: 'outline',
    label: '生成大纲',
    action: 'outline',
    prompt: '请基于当前笔记生成层次清晰的大纲。',
  },
  {
    id: 'tasks',
    label: '提取行动项',
    action: 'ask',
    prompt: '请从当前笔记中提取可执行行动项，按动作、背景、优先级整理。',
  },
];

const SUGGESTED_ASK_PROMPTS = [
  '总结核心要点',
  '提取可执行行动项',
  '生成复习问题',
];

const compactPromptLabel = (prompt: string) => {
  if (prompt.includes('行动')) return '行动项';
  if (prompt.includes('复习')) return '复习题';
  return '总结要点';
};

const htmlToPlainText = (html: string) => {
  if (!html) return '';
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const element = document.createElement('div');
  element.innerHTML = html;
  return (element.textContent || '').replace(/\s+/g, ' ').trim();
};

const cleanAiPanelText = (value?: string) => {
  if (!value) return '';
  let text = value;
  if (typeof document !== 'undefined') {
    const element = document.createElement('textarea');
    for (let i = 0; i < 3; i += 1) {
      element.innerHTML = text;
      const decoded = element.value;
      if (decoded === text) break;
      text = decoded;
    }
  }
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[ \t]*[-*+]\s+/gm, '')
    .replace(/^[ \t]*#{1,6}\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
};

const normalizeCitationTitle = (value?: string) => cleanAiPanelText(value)
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase();

const resolveCitationNoteId = (citation: Citation, notes: Note[]) => {
  const citationTitle = normalizeCitationTitle(citation.title);
  const citedId = citation.note_id === null || citation.note_id === undefined
    ? null
    : Number(citation.note_id);

  if (Number.isFinite(citedId)) {
    const noteById = notes.find((note) => Number(note.id) === citedId && !note.is_folder);
    if (noteById) {
      const noteTitle = normalizeCitationTitle(noteById.title);
      if (!citationTitle || noteTitle === citationTitle) {
        return String(noteById.id);
      }
    }
  }

  if (citationTitle) {
    const noteByTitle = notes.find((note) => (
      !note.is_folder && normalizeCitationTitle(note.title) === citationTitle
    ));
    if (noteByTitle) return String(noteByTitle.id);
  }

  return Number.isFinite(citedId) ? String(citedId) : '';
};

const buildAiAnswerTitle = (answer: string, question = '') => {
  const source = cleanAiPanelText(question).replace(/\[\d+\]/g, '').trim()
    || answer.split(/\r?\n/)
    .map((line) => cleanAiPanelText(line)
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/\[\d+\]/g, '')
      .replace(/^[\s>*-]+/, '')
      .trim())
    .find(Boolean)
    || 'AI 回答';
  const title = source.length > 34 ? `${source.slice(0, 34)}...` : source;
  return title.startsWith('AI 回答') ? title : `AI 回答 - ${title}`;
};

const buildAiAnswerProperties = (scope: AskScope, question: string, citations: Citation[]) => {
  const citationRefs = citations.map((citation, index) => ({
    index: index + 1,
    note_id: citation.note_id,
    title: cleanAiPanelText(citation.title),
    chunk_id: citation.chunk_id,
    score: citation.score,
  }));
  return [
    { name: 'ai_source', type: 'text' as const, value: 'side_panel_answer' },
    { name: 'ai_scope', type: 'text' as const, value: scope },
    { name: 'ai_question', type: 'text' as const, value: question },
    { name: 'ai_citations', type: 'text' as const, value: JSON.stringify(citationRefs) },
  ];
};

const getAskScopeLabel = (scope: AskScope) => {
  if (scope === 'vault') return '全部知识库';
  if (scope === 'note') return '当前笔记';
  return '这批资料';
};

const buildAiAnswerReferenceHtml = (citations: Citation[]) => {
  if (!citations.length) {
    return '<h2>引用来源</h2><p>本回答未返回可追溯来源。</p>';
  }
  const compactSummary = (value?: string) => {
    const text = cleanAiPanelText(value);
    if (!text) return '';
    return text.length > 96 ? `${text.slice(0, 96)}...` : text;
  };
  const items = citations.map((citation, index) => {
    const title = cleanAiPanelText(citation.title) || `来源 ${index + 1}`;
    const summary = compactSummary(citation.excerpt);
    const noteLink = citation.note_id !== null && citation.note_id !== undefined
      ? `<span data-type="note-link" data-id="${escapeHtml(String(citation.note_id))}" data-label="${escapeHtml(title)}"></span>`
      : `<strong>${escapeHtml(title)}</strong>`;
    return [
      '<li>',
      `<p><strong>[${index + 1}]</strong> ${noteLink}</p>`,
      summary ? `<p>相关摘要：${escapeHtml(summary)}</p>` : '',
      '</li>',
    ].filter(Boolean).join('\n');
  });
  return ['<h2>引用来源</h2>', '<ol>', ...items, '</ol>'].join('\n');
};

const buildAiAnswerNoteHtml = (
  title: string,
  answer: string,
  citations: Citation[],
  scope: AskScope,
  question = '',
) => [
  `<h1>${escapeHtml(title)}</h1>`,
  '<h2>问答信息</h2>',
  '<blockquote data-ai-answer-meta="true">',
  `<p><strong>问题：</strong>${escapeHtml(question || '未记录')}</p>`,
  `<p><strong>范围：</strong>${escapeHtml(getAskScopeLabel(scope))}</p>`,
  `<p><strong>生成时间：</strong>${escapeHtml(new Date().toLocaleString('zh-CN', { hour12: false }))}</p>`,
  '</blockquote>',
  '<h2>AI 回答</h2>',
  aiMarkdownToHtmlWithFootnotes(answer, citations),
  buildAiAnswerReferenceHtml(citations),
].filter(Boolean).join('\n');

const notifyEditorContentReplaced = (noteId: number | string, content: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('nova:replace-current-note-content', {
    detail: { noteId: Number(noteId), content },
  }));
};

const openCitationNote = (noteId: string, onSelectNoteId?: (noteId: string) => void) => {
  const numericNoteId = Number(noteId);
  if (!Number.isFinite(numericNoteId)) return;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nova:notes-invalidate', {
      detail: { reason: 'ai-citation-open', noteId: numericNoteId },
    }));
  }
  onSelectNoteId?.(String(numericNoteId));
};

const getImportChatStorageKey = (scopeId: string) => `nova.ai.chat.${scopeId}`;

const readImportChatMessages = (scopeId: string): ImportChatMessage[] => {
  if (!scopeId || typeof window === 'undefined') return [];
  try {
    const legacyImportId = scopeId.startsWith('import:') ? scopeId.slice('import:'.length) : '';
    const raw = window.localStorage.getItem(getImportChatStorageKey(scopeId))
      || (legacyImportId ? window.localStorage.getItem(`nova.ai.importChat.${legacyImportId}`) : null);
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

const writeImportChatMessages = (scopeId: string, messages: ImportChatMessage[]) => {
  if (!scopeId || typeof window === 'undefined') return;
  const key = getImportChatStorageKey(scopeId);
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
  aiMarkdownToHtmlWithFootnotes(markdown),
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
  const [activeWorkbenchMode, setActiveWorkbenchMode] = useState<WorkbenchMode>('import');
  const [askScope, setAskScope] = useState<AskScope>('note');
  const [isAiWriting, setIsAiWriting] = useState(false);
  const [aiWriteResult, setAiWriteResult] = useState('');
  const [activeWriteActionId, setActiveWriteActionId] = useState<WriteActionId | null>(null);
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
  const selectedNoteAskId = selectedNoteForImport && !selectedNoteForImport.is_folder
    ? String(selectedNoteForImport.id)
    : '';
  const defaultAskScope: AskScope = activeImportBatchId ? 'import' : selectedNoteAskId ? 'note' : 'vault';
  const effectiveAskScope: AskScope = askScope === 'import' && !activeImportBatchId
    ? defaultAskScope
    : askScope === 'note' && !selectedNoteAskId
      ? defaultAskScope
      : askScope;
  const activeNoteAskId = effectiveAskScope === 'note' ? selectedNoteAskId : '';
  const activeChatScopeId = effectiveAskScope === 'import' && activeImportBatchId
    ? `import:${activeImportBatchId}`
    : effectiveAskScope === 'note' && activeNoteAskId
      ? `note:${activeNoteAskId}`
      : effectiveAskScope === 'vault'
        ? 'vault'
        : '';
  const visibleAskScopeId = activeWorkbenchMode === 'ask' ? activeChatScopeId : '';
  const messageStorageScopeId = activeWorkbenchMode === 'ask' ? activeChatScopeId : '';
  const visibleChatTitle = effectiveAskScope === 'import' ? '导入问答' : effectiveAskScope === 'note' ? '当前笔记问答' : '知识库问答';
  const visibleChatSourceLabel = effectiveAskScope === 'import' ? '引用来源' : effectiveAskScope === 'note' ? '当前笔记' : '全部知识库';
  const isVaultAsk = activeWorkbenchMode === 'ask' && effectiveAskScope === 'vault';
  const isAskComposer = Boolean(visibleAskScopeId) && composerMode === 'ask';

  const selectWorkbenchMode = (mode: WorkbenchMode) => {
    setActiveWorkbenchMode(mode);
    setComposerMode(mode === 'ask' ? 'ask' : 'source');
  };

  useEffect(() => {
    setAskScope(defaultAskScope);
  }, [defaultAskScope]);

  useEffect(() => {
    if (!activeChatScopeId || activeChatScopeId === 'vault') {
      setImportBatchMessages([]);
      setComposerMode('source');
      setHydratedImportBatchId('');
      return;
    }
    setImportBatchMessages(readImportChatMessages(activeChatScopeId));
    setComposerMode('ask');
    setActiveWorkbenchMode('ask');
    setHydratedImportBatchId(activeChatScopeId);
  }, [activeChatScopeId]);

  useEffect(() => {
    if (activeWorkbenchMode !== 'ask' || activeChatScopeId) return;
    setImportBatchMessages(readImportChatMessages('vault'));
    setComposerMode('ask');
    setHydratedImportBatchId('vault');
  }, [activeWorkbenchMode, activeChatScopeId]);

  useEffect(() => {
    if (!messageStorageScopeId || hydratedImportBatchId !== messageStorageScopeId) return;
    writeImportChatMessages(messageStorageScopeId, importBatchMessages);
  }, [messageStorageScopeId, hydratedImportBatchId, importBatchMessages]);

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
    setComposerMode(activeChatScopeId ? 'ask' : 'source');
    setActiveWorkbenchMode(activeChatScopeId ? 'ask' : 'import');
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
    setActiveWorkbenchMode(importBatchId ? 'ask' : 'import');
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
      notifyEditorContentReplaced(updatedNote.id, updatedNote.content || appendedContent);
      onSelectNoteId?.(String(updatedNote.id));
      rememberGeneratedImport(generated.metadata || {});
    } catch (error) {
      console.error('AI import append failed:', error);
      setAiImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAiImporting(false);
    }
  };

  const handleAskImportBatch = async (suggestedQuestion?: string) => {
    const question = (suggestedQuestion ?? importBatchQuestion).trim();
    if (!visibleAskScopeId || !question || isAskingImportBatch) return;

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
      const assistantId = `${timestamp}-assistant`;
      if (effectiveAskScope === 'vault') {
        let answer = '';
        let citations: Citation[] = [];
        let buffer = '';
        setImportBatchMessages((prev) => [
          ...prev,
          { id: assistantId, role: 'assistant', text: '', citations: [] },
        ]);
        const updateStreamingMessage = () => {
          setImportBatchMessages((prev) => prev.map((message) => (
            message.id === assistantId ? { ...message, text: answer, citations } : message
          )));
        };
        const consumeLine = (line: string) => {
          if (line.startsWith('__CITATIONS__:')) {
            try {
              citations = JSON.parse(line.slice('__CITATIONS__:'.length)) as Citation[];
            } catch (error) {
              console.warn('Failed to parse AI citations:', error);
            }
            updateStreamingMessage();
            return;
          }
          answer += line;
          updateStreamingMessage();
        };
        await api.streamChat({ question, mode: 'rag' }, (chunk) => {
          buffer += chunk;
          const citationIndex = buffer.indexOf('__CITATIONS__:');
          if (citationIndex === -1) {
            answer = buffer;
            updateStreamingMessage();
            return;
          }
          answer = buffer.slice(0, citationIndex).replace(/\n+$/, '');
          const citationPayload = buffer.slice(citationIndex).trim();
          if (citationPayload.includes('\n') || citationPayload.endsWith(']')) {
            consumeLine(citationPayload.split(/\r?\n/)[0]);
            buffer = answer;
          }
          updateStreamingMessage();
        });
        updateStreamingMessage();
        setAiImportStatus('AI 已回复');
        return;
      }

      const response = effectiveAskScope === 'import' && activeImportBatchId
        ? await api.askImportBatch(activeImportBatchId, question)
        : effectiveAskScope === 'note' && activeNoteAskId
          ? await api.askNote(activeNoteAskId, question)
          : await api.ask({ question, mode: 'rag' });
      setImportBatchMessages((prev) => [
        ...prev,
        {
          id: assistantId,
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

  const handleRunWriteAction = async (actionId: WriteActionId) => {
    const writeAction = AI_WRITE_ACTIONS.find((item) => item.id === actionId);
    if (!writeAction || !selectedNoteForImport || selectedNoteForImport.is_folder || isAiWriting) return;

    setIsAiWriting(true);
    setActiveWriteActionId(actionId);
    setAiWriteResult('');
    setAiImportError(null);
    setAiImportStatus(`${writeAction.label}中，AI 正在生成...`);
    try {
      const latestNote = selectedNoteForImport.content === undefined
        ? await api.getNote(Number(selectedNoteForImport.id))
        : selectedNoteForImport;
      const context = htmlToPlainText(latestNote.content || '');
      let nextResult = '';
      await api.streamInlineAI(
        { action: writeAction.action, prompt: writeAction.prompt, context },
        (chunk) => {
          nextResult += chunk;
          setAiWriteResult(nextResult);
        },
      );
      setAiImportStatus('写作结果已生成');
    } catch (error) {
      console.error('AI write action failed:', error);
      setAiImportError(error instanceof Error ? error.message : String(error));
      setAiImportStatus('写作生成失败');
    } finally {
      setIsAiWriting(false);
    }
  };

  const handleCopyWriteResult = async () => {
    if (!aiWriteResult.trim() || typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(aiWriteResult);
    setAiImportStatus('写作结果已复制');
  };

  const handleCopyAiText = async (text: string) => {
    if (!text.trim() || typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(text);
    setAiImportStatus('AI 回答已复制');
  };

  const handleInsertAiText = async (text: string, citations: Citation[] = []) => {
    if (!text.trim() || !selectedNoteForImport || selectedNoteForImport.is_folder || isAiWriting) return;

    setIsAiWriting(true);
    setAiImportError(null);
    setAiImportStatus('正在插入 AI 回答...');
    try {
      const latestNote = selectedNoteForImport.content === undefined
        ? await api.getNote(Number(selectedNoteForImport.id))
        : selectedNoteForImport;
      const updatedNote = await api.updateNote(Number(latestNote.id), {
        content: [
          latestNote.content || '',
          '<hr data-ai-chat-insert="true" />',
          aiMarkdownToHtmlWithFootnotes(text, citations),
        ].filter(Boolean).join('\n'),
      });
      setNotes((prev) => prev.map((note) => (
        String(note.id) === String(updatedNote.id) ? { ...note, ...updatedNote } : note
      )));
      notifyEditorContentReplaced(updatedNote.id, updatedNote.content || '');
      onSelectNoteId?.(String(updatedNote.id));
      setAiImportStatus('AI 回答已插入当前笔记');
    } catch (error) {
      console.error('AI answer insert failed:', error);
      setAiImportError(error instanceof Error ? error.message : String(error));
      setAiImportStatus('插入失败');
    } finally {
      setIsAiWriting(false);
    }
  };

  const handleSaveAiTextAsNote = async (text: string, citations: Citation[] = [], question = '') => {
    if (!text.trim() || isAiWriting) return;

    setIsAiWriting(true);
    setAiImportError(null);
    setAiImportStatus('正在保存 AI 回答...');
    try {
      const title = buildAiAnswerTitle(text, question);
      const nextNote = await api.createNote({
        title,
        icon: 'AI',
        content: buildAiAnswerNoteHtml(title, text, citations, effectiveAskScope, question),
        type: 'note',
        tags: ['AI'],
        properties: buildAiAnswerProperties(effectiveAskScope, question, citations),
        notebook_id: null,
        parent_id: null,
        is_title_manually_edited: true,
        background_paper: 'none',
        sort_key: 'm',
        stickers: [],
        sticky_notes: [],
      });
      setNotes((prev) => {
        const exists = prev.some((note) => note.id === nextNote.id);
        return exists
          ? prev.map((note) => (note.id === nextNote.id ? { ...note, ...nextNote } : note))
          : [...prev, nextNote];
      });
      onSelectNoteId?.(String(nextNote.id));
      setAiImportStatus('AI 回答已保存为新笔记');
    } catch (error) {
      console.error('AI answer save failed:', error);
      setAiImportError(error instanceof Error ? error.message : String(error));
      setAiImportStatus('保存失败');
    } finally {
      setIsAiWriting(false);
    }
  };

  const handleInsertWriteResult = async () => {
    if (!aiWriteResult.trim() || !selectedNoteForImport || selectedNoteForImport.is_folder || isAiWriting) return;

    setIsAiWriting(true);
    setAiImportError(null);
    setAiImportStatus('正在插入当前笔记...');
    try {
      const latestNote = selectedNoteForImport.content === undefined
        ? await api.getNote(Number(selectedNoteForImport.id))
        : selectedNoteForImport;
      const updatedNote = await api.updateNote(Number(latestNote.id), {
        content: [
          latestNote.content || '',
          '<hr data-ai-write-insert="true" />',
          aiMarkdownToHtmlWithFootnotes(aiWriteResult),
        ].filter(Boolean).join('\n'),
      });
      setNotes((prev) => prev.map((note) => (
        String(note.id) === String(updatedNote.id) ? { ...note, ...updatedNote } : note
      )));
      notifyEditorContentReplaced(updatedNote.id, updatedNote.content || '');
      onSelectNoteId?.(String(updatedNote.id));
      setAiImportStatus('写作结果已插入当前笔记');
    } catch (error) {
      console.error('AI write insert failed:', error);
      setAiImportError(error instanceof Error ? error.message : String(error));
      setAiImportStatus('插入失败');
    } finally {
      setIsAiWriting(false);
    }
  };

  const handleComposerSend = () => {
    if (isAskComposer && importBatchQuestion.trim()) {
      void handleAskImportBatch();
      return;
    }
    void handleAIImportUrlPreview();
  };

  const handleClearImportChatHistory = () => {
    if (messageStorageScopeId) {
      writeImportChatMessages(messageStorageScopeId, []);
    }
    setImportBatchMessages([]);
    setImportBatchQuestion('');
  };

  return (
    <div
      data-testid="ai-import-panel"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      className="qingzhi-ai-panel flex h-full min-h-0 flex-col"
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
        <div className="qz-ai-compact-header">
          <div className="qz-ai-compact-icon" aria-hidden="true">
            <Sparkles size={13} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-foreground">AI 助手</div>
            <div className="truncate text-[10px] text-muted-foreground">导入 · 问答 · 写作</div>
          </div>
          <button
            type="button"
            aria-label="ai-panel-info"
            className="qz-ai-compact-info"
            title="导入文件、链接和视频页面，整理成可追溯的结构化笔记。"
          >
            <Info size={12} />
          </button>
        </div>

        <div className="qz-ai-compact-segment grid grid-cols-3 gap-1 rounded-lg border border-border/30 bg-muted/30 p-1">
          {([
            ['import', '导入'],
            ['ask', '问答'],
            ['write', '写作'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-label={`ai-workbench-mode-${mode}`}
              onClick={() => selectWorkbenchMode(mode)}
              className={`min-h-7 rounded-md px-2 text-[11px] font-medium transition-colors ${
                activeWorkbenchMode === mode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeWorkbenchMode === 'import' && aiImportPreview.length === 0 && !aiImportError && (
          <div
            data-testid="ai-import-empty"
            className="rounded-lg border border-dashed border-border/40 bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground"
          >
            粘贴链接、上传文件或拖入资料，将其生成可追溯的结构化笔记。
          </div>
        )}

        {activeWorkbenchMode === 'import' && (aiImportPreview.length > 0 || aiImportError) && (
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

        {activeWorkbenchMode === 'ask' && visibleAskScopeId && (
          <div className="qz-ai-shell-flat qz-ai-compact-ask space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-foreground">{visibleChatTitle}</div>
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
            <label className="qz-ai-scope-chip">
              <span>范围</span>
              <select
                aria-label="ai-ask-scope-select"
                value={effectiveAskScope}
                onChange={(event) => setAskScope(event.target.value as AskScope)}
                className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold text-foreground outline-none"
              >
                {activeImportBatchId && <option value="import">这批资料</option>}
                {selectedNoteAskId && <option value="note">当前笔记</option>}
                <option value="vault">全库</option>
              </select>
              <ChevronDown size={12} aria-hidden="true" />
            </label>
            {activeImportSources.length > 0 && (
              <div data-testid="import-source-list" className="qz-ai-source-compact space-y-1">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">{visibleChatSourceLabel}</div>
                {isVaultAsk && (
                  <div className="rounded-lg border border-border/30 bg-background/70 px-2 py-1.5">
                    <div className="truncate text-[11px] font-medium text-foreground">全部笔记</div>
                    <div className="truncate text-[10px] text-muted-foreground">基于知识库索引进行带引用问答</div>
                  </div>
                )}
                {activeNoteAskId && selectedNoteForImport && (
                  <div className="rounded-lg border border-border/30 bg-background/70 px-2 py-1.5">
                    <div className="truncate text-[11px] font-medium text-foreground">{selectedNoteForImport.title || '无标题笔记'}</div>
                    <div className="truncate text-[10px] text-muted-foreground">当前选中的笔记内容</div>
                  </div>
                )}
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
            {importBatchMessages.length === 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">推荐问题</div>
                <div className="qz-ai-prompt-grid qz-ai-compact-prompts flex gap-1.5">
                  {SUGGESTED_ASK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      aria-label={`ask-suggested-${prompt}`}
                      onClick={() => void handleAskImportBatch(prompt)}
                      disabled={isAskingImportBatch}
                      className="rounded-full border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-50"
                    >
                      {compactPromptLabel(prompt)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {importBatchMessages.length > 0 && (
              <div className="space-y-2">
                {importBatchMessages.map((message, messageIndex) => {
                  const assistantQuestion = message.role === 'assistant'
                    ? importBatchMessages
                      .slice(0, messageIndex)
                      .reverse()
                      .find((item) => item.role === 'user')?.text || ''
                    : '';
                  return (
                  <div key={message.id} className="space-y-1">
                    <div
                      className={`rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                        message.role === 'user'
                          ? 'ml-6 bg-accent/50 text-foreground'
                          : 'mr-6 bg-primary/5 text-foreground'
                      }`}
                    >
                      {message.role === 'assistant' ? cleanAiPanelText(message.text) : message.text}
                    </div>
                    {message.role === 'assistant' && (
                      <div className="mr-6 flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`copy-ai-answer-${message.id}`}
                          title="复制回答"
                          onClick={() => void handleCopyAiText(message.text)}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-border/30 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`insert-ai-answer-${message.id}`}
                          title="插入当前笔记"
                          onClick={() => void handleInsertAiText(message.text, message.citations || [])}
                          disabled={!canAppendToSelectedNote || isAiWriting}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-border/30 text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-50"
                        >
                          <TextCursorInput size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`save-ai-answer-${message.id}`}
                          title="保存为新笔记"
                          onClick={() => void handleSaveAiTextAsNote(message.text, message.citations || [], assistantQuestion)}
                          disabled={isAiWriting}
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-border/30 text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-50"
                        >
                          <FilePlus2 size={14} />
                        </button>
                      </div>
                    )}
                    {message.role === 'assistant' && message.citations && message.citations.length > 0 && (
                      <div className="space-y-1">
                        {message.citations.map((citation) => {
                          const resolvedNoteId = resolveCitationNoteId(citation, notes);
                          return (
                            <button
                              key={`${message.id}-${citation.chunk_id}-${citation.note_id ?? 'none'}`}
                              type="button"
                              aria-label={`open-import-citation-${resolvedNoteId || citation.note_id || 'none'}`}
                              onClick={() => openCitationNote(resolvedNoteId, onSelectNoteId)}
                              disabled={!resolvedNoteId}
                              className="w-full rounded-lg border border-border/30 px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <div className="truncate font-medium">{cleanAiPanelText(citation.title)}</div>
                              <div className="line-clamp-1 opacity-70">{cleanAiPanelText(citation.excerpt)}</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeWorkbenchMode === 'write' && (
          <div
            data-testid="ai-write-panel"
            className="qz-ai-shell-flat qz-ai-write-panel space-y-3"
          >
            <div>
              <div className="text-xs font-semibold text-foreground">写作助手</div>
              <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                针对当前笔记进行摘要、提纲和行动项整理。
              </div>
            </div>
            <div className="qz-ai-write-actions flex gap-1.5">
              {AI_WRITE_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  aria-label={`run-ai-write-${action.id}`}
                  onClick={() => void handleRunWriteAction(action.id)}
                  disabled={!canAppendToSelectedNote || isAiWriting}
                  className="qz-ai-write-chip"
                >
                  {activeWriteActionId === action.id && isAiWriting ? '生成中...' : action.label}
                </button>
              ))}
            </div>
            {aiWriteResult && (
              <div className="space-y-2">
                <div
                  data-testid="ai-write-result"
                  className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-foreground custom-scrollbar"
                >
                  {aiWriteResult}
                </div>
                <div className="qz-ai-compact-action-bar flex gap-1.5">
                  <button
                    type="button"
                    aria-label="copy-ai-write-result"
                    title="复制"
                    onClick={() => void handleCopyWriteResult()}
                    className="qz-ai-compact-action flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="insert-ai-write-result"
                    title="插入当前笔记"
                    onClick={() => void handleInsertWriteResult()}
                    disabled={isAiWriting || !canAppendToSelectedNote}
                    className="qz-ai-compact-action flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-50"
                  >
                    <TextCursorInput size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/20 p-3">
        {aiImportStatus && (
          <div role="status" aria-live="polite" className="mb-2 flex min-h-5 items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
            {(isAiImporting || isAskingImportBatch || isAiWriting) && <Loader2 size={12} className="shrink-0 animate-spin" />}
            <span className="min-w-0 break-words">{aiImportStatus}</span>
          </div>
        )}
        {activeWorkbenchMode === 'write' ? (
          <div className="rounded-lg border border-border/30 bg-background/70 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            写作模式会基于当前笔记生成结果，可在上方复制或插入当前笔记。
          </div>
        ) : (
        <div className="qz-ai-composer qz-ai-compact-composer flex items-end gap-1.5">
          <button
            type="button"
            aria-label="upload-ai-import-file"
            onClick={() => aiImportInputRef.current?.click()}
            disabled={isAiImporting}
            className="qz-ai-compact-action flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-50"
            title="Upload files"
          >
            <Paperclip size={15} />
          </button>
          {activeChatScopeId && (
            <button
              type="button"
              aria-label="toggle-ai-import-composer-mode"
              onClick={() => {
                setComposerMode((mode) => {
                  const nextMode = mode === 'ask' ? 'source' : 'ask';
                  setActiveWorkbenchMode(nextMode === 'ask' ? 'ask' : 'import');
                  return nextMode;
                });
              }}
              className="qz-ai-compact-action flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent/40"
              title={composerMode === 'ask' ? '添加来源' : '切回问答'}
            >
              {composerMode === 'ask' ? <Plus size={15} /> : <MessageSquare size={15} />}
            </button>
          )}
          <div className="qz-ai-compact-input">
          <textarea
            aria-label={isAskComposer ? 'ask-import-batch-input' : 'ai-import-url-input'}
            value={isAskComposer ? importBatchQuestion : aiImportUrlDraft}
            onChange={(event) => {
              if (isAskComposer) {
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
            placeholder={isAskComposer ? (effectiveAskScope === 'import' ? '询问这批资料...' : effectiveAskScope === 'note' ? '询问当前笔记...' : '询问整个知识库...') : '粘贴链接，每行一个...'}
            rows={1}
            className="min-h-9 min-w-0 flex-1 resize-none rounded-lg border border-border/30 bg-background px-3 py-2 pr-10 text-xs text-foreground outline-none focus:border-primary/40"
          />
          <span className="qz-ai-compact-shortcut">⌘↵</span>
          </div>
          <button
            type="button"
            aria-label={isAskComposer ? 'ask-import-batch' : 'preview-ai-import-url'}
            onClick={handleComposerSend}
            disabled={
              isAiImporting ||
              isAskingImportBatch ||
              (isAskComposer ? !importBatchQuestion.trim() : !parseAiImportUrls(aiImportUrlDraft).length)
            }
            className="qz-ai-compact-send flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
            title="Send"
          >
            {isAskingImportBatch ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
        )}
      </div>
    </div>
  );
};

export default AIImportPanel;
