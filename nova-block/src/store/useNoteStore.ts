import { create } from 'zustand';
import { Note } from '../lib/types';

interface NoteState {
  notes: Note[];
  currentNoteId: number | null;
  setNotes: (notes: Note[]) => void;
  updateNote: (id: number, patch: Partial<Note>) => void;
  addNote: (note: Note) => void;
  deleteNote: (id: number) => void;
  setCurrentNoteId: (id: number | null) => void;
}

export const useNoteStore = create<NoteState>((set) => ({
  notes: [],
  currentNoteId: null,
  setNotes: (notes) => set({ notes }),
  updateNote: (id, patch) =>
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === id ? { ...note, ...patch } : note
      ),
    })),
  addNote: (note) =>
    set((state) => ({
      notes: [...state.notes, note],
    })),
  deleteNote: (id) =>
    set((state) => ({
      notes: state.notes.filter((note) => note.id !== id),
    })),
  setCurrentNoteId: (id) => set({ currentNoteId: id }),
}));

/**
 * 细粒度 Selector：获取用于渲染侧边栏树的元数据。
 * 只有当 notes 的结构（id, title, parent_id, is_folder, icon, position）发生变化时，
 * 才会触发订阅此 selector 的组件重绘。
 */
export const useNoteTreeData = () => {
  return useNoteStore((state) => 
    state.notes.map(({ id, title, parent_id, is_folder, icon, position }) => ({
      id, title, parent_id, is_folder, icon, position
    })),
    // 使用 shallow 比较数组内容
    (oldData, newData) => {
      if (oldData.length !== newData.length) return false;
      return oldData.every((item, index) => {
        const newItem = newData[index];
        return (
          item.id === newItem.id &&
          item.title === newItem.title &&
          item.parent_id === newItem.parent_id &&
          item.is_folder === newItem.is_folder &&
          item.icon === newItem.icon &&
          item.position === newItem.position
        );
      });
    }
  );
};

/**
 * 细粒度 Selector：根据 ID 获取单个笔记的完整数据。
 */
export const useNoteById = (id: number | null) => {
  return useNoteStore((state) => state.notes.find((n) => n.id === id) || null);
};
