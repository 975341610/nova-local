import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceRoot = resolve(__dirname, '..');
const editorPath = resolve(sourceRoot, 'components/novablock/NovaBlockEditor.tsx');
const tableUiPath = resolve(sourceRoot, 'components/novablock/advancedTableUi.ts');

describe('advanced table UI helper extraction', () => {
  it('keeps table UI constants and DOM helpers outside NovaBlockEditor', () => {
    const editorSource = readFileSync(editorPath, 'utf8');

    expect(existsSync(tableUiPath)).toBe(true);
    expect(editorSource).toContain("from './advancedTableUi'");
    expect(editorSource).not.toContain('const ADVANCED_TABLE_CELL_COLORS = [');
    expect(editorSource).not.toContain('function escapeCssIdentifier');
    expect(editorSource).not.toContain('const toAdvancedTableRect =');

    const tableUiSource = readFileSync(tableUiPath, 'utf8');
    expect(tableUiSource).toContain('export const ADVANCED_TABLE_CELL_COLORS');
    expect(tableUiSource).toContain('export function escapeCssIdentifier');
    expect(tableUiSource).toContain('export function toAdvancedTableRect');
    expect(tableUiSource).toContain('#f6f3ef');
    expect(tableUiSource).toContain('#dce5de');
  });
});
