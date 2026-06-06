import React from 'react';
import { createPortal } from 'react-dom';
import { GripVertical } from 'lucide-react';

export interface BlockHandleOverlayState {
  visible: boolean;
  pos: number;
  rect: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  referenceRect: { top: number; left: number; right: number; bottom: number };
}

interface BlockHandleOverlayProps {
  enabled: boolean;
  state: BlockHandleOverlayState | null;
  blockMenuRef: React.RefObject<HTMLDivElement | null>;
  isBlockMenuOpen: boolean;
  setDragHandleBridgeLocked: (locked: boolean) => void;
  scheduleDragHandleReposition: () => void;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onClick: (event: React.MouseEvent) => void;
}

export function BlockHandleOverlay({
  enabled,
  state,
  blockMenuRef,
  isBlockMenuOpen,
  setDragHandleBridgeLocked,
  scheduleDragHandleReposition,
  onMouseDown,
  onDragStart,
  onDragEnd,
  onClick,
}: BlockHandleOverlayProps) {
  if (!enabled || !state?.visible || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={blockMenuRef}
      data-testid="qingzhi-block-handle"
      data-qz-block-handle="true"
      role="button"
      tabIndex={0}
      draggable={true}
      className="qz-custom-block-handle"
      style={{
        position: 'fixed',
        left: state.rect.left,
        top: state.rect.top,
        width: state.rect.width,
        height: state.rect.height,
      }}
      onMouseEnter={() => {
        setDragHandleBridgeLocked(true);
        scheduleDragHandleReposition();
      }}
      onMouseLeave={() => {
        if (!isBlockMenuOpen) {
          setDragHandleBridgeLocked(false);
        }
      }}
      onMouseDown={onMouseDown}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          onClick(event as unknown as React.MouseEvent);
        }
      }}
      aria-label="Open block menu"
    >
      <span className="qz-custom-block-handle-icon" aria-hidden="true">
        <GripVertical size={16} />
      </span>
    </div>,
    document.body,
  );
}
