import type { SetStateAction } from 'react';
import { create } from 'zustand';

import type { Note } from '../lib/types';

function resolveStateAction<T>(value: SetStateAction<T>, previous: T): T {
  return typeof value === 'function'
    ? (value as (previous: T) => T)(previous)
    : value;
}

interface NoteState {
  notes: Note[];
  currentNoteId: number | null;
  setNotes: (notes: SetStateAction<Note[]>) => void;
  updateNote: (id: number, patch: Partial<Note>) => void;
  addNote: (note: Note) => void;
  deleteNote: (id: number) => void;
  setCurrentNoteId: (id: SetStateAction<number | null>) => void;
}

export const useNoteStore = create<NoteState>((set) => ({
  notes: [],
  currentNoteId: null,
  setNotes: (notes) =>
    set((state) => ({
      notes: resolveStateAction(notes, state.notes),
    })),
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
  setCurrentNoteId: (id) =>
    set((state) => ({
      currentNoteId: resolveStateAction(id, state.currentNoteId),
    })),
}));

export const useNoteById = (id: number | null) => {
  return useNoteStore((state) => state.notes.find((n) => n.id === id) || null);
};
