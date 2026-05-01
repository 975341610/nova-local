import type { 
  AskResponse, 
  ModelConfig, 
  Note, 
  NoteTemplate,
  Notebook, 
  NoteProperty, 
  Task, 
  TrashState, 
  UserStats,
  UserAchievement,
  VaultHealthReport,
} from './types';
import { getApiBase } from './apiUrl';
import { invoke } from './apiTransport';
import { uploadFiles, uploadMusicFile } from './apiUpload';

export { formatUrl, getApiBase, sanitizeLegacyApiUrlsInHtml } from './apiUrl';

type NoteWritePayload = {
  title?: string;
  content?: string;
  notebook_id?: number | null;
  icon?: string;
  parent_id?: number | null;
  is_title_manually_edited?: boolean;
  tags?: string[];
  type?: string;
  is_folder?: boolean;
  file_path?: string | null;
  background_paper?: Note['background_paper'];
  sort_key?: string | null;
  stickers?: Note['stickers'];
  sticky_notes?: Note['sticky_notes'];
  properties?: NoteProperty[];
  rename_file?: boolean;
};

type FolderCreatePayload = {
  title: string;
  notebook_id?: number | null;
  parent_id?: number | null;
  tags?: string[];
  type?: string;
};

const NOTE_WRITE_KEYS = [
  'title',
  'content',
  'notebook_id',
  'icon',
  'parent_id',
  'is_title_manually_edited',
  'tags',
  'type',
  'file_path',
  'background_paper',
  'sort_key',
  'stickers',
  'sticky_notes',
  'properties',
  'rename_file',
] as const

const pickNoteWritePayload = (payload: Record<string, unknown> = {}): NoteWritePayload => {
  const next: Partial<NoteWritePayload> = {}
  for (const key of NOTE_WRITE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      ;(next as Record<string, unknown>)[key] = payload[key]
    }
  }
  return next
}

