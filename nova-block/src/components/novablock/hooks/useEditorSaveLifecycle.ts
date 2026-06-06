import { useEffect, type MutableRefObject } from 'react';

interface EditorDraftSnapshot<TNote> {
  note: TNote;
  content: string;
}

interface UseEditorSaveLifecycleArgs<TNote> {
  flushCurrentEditorDraft: () => EditorDraftSnapshot<TNote> | null;
  handleSave: (content?: string, updates?: TNote) => Promise<void> | void;
  timerRef: MutableRefObject<ReturnType<typeof window.setTimeout> | null>;
  isDirty: boolean;
  isDirtyRef: MutableRefObject<boolean>;
  isSavingRef: MutableRefObject<boolean>;
  queuedPayloadRef: MutableRefObject<{ length: number }>;
}

export function useEditorSaveLifecycle<TNote>({
  flushCurrentEditorDraft,
  handleSave,
  timerRef,
  isDirty,
  isDirtyRef,
  isSavingRef,
  queuedPayloadRef,
}: UseEditorSaveLifecycleArgs<TNote>) {
  useEffect(() => {
    const flushPendingSave = () => {
      const draftSnapshot = flushCurrentEditorDraft();
      if (!draftSnapshot) {
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (isDirtyRef.current || isSavingRef.current || queuedPayloadRef.current.length > 0) {
        void handleSave(draftSnapshot.content, draftSnapshot.note);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSave();
      }
    };

    window.addEventListener('beforeunload', flushPendingSave);
    window.addEventListener('pagehide', flushPendingSave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const unsubscribeBeforeClose = window.electron?.onBeforeAppClose?.(async () => {
      try {
        const draftSnapshot = flushCurrentEditorDraft();
        if (draftSnapshot) {
          await new Promise<void>((resolve) => {
            const timeoutId = window.setTimeout(resolve, 4600);
            Promise.resolve(handleSave(draftSnapshot.content, draftSnapshot.note))
              .catch((error) => {
                console.error('Failed to flush note before app close:', error);
              })
              .finally(() => {
                window.clearTimeout(timeoutId);
                resolve();
              });
          });
        }
      } finally {
        window.electron?.finishBeforeAppClose?.();
      }
    });

    return () => {
      window.removeEventListener('beforeunload', flushPendingSave);
      window.removeEventListener('pagehide', flushPendingSave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribeBeforeClose?.();
    };
  }, [flushCurrentEditorDraft, handleSave, isDirty, isDirtyRef, isSavingRef, queuedPayloadRef, timerRef]);
}
