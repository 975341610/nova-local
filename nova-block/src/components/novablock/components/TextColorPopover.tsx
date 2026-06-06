import type React from 'react';
import type { Editor } from '@tiptap/react';
import { createPortal } from 'react-dom';

export type TextColorPopoverAnchor = {
  x: number;
  y: number;
} | null;

type TextColorPopoverProps = {
  editor: Editor | null;
  isTextColorOpen: boolean;
  isHighlightColorOpen: boolean;
  textColorAnchor: TextColorPopoverAnchor;
  highlightColorAnchor: TextColorPopoverAnchor;
  setIsTextColorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsHighlightColorOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const textColors = [
  { c: '#000000', n: '墨' },
  { c: '#d32f2f', n: '朱砂' },
  { c: '#e65100', n: '赤金' },
  { c: '#f9a825', n: '杏黄' },
  { c: '#2e7d32', n: '翠绿' },
  { c: '#0288d1', n: '靛青' },
  { c: '#6a1b9a', n: '玄紫' },
  { c: '#5d4037', n: '褐' },
];

const highlightColors = [
  { c: '#fff59d', n: '淡黄' },
  { c: '#ffec3d', n: '柠黄' },
  { c: '#ffcdd2', n: '胭脂' },
  { c: '#ffab91', n: '橘粉' },
  { c: '#c8e6c9', n: '嫩绿' },
  { c: '#b3e5fc', n: '浅蓝' },
  { c: '#d1c4e9', n: '淡紫' },
  { c: '#d7ccc8', n: '米褐' },
];

export function TextColorPopover({
  editor,
  isTextColorOpen,
  isHighlightColorOpen,
  textColorAnchor,
  highlightColorAnchor,
  setIsTextColorOpen,
  setIsHighlightColorOpen,
}: TextColorPopoverProps) {
  if ((!isTextColorOpen && !isHighlightColorOpen) || typeof document === 'undefined') {
    return null;
  }

  const anchor = isTextColorOpen ? textColorAnchor : highlightColorAnchor;
  const colors = isTextColorOpen ? textColors : highlightColors;

  return createPortal(
    <div
      data-color-popover="true"
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: 'fixed',
        left: anchor?.x ?? 0,
        top: anchor?.y ?? 0,
        transform: 'translateX(-50%)',
        zIndex: 10000,
      }}
      className="rounded-xl border border-border/40 bg-background/98 shadow-xl backdrop-blur-md p-2 flex flex-col gap-1.5"
    >
      <div className="text-[10px] text-muted-foreground px-0.5 flex items-center justify-between">
        <span>{isTextColorOpen ? '文字颜色' : '高亮颜色'}</span>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (isTextColorOpen) {
              editor?.chain().focus().unsetTextColor().run();
              setIsTextColorOpen(false);
            } else {
              editor?.chain().focus().unsetHighlight().run();
              setIsHighlightColorOpen(false);
            }
          }}
          className="text-muted-foreground hover:text-destructive"
        >
          清除
        </button>
      </div>
      <div className="grid grid-cols-8 gap-1" style={{ width: 196 }}>
        {colors.map(({ c, n }) => (
          <button
            type="button"
            key={c}
            title={n}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (isTextColorOpen) {
                editor?.chain().focus().setTextColor(c).run();
                setIsTextColorOpen(false);
              } else {
                editor?.chain().focus().toggleHighlight({ color: c }).run();
                setIsHighlightColorOpen(false);
              }
            }}
            className="w-5 h-5 rounded-full border border-border/60 hover:scale-110 transition-transform"
            style={{ background: c }}
          />
        ))}
      </div>
      <label
        className="flex items-center gap-2 pt-1.5 border-t border-border/30 text-[11px] text-muted-foreground cursor-pointer"
        onMouseDown={(event) => event.preventDefault()}
      >
        <input
          type="color"
          onChange={(event) => {
            const value = event.target.value;
            if (isTextColorOpen) {
              editor?.chain().focus().setTextColor(value).run();
            } else {
              editor?.chain().focus().setHighlight({ color: value }).run();
            }
          }}
          className="w-6 h-6 rounded cursor-pointer"
        />
        <span>自定义颜色</span>
      </label>
    </div>,
    document.body,
  );
}
