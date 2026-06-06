import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..');
const editorPath = resolve(repoRoot, 'components/novablock/NovaBlockEditor.tsx');
const popoverPath = resolve(repoRoot, 'components/novablock/components/TextColorPopover.tsx');

describe('TextColorPopover extraction contract', () => {
  it('moves the text/highlight color popover out of NovaBlockEditor', () => {
    expect(existsSync(popoverPath)).toBe(true);

    const editorSource = readFileSync(editorPath, 'utf8');
    const popoverSource = readFileSync(popoverPath, 'utf8');

    expect(editorSource).toContain("import { TextColorPopover } from './components/TextColorPopover';");
    expect(editorSource).toContain('<TextColorPopover');
    expect(editorSource).not.toContain('data-color-popover="true"');

    expect(popoverSource).toContain('export function TextColorPopover');
    expect(popoverSource).toContain('createPortal');
    expect(popoverSource).toContain('data-color-popover="true"');
    expect(popoverSource).toContain('文字颜色');
    expect(popoverSource).toContain('高亮颜色');
    expect(popoverSource).toContain('自定义颜色');
  });
});
