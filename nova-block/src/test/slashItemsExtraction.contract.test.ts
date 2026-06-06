import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..');
const editorPath = resolve(repoRoot, 'components/novablock/NovaBlockEditor.tsx');
const slashItemsPath = resolve(repoRoot, 'components/novablock/slashItems.tsx');

describe('NovaBlock slash command extraction', () => {
  it('keeps slash command definitions outside the main editor component', () => {
    const editorSource = readFileSync(editorPath, 'utf8');

    expect(existsSync(slashItemsPath)).toBe(true);
    expect(editorSource).toContain("import { NOVA_BLOCK_SLASH_ITEMS } from './slashItems';");
    expect(editorSource).not.toContain('const NOVA_BLOCK_SLASH_ITEMS = [');

    const slashItemsSource = readFileSync(slashItemsPath, 'utf8');
    expect(slashItemsSource).toContain('export const NOVA_BLOCK_SLASH_ITEMS');
    expect(slashItemsSource).toContain('AI 写作');
    expect(slashItemsSource).toContain('高级表格');
    expect(slashItemsSource).toContain('时间线 · Timeline');
    expect(slashItemsSource).toContain('open-advanced-table-size-picker');
    expect(slashItemsSource).toContain('promptCompat');
  });
});
