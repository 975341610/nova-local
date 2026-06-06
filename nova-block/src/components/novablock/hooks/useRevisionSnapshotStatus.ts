import { useEffect, useRef, useState } from 'react';
import type { RevisionSnapshotStatus } from '../../../lib/saveHealth';

type RevisionSnapshotPayload = NonNullable<RevisionSnapshotStatus> & {
  noteId: number;
};

export function useRevisionSnapshotStatus(noteId: number | string | null | undefined) {
  const [revisionSnapshotStatus, setRevisionSnapshotStatus] = useState<RevisionSnapshotStatus>(null);
  const revisionSnapshotStatusByNoteRef = useRef<Record<number, RevisionSnapshotStatus>>({});
  const activeRevisionNoteIdRef = useRef<number | null>(typeof noteId === 'number' ? noteId : null);

  useEffect(() => {
    const activeNoteId = typeof noteId === 'number' ? noteId : null;
    activeRevisionNoteIdRef.current = activeNoteId;
    setRevisionSnapshotStatus(
      activeNoteId != null ? revisionSnapshotStatusByNoteRef.current[activeNoteId] ?? null : null,
    );
  }, [noteId]);

  useEffect(() => {
    const unsubscribe = window.electron?.onRevisionSnapshotStatus?.((payload: RevisionSnapshotPayload) => {
      if (!payload || typeof payload.noteId !== 'number') {
        return;
      }

      revisionSnapshotStatusByNoteRef.current[payload.noteId] = payload;
      if (activeRevisionNoteIdRef.current === payload.noteId) {
        setRevisionSnapshotStatus(payload);
      }

      if (payload.status === 'saved') {
        window.setTimeout(() => {
          const latest = revisionSnapshotStatusByNoteRef.current[payload.noteId];
          if (latest?.updatedAt === payload.updatedAt) {
            revisionSnapshotStatusByNoteRef.current[payload.noteId] = null;
          }
          if (activeRevisionNoteIdRef.current === payload.noteId) {
            setRevisionSnapshotStatus((current) => (
              current && current.updatedAt === payload.updatedAt ? null : current
            ));
          }
        }, 2500);
      }
    });

    return () => unsubscribe?.();
  }, []);

  return revisionSnapshotStatus;
}
