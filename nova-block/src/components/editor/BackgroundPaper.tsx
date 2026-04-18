import React from 'react';
import type { BackgroundPaperType } from '../../lib/types';

interface BackgroundPaperProps {
  type: BackgroundPaperType;
  opacity?: number;
}

export const BackgroundPaper: React.FC<BackgroundPaperProps> = React.memo(({ type, opacity = 0.4 }) => {
  const isNone = !type || type === 'none';

  const getStyle = (): React.CSSProperties => {
    if (isNone) return {};
    switch (type) {
      case 'dot':
        return {
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        };
      case 'line':
        return {
          backgroundImage: `linear-gradient(to bottom, transparent 23px, currentColor 24px)`,
          backgroundSize: '100% 24px',
        };
      case 'grid':
        return {
          backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        };
      default:
        return {};
    }
  };

  return (
    <div 
      className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-500"
      style={{
        ...getStyle(),
        opacity: isNone ? 0 : opacity,
        color: 'rgba(0, 0, 0, 0.1)', // Default light color for paper patterns
      }}
      aria-hidden="true"
    />
  );
});
