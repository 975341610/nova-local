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
} from './types';

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
export const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  if (typeof window !== 'undefined') {
    if (window.location.hostname.includes('strato-https-proxy')) {
      return `https://${window.location.hostname.replace(/^[0-9]+-/, '8765-')}/api`;
    }
    if (window.location.hostname.includes('aime-app.bytedance.net')) {
      return `https://${window.location.hostname}/api`;
    }
    
    // 如果是本地 Vite 开发服务器 (5173 / 4173)，则强制请求本地 8765 后端
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      if (window.location.port === '5173' || window.location.port === '4173') {
        return 'http://127.0.0.1:8765/api';
      }
    }
  }
  
  return 'http://127.0.0.1:8765/api';
};

/**
 * 格式化 API 返回的相对路径为绝对 URL
 */
export const formatUrl = (url: string | undefined | null) => {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  
  const base = getApiBase(); // e.g. http://127.0.0.1:8765/api
  
  // 如果路径以 /api 开头，我们需要处理掉重复的 /api
  if (url.startsWith('/api/')) {
    const apiBaseWithoutTrailingSlash = base.endsWith('/api') ? base.slice(0, -4) : base;
    return `${apiBaseWithoutTrailingSlash}${url}`;
  }
  
  // 否则直接拼接
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
};



declare global {
  interface Window {
    electron?: {
      ipcInvoke: (channel: string, ...args: any[]) => Promise<any>;
      onVaultChanged?: (callback: (payload: any) => void) => (() => void);
      onBeforeAppClose?: (callback: () => void | Promise<void>) => (() => void);
      finishBeforeAppClose?: () => void;
    };
  }
}

const LOCAL_FIRST_CHANNELS = new Set([
  'notes:list',
  'notes:get',
  'notes:create',
  'folders:create',
  'notes:update',
  'notes:delete',
])

const extractEntityId = (path: string) => {
  const match = path.match(/\/(\d+)(?:\/|$)/)
  return match ? parseInt(match[1], 10) : undefined
}

// Helper to call IPC or fallback to fetch
async function invoke<T>(channel: string, path: string, options?: any): Promise<T> {
  if (window.electron?.ipcInvoke && LOCAL_FIRST_CHANNELS.has(channel)) {
    // 📂 彻底切换到 Electron IPC 进行本地直接 CRUD
    // 坚决不使用 fetch 向本地 Python 后端发起 HTTP 请求
    try {
      const payload = options?.body ? JSON.parse(options.body) : options?.params || options || {};
      const entityId = extractEntityId(path)
      if (entityId !== undefined && payload.id === undefined) {
        payload.id = entityId
      }
      return await window.electron.ipcInvoke(channel, payload);
    } catch (e) {
      console.error(`IPC call to ${channel} failed:`, e);
      throw e; // 在 Electron 环境下，IPC 失败就不再回退到 fetch，防止违反离线优先原则
    }
  }
  
  // Fallback to FastAPI REST API (only if electron is not available, e.g. web preview)
  const API_BASE = getApiBase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Request failed');
  }
  return response.json() as Promise<T>;
}

