import type { AdvancedTableRect } from '../../lib/advancedTableEdges';

export const ADVANCED_TABLE_CELL_COLORS = [
  { label: '无', value: 'transparent' },
  { label: '宣纸', value: '#f6f3ef' },
  { label: '雾绿', value: '#dce5de' },
  { label: '浅金', value: '#f4ead5' },
  { label: '朱砂', value: '#f5dccd' },
  { label: '玉色', value: '#e7f0ec' },
];

export function escapeCssIdentifier(value: string): string {
  const css = globalThis.CSS as typeof CSS | undefined;
  if (css?.escape) {
    return css.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

export function toAdvancedTableRect(rect: DOMRect | ClientRect): AdvancedTableRect {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}
