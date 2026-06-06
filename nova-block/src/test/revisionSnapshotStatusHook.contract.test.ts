import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..');
const editorPath = resolve(repoRoot, 'components/novablock/NovaBlockEditor.tsx');
const hookPath = resolve(repoRoot, 'components/novablock/hooks/useRevisionSnapshotStatus.ts');

describe('revision snapshot status hook extraction', () => {
  it('keeps per-note revision status tracking outside NovaBlockEditor', () => {
    expect(existsSync(hookPath)).toBe(true);

    const editorSource = readFileSync(editorPath, 'utf8');
    const hookSource = readFileSync(hookPath, 'utf8');

    expect(editorSource).toContain("import { useRevisionSnapshotStatus } from './hooks/useRevisionSnapshotStatus';");
    expect(editorSource).toContain('const revisionSnapshotStatus = useRevisionSnapshotStatus(note?.id);');
    expect(editorSource).not.toContain('revisionSnapshotStatusByNoteRef');
    expect(editorSource).not.toContain('onRevisionSnapshotStatus?.((payload');

    expect(hookSource).toContain('export function useRevisionSnapshotStatus');
    expect(hookSource).toContain('revisionSnapshotStatusByNoteRef');
    expect(hookSource).toContain('activeRevisionNoteIdRef');
    expect(hookSource).toContain('window.electron?.onRevisionSnapshotStatus');
    expect(hookSource).toContain('payload.status ===');
  });
});
