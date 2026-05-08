export type NoteProperty = {
  id: number;
  note_id: number;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multi_select';
  value: string;
};

export type StickerData = {
  id: string;
  type: 'image';     // Stickers are purely images/decorations
  url: string;       // Image sticker path
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
};

export type StickyNoteData = {
  id: string;
  x: number;
  y: number;
  color: string;
  rotation: number;
  content: string; // HTML string
};

export type BackgroundPaperType = 'none' | 'dot' | 'line' | 'grid';

export type Note = {
  id: number;
  title: string;
  icon: string;
  content?: string;
  file_path?: string | null;
  type?: string;
  summary: string;
  is_title_manually_edited: boolean;
  tags: string[];
  properties: NoteProperty[];
  sticky_notes?: StickyNoteData[];
  stickers?: StickerData[];
  links: number[];
  notebook_id: number | null;
  parent_id: number | null;
  position: number;
  sort_key?: string;
  is_folder?: boolean;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  is_draft?: boolean;
  background_paper?: BackgroundPaperType;
};

export type NoteRevision = {
  id: number;
  note_id: number;
  created_at: string | null;
  content_hash: string;
  title_snapshot: string;
  byte_size: number;
  source: 'auto' | 'save' | 'restore' | 'restore-point' | 'missing' | string;
  content?: string;
  missing?: boolean;
};

export type RevisionSettings = {
  debounce_seconds: number;
  max_keep: number;
};

export type OutlineItem = {
  id: string;
  text: string;
  level: number;
};

export type Notebook = {
  id: number;
  name: string;
  icon: string;
  created_at: string;
  deleted_at?: string | null;
};

export type TrashState = {
  notes: Note[];
  notebooks: Notebook[];
};

export type VaultHealthIssue = {
  type: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  note_path?: string;
  asset_path?: string;
  target?: string;
};

export type VaultHealthReport = {
  summary: {
    total_issues: number;
    missing_attachments?: number;
    orphan_attachments?: number;
    mojibake_notes?: number;
    encoding_errors?: number;
    unsafe_references?: number;
  };
  issues: VaultHealthIssue[];
};

export type Task = {
  id: number;
  title: string;
  status: 'todo' | 'doing' | 'done';
  priority: 'low' | 'medium' | 'high';
  task_type: 'meeting' | 'work' | 'travel' | 'errand' | 'study' | 'personal';
  deadline: string | null;
  created_at: string;
};

export type Citation = {
  note_id: number | null;
  title: string;
  chunk_id: string;
  score: number;
  excerpt: string;
};

export type AskResponse = {
  answer: string;
  citations: Citation[];
  mode: string;
};

export type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  mode?: 'chat' | 'rag' | 'agent';
  created_at: string;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updated_at: string;
};

export type ModelConfig = {
  provider: string;
  api_key?: string;
  api_key_masked?: string;
  base_url: string;
  model_name: string;
};

export type ToastMessage = {
  id: number;
  tone: 'success' | 'error' | 'info';
  text: string;
};

export type UserStats = {
  exp: number;
  level: number;
  total_captures: number;
  current_theme: string;
  wallpaper_url?: string;
};

export type Achievement = {
  id: number;
  name: string;
  description: string;
  condition_type: string;
  condition_value: number;
  icon: string;
  created_at: string;
};

export type UserAchievement = {
  id: number;
  achievement_id: number;
  unlocked_at: string;
  achievement: Achievement;
};

export type AppStatus = 'INIT' | 'LOADING_BACKEND' | 'LOADING_FRONTEND' | 'READY' | 'ERROR';

export type BGMState = {
  isPlaying: boolean;
  volume: number;
  tracks: string[];
  currentTrack: string | null;
};

export type NoteTemplate = {
  id: number;
  name: string;
  content: string;
  icon: string;
  category: string;
  created_at: string;
  updated_at: string;
};

export interface ThemeConfig {
  version: string;
  slashMenu: {
    opacity: number;
    blur: number;
    backgroundColor: string;
    foregroundColor: string;
    borderColor: string;
  };
  textMenu: {
    opacity: number;
    blur: number;
    backgroundColor: string;
    foregroundColor: string;
    borderColor: string;
  };
  blockMenu: {
    opacity: number;
    blur: number;
    backgroundColor: string;
    foregroundColor: string;
    borderColor: string;
  };
}