export const api = {
  listNotes: (includeContent = false) =>
    invoke<Note[]>('notes:list', '/notes', { params: { includeContent } }),
  getNote: (noteId: number) => invoke<Note>('notes:get', `/notes/${noteId}`),
  getChangedNotes: (filenames: string[]) =>
    invoke<Note[]>('notes:changed', '/notes/changed', { params: { filenames, includeContent: true } }),
  listNotebooks: () => invoke<Notebook[]>('notebooks:list', '/notebooks'),
  createNotebook: (payload: { name: string; icon?: string }) => 
    invoke<Notebook>('notebooks:create', '/notebooks', { method: 'POST', body: JSON.stringify(payload) }),
  updateNotebook: (notebookId: number, payload: { name?: string; icon?: string }) =>
    invoke<Notebook>('notebooks:update', `/notebooks/${notebookId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteNotebook: (notebookId: number) => invoke('notebooks:delete', `/notebooks/${notebookId}`, { method: 'DELETE' }),
  restoreNotebook: (notebookId: number) => invoke<Notebook>('notebooks:restore', `/notebooks/${notebookId}/restore`, { method: 'POST' }),
  purgeNotebook: (notebookId: number) => invoke('notebooks:purge', `/notebooks/${notebookId}/purge`, { method: 'DELETE' }),
  createNote: (payload: NoteWritePayload) =>
    invoke<Note>('notes:create', '/notes', { method: 'POST', body: JSON.stringify(pickNoteWritePayload(payload as Record<string, unknown>)) }),
  createFolder: (payload: FolderCreatePayload) =>
    invoke<Note>('folders:create', '/folders', { method: 'POST', body: JSON.stringify(payload) }),
  updateNote: (noteId: number, payload: NoteWritePayload) =>
    invoke<Note>('notes:update', `/notes/${noteId}`, { method: 'PUT', body: JSON.stringify(pickNoteWritePayload(payload as Record<string, unknown>)) }),
  updateNoteTags: (noteId: number, tags: string[]) =>
    invoke<Note>('notes:update-tags', `/notes/${noteId}/tags`, { method: 'PATCH', body: JSON.stringify(tags) }),
  moveNote: (noteId: number, payload: { notebook_id?: number | null; position: number; parent_id?: number | null }) =>
    invoke<Note>('notes:move', `/notes/${noteId}/move`, { method: 'PATCH', body: JSON.stringify(payload) }),
  bulkMoveNotes: (payload: { note_ids: number[]; notebook_id?: number | null; position: number; parent_id?: number | null }) =>
    invoke<{ notes: Note[] }>('notes:bulk-move', '/notes/bulk-move', { method: 'POST', body: JSON.stringify(payload) }),
  bulkDeleteNotes: (payload: { note_ids: number[]; position?: number }) =>
    invoke<{ notes: Note[] }>('notes:bulk-delete', '/notes/bulk-delete', { method: 'POST', body: JSON.stringify(payload) }),
  deleteNote: (noteId: number) => invoke('notes:delete', `/notes/${noteId}`, { method: 'DELETE' }),
  listNotesFiltered: (propertyName: string, propertyValue: string) => 
    invoke<Note[]>('notes:list-filtered', `/notes?property_name=${encodeURIComponent(propertyName)}&property_value=${encodeURIComponent(propertyValue)}`, { params: { propertyName, propertyValue } }),
  restoreNote: (noteId: number) => invoke<Note>('notes:restore', `/notes/${noteId}/restore`, { method: 'POST' }),
  purgeNote: (noteId: number) => invoke('notes:purge', `/notes/${noteId}/purge`, { method: 'DELETE' }),
  purgeTrash: () => invoke('trash:purge', '/trash/purge', { method: 'DELETE' }),
  getTrash: async () => {
    const res = await invoke<any>('trash:get', '/trash');
    if (!res || Array.isArray(res)) return { notes: [], notebooks: [] };
    return res as TrashState;
  },
  listTasks: () => invoke<Task[]>('tasks:list', '/tasks'),
  createTask: (payload: { title: string; status?: string; priority?: string; task_type?: string; deadline?: string | null }) =>
    invoke<Task>('tasks:create', '/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (taskId: number, payload: { title?: string; status?: string; priority?: string; task_type?: string; deadline?: string | null }) =>
    invoke<Task>('tasks:update', `/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTask: (taskId: number) => invoke('tasks:delete', `/tasks/${taskId}`, { method: 'DELETE' }),
  clearCompletedTasks: () => invoke('tasks:clear-completed', '/tasks/clear-completed', { method: 'DELETE' }),
  ask: (payload: { question: string; mode: 'chat' | 'rag' | 'agent' }) =>
    invoke<AskResponse>('ai:ask', '/ask', { method: 'POST', body: JSON.stringify(payload) }),
  streamInlineAI: async (payload: { prompt: string; context: string; action: string }, onChunk: (chunk: string) => void) => {
    if (window.electron?.ipcInvoke) {
      try {
        await window.electron.ipcInvoke('ai:stream-inline', payload, (chunk: string) => onChunk(chunk));
        return;
      } catch (e) {
        console.warn('IPC inline streaming failed, falling back to fetch', e);
      }
    }
    const API_BASE = getApiBase();
    const response = await fetch(`${API_BASE}/ai/inline`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              onChunk(parsed.text);
            }
          } catch (e) {
            console.error('Failed to parse SSE line:', data, e);
          }
        }
      }
    }
  },
  getModelConfig: () => invoke<ModelConfig>('config:get-model', '/model-config'),
  updateModelConfig: (payload: ModelConfig) =>
    invoke<ModelConfig>('config:update-model', '/model-config', { method: 'POST', body: JSON.stringify(payload) }),
  
  // Streaming AI and File uploads still use network requests (or we can wrap them later)
  // For now, these are less critical than CRUD saving
  streamChat: async (payload: { question: string; mode: string }, onChunk: (chunk: string) => void) => {
    if (window.electron?.ipcInvoke) {
      // Use IPC for streaming if implemented
      try {
        await window.electron.ipcInvoke('ai:stream-chat', payload, (chunk: string) => onChunk(chunk));
        return;
      } catch (e) {
        console.warn('IPC streaming failed, falling back to fetch', e);
      }
    }
    const API_BASE = getApiBase();
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  },
  upload: uploadFiles,
  getUserStats: async () => {
    const res = await invoke<any>('user:get-stats', '/user/stats');
    if (!res || Array.isArray(res)) return { exp: 0, level: 1, total_captures: 0, current_theme: 'dark' };
    return res as UserStats;
  },
  listUserAchievements: () => invoke<UserAchievement[]>('user:list-achievements', '/user/achievements'),
  updateUserTheme: (theme: string) => invoke<UserStats>('user:update-theme', '/user/theme', { method: 'POST', body: JSON.stringify({ theme }) }),
  updateUserWallpaper: (wallpaperUrl: string) => invoke<UserStats>('user:update-wallpaper', '/user/wallpaper', { method: 'POST', body: JSON.stringify({ wallpaper_url: wallpaperUrl }) }),
  listBgm: () => invoke<string[]>('bgm:list', '/bgm/list'),
  getBgmStreamUrl: (filename: string) => {
    const API_BASE = getApiBase();
    return `${API_BASE}/bgm/stream/${encodeURIComponent(filename)}`;
  },
  getSystemVersion: () => invoke<{ version: string; git_commit?: string; build_time?: string; executable?: string }>('system:version', '/system/version'),
  getVaultHealth: () => invoke<VaultHealthReport>('system:vault-health', '/system/vault-health'),
  openFile: (path: string) => invoke('system:open-file', '/system/open-file', { method: 'POST', body: JSON.stringify({ path }) }),
  switchDataPath: (dataPath: string) =>
    invoke<{ status: string; message?: string }>('system:switch-data-path', '/system/switch-data-path', { method: 'POST', body: JSON.stringify({ data_path: dataPath }) }),
  importData: (sourcePath: string) =>
    invoke<{ status: string; message?: string; backup_path?: string }>('system:import-data', '/system/import-data', { method: 'POST', body: JSON.stringify({ source_path: sourcePath }) }),
  updateSystem: (force = false) =>
    invoke<{ status: string; output?: string }>('system:update', '/system/update', { method: 'POST', body: JSON.stringify({ force }) }),
  restartSystem: () =>
    invoke<{ status: string; message?: string }>('system:restart', '/system/restart', { method: 'POST' }),
  // 音乐库列表必须走后端扫描（HTTP），避免 Electron IPC 缺失导致库永远为空
  listMusicLibrary: async () => {
    const API_BASE = getApiBase();
    const response = await fetch(`${API_BASE}/media/music-library`, { cache: 'no-store', headers: {} });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
  saveMusicLink: (payload: { title: string; url: string; cover?: string }) =>
    invoke<any>('media:music-link', '/media/music-link', { method: 'POST', body: JSON.stringify(payload) }),
  uploadMusic: uploadMusicFile,
  
  // AI Plugin status and hardware check
  getAIPluginStatus: () => invoke<{ enabled: boolean }>('ai:plugin-status', '/ai/plugin-status'),
  updateAIPluginConfig: (payload: { enabled?: boolean; num_ctx?: number }) => 
    invoke<{ enabled: boolean; num_ctx: number }>('ai:toggle-plugin', '/ai/toggle-plugin', { method: 'POST', body: JSON.stringify(payload) }),
  updateOllama: () => invoke<{ status: string; output?: string; message?: string }>('ai:update-ollama', '/ai/update-ollama', { method: 'POST' }),
  checkAIHardware: () => invoke<{ compatible: boolean; details: string }>('ai:hardware-check', '/ai/hardware-check'),
  spellcheck: (text: string) =>
    invoke<{ errors: Array<{ word: string; suggestion: string; reason: string; offset: number }> }>('text:spellcheck', '/text/spellcheck', { method: 'POST', body: JSON.stringify({ text }) }),
  importDictionary: (text: string) =>
    invoke<{ status: string; count: number; message: string }>('text:dictionary:import', '/text/dictionary/import', { method: 'POST', body: JSON.stringify({ text }) }),
  
  // Property APIs
  suggestTags: (content: string) => 
    invoke<{ tags: string[] }>('ai:suggest-tags', '/ai/suggest-tags', { method: 'POST', body: JSON.stringify({ content }) }),
  updateNoteProperty: (noteId: number, propertyId: number, payload: { name?: string; type?: string; value?: any }) =>
    invoke<NoteProperty>('notes:properties:update', `/notes/${noteId}/properties/${propertyId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  createNoteProperty: (noteId: number, property: { name: string; type: string; value: any }) =>
    invoke<NoteProperty>('notes:properties:create', `/notes/${noteId}/properties`, { method: 'POST', body: JSON.stringify(property) }),

  // Template APIs
  listTemplates: () => invoke<NoteTemplate[]>('templates:list', '/templates'),
  createTemplate: (payload: { name: string; content: string; icon?: string; category?: string }) =>
    invoke<NoteTemplate>('templates:create', '/templates', { method: 'POST', body: JSON.stringify(payload) }),
  updateTemplate: (templateId: number, payload: { name?: string; content?: string; icon?: string; category?: string }) =>
    invoke<NoteTemplate>('templates:update', `/templates/${templateId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTemplate: (templateId: number) => invoke('templates:delete', `/templates/${templateId}`, { method: 'DELETE' }),
};
