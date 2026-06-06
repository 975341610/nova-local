import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceRoot = resolve(__dirname, '..');
const editorPath = resolve(sourceRoot, 'components/novablock/NovaBlockEditor.tsx');
const overlayPath = resolve(sourceRoot, 'components/novablock/components/BlockHandleOverlay.tsx');

describe('QingZhi block handle overlay extraction', () => {
  it('keeps block handle portal rendering outside NovaBlockEditor', () => {
    const editorSource = readFileSync(editorPath, 'utf8');

    expect(existsSync(overlayPath)).toBe(true);
    expect(editorSource).toContain('BlockHandleOverlay');
    expect(editorSource).not.toContain('data-testid="qingzhi-block-handle"');
    expect(editorSource).not.toContain('className="qz-custom-block-handle"');

    const overlaySource = readFileSync(overlayPath, 'utf8');
    expect(overlaySource).toContain('export function BlockHandleOverlay');
    expect(overlaySource).toContain('data-testid="qingzhi-block-handle"');
    expect(overlaySource).toContain('qz-custom-block-handle');
    expect(overlaySource).toContain('createPortal');
    expect(overlaySource).toContain('GripVertical');
  });
});
