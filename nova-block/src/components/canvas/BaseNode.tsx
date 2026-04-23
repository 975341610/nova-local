import React from 'react';
import { Handle, Position, NodeResizeControl, type NodeProps } from '@xyflow/react';
import { Info } from 'lucide-react';

interface BaseNodeProps extends NodeProps {
  children: React.ReactNode;
  onInfoClick?: (id: string) => void;
}

export function BaseNode({ id, selected, children, onInfoClick }: BaseNodeProps) {
  const handleVisibilityClass = selected
    ? '!flex !opacity-100 !pointer-events-auto'
    : '!hidden group-hover:!flex group-hover:!opacity-100 group-hover:!pointer-events-auto';

  return (
    <div className={`group relative h-full w-full ${selected ? 'node-selected' : ''}`}>
      {selected ? (
        <NodeResizeControl
          minWidth={160}
          minHeight={100}
          position={'bottom-right'}
          className="!border-none !bg-transparent !p-1.5 !w-5 !h-5 !flex !items-end !justify-end -bottom-1 -right-1 z-30 cursor-se-resize"
        >
          <div className="h-2.5 w-2.5 rounded-full border-2 border-[#d7a685] bg-white transition-opacity opacity-100" />
        </NodeResizeControl>
      ) : null}

      {/* Handles - 每个方向同时提供 source/target，hover/selected 才可见且可交互 */}
      {(
        [
          { pos: Position.Top, key: 'top' },
          { pos: Position.Right, key: 'right' },
          { pos: Position.Bottom, key: 'bottom' },
          { pos: Position.Left, key: 'left' },
        ] as const
      ).map(({ pos, key }) => (
        <React.Fragment key={key}>
          <Handle
            id={`${key}-source`}
            type="source"
            position={pos}
            className={`!w-5 !h-5 !bg-transparent !border-none !flex !items-center !justify-center !shadow-none !transition-opacity ${handleVisibilityClass} z-30`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#d7a685] border-2 border-white shadow-sm pointer-events-none" />
          </Handle>
          <Handle
            id={`${key}-target`}
            type="target"
            position={pos}
            className={`!w-5 !h-5 !bg-transparent !border-none !flex !items-center !justify-center !shadow-none !transition-opacity ${handleVisibilityClass} z-20`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#d7a685] border-2 border-white shadow-sm pointer-events-none" />
          </Handle>
        </React.Fragment>
      ))}

      {/* Info Icon */}
      {onInfoClick ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInfoClick(id);
          }}
          className={`absolute -right-8 top-0 flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[#a47b61] shadow-md transition-all hover:bg-white hover:text-[#8a5d3f] z-30 ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Info size={14} />
        </button>
      ) : null}

      {children}
    </div>
  );
}