export const api = {
  listNotes: (includeContent = false) =>
    invoke<Note[]>('notes:list', '/notes', { params: { includeContent } }),
  getNote: (noteId: number) => invoke<Note>('notes:get', `/notes/${noteId}`),
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
      return window.electron.ipcInvoke('ai:stream-inline', payload, (chunk: string) => onChunk(chunk));
    }
    const API_BASE = getApiBase();
    const response = await fetch(`${API_BASE}/ai/inline`, {
      method: 'POST',
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
  upload: async (files: File[], noteId?: number | string) => {
    const API_BASE = getApiBase();
    const CHUNK_SIZE = 1024 * 256; // 256KB chunks (Strato proxy is extremely strict)

    const results = await Promise.all(files.map(async (file) => {
      if (file.size <= CHUNK_SIZE) {
        // Small files, use simple upload
        const formData = new FormData();
        formData.append('file', file);
        if (noteId) formData.append('note_id', noteId.toString());
        const response = await fetch(`${API_BASE}/media/upload`, { method: 'POST', body: formData });
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      } else {
        // Large files, use chunked upload
        const initForm = new FormData();
        initForm.append('filename', file.name);
        initForm.append('size', file.size.toString());
        if (noteId) initForm.append('note_id', noteId.toString());
        
        const initRes = await fetch(`${API_BASE}/media/upload/init`, { method: 'POST', body: initForm });
        if (!initRes.ok) throw new Error('Failed to init upload');
        const { upload_id } = await initRes.json();

        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        for (let i = 0; i < totalChunks; i++) {
          const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          const chunkForm = new FormData();
          chunkForm.append('upload_id', upload_id);
          chunkForm.append('chunk_index', i.toString());
          chunkForm.append('file', chunk);
          if (noteId) chunkForm.append('note_id', noteId.toString());
          
          const chunkRes = await fetch(`${API_BASE}/media/upload/chunk`, { method: 'POST', body: chunkForm });
          if (!chunkRes.ok) throw new Error(`Failed to upload chunk ${i}`);
        }

        const compForm = new FormData();
        compForm.append('upload_id', upload_id);
        compForm.append('filename', file.name);
        compForm.append('content_type', file.type);
        if (noteId) compForm.append('note_id', noteId.toString());
        
        const compRes = await fetch(`${API_BASE}/media/upload/complete`, { method: 'POST', body: compForm });
        if (!compRes.ok) throw new Error('Failed to complete upload');
        return compRes.json();
      }
    }));
    return results;
  },
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
  openFile: (path: string) => invoke('system:open-file', '/system/open-file', { method: 'POST', body: JSON.stringify({ path }) }),
  // 音乐库列表必须走后端扫描（HTTP），避免 Electron IPC 缺失导致库永远为空
  listMusicLibrary: async () => {
    const API_BASE = getApiBase();
    const response = await fetch(`${API_BASE}/media/music-library`);
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
  saveMusicLink: (payload: { title: string; url: string; cover?: string }) =>
    invoke<any>('media:music-link', '/media/music-link', { method: 'POST', body: JSON.stringify(payload) }),
  uploadMusic: async (file: File, cover?: File) => {
    const API_BASE = getApiBase();
    const formData = new FormData();
    formData.append('file', file);
    if (cover) formData.append('cover', cover);
    const response = await fetch(`${API_BASE}/media/music-upload`, { method: 'POST', body: formData });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
  
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
  
  // Dummy implementations for PropertyPanel
  suggestTags: (content: string) => 
    invoke<{ tags: string[] }>('ai:suggest-tags', '/ai/suggest-tags', { method: 'POST', body: JSON.stringify({ content }) }),
  updateNoteProperty: async (noteId: number, propertyId: number, payload: any) => {
    console.log('Dummy updateNoteProperty called for note:', noteId, 'propertyId:', propertyId, 'payload:', payload);
    return { id: propertyId, ...payload } as NoteProperty;
  },
  createNoteProperty: async (noteId: number, property: { name: string; type: string; value: any }) => {
    console.log('Dummy createNoteProperty called for note:', noteId, 'property:', property);
    return { ...property, id: Math.random() } as NoteProperty;
  },

  // Template APIs
  listTemplates: () => invoke<NoteTemplate[]>('templates:list', '/templates'),
  createTemplate: (payload: { name: string; content: string; icon?: string; category?: string }) =>
    invoke<NoteTemplate>('templates:create', '/templates', { method: 'POST', body: JSON.stringify(payload) }),
  updateTemplate: (templateId: number, payload: { name?: string; content?: string; icon?: string; category?: string }) =>
    invoke<NoteTemplate>('templates:update', `/templates/${templateId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTemplate: (templateId: number) => invoke('templates:delete', `/templates/${templateId}`, { method: 'DELETE' }),
};
