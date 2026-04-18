import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Check, X, Sparkles, Lightbulb } from 'lucide-react';
import type { SpellcheckError } from '../extensions/AISpellcheck';

interface SpellcheckSuggestionCardProps {
  error: SpellcheckError;
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  onReplace: (suggestion: string) => void;
  onClose: () => void;
}

export const SpellcheckSuggestionCard: React.FC<SpellcheckSuggestionCardProps> = ({
  error,
  rect,
  onReplace,
  onClose,
}) => {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ top: -9999, left: -9999 });

  React.useLayoutEffect(() => {
    if (cardRef.current) {
      const cardRect = cardRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      // Start with the exact center of the red wavy text
      let centerX = rect.left + rect.width / 2;
      
      // Calculate top: 12px above the text
      let top = rect.top - cardRect.height - 12;

      // Flip to bottom if there's no space at top
      if (top < 10) {
        top = rect.top + rect.height + 12;
      }

      // Keep within horizontal bounds (account for the centered card)
      const halfWidth = cardRect.width / 2;
      if (centerX - halfWidth < 10) {
        centerX = halfWidth + 10;
      } else if (centerX + halfWidth > viewportWidth - 10) {
        centerX = viewportWidth - halfWidth - 10;
      }

      setPosition({ top, left: centerX });
    }
  }, [rect]);

  return createPortal(
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, scale: 0.95, y: 10, x: "-50%" }}
      animate={{ opacity: 1, scale: 1, y: 0, x: "-50%" }}
      exit={{ opacity: 0, scale: 0.95, y: 10, x: "-50%" }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 99999,
      }}
      className="w-64 overflow-hidden rounded-2xl border border-white/20 dark:border-zinc-800/50 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] flex flex-col p-3 gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500">
            <Sparkles size={14} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">AI 修改建议</span>
        </div>
        <button 
          onClick={onClose}
          className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-destructive/80 line-through decoration-destructive/30 decoration-2">{error.word}</span>
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <span className="text-sm font-semibold text-emerald-500">{error.suggestion}</span>
        </div>
        
        {error.reason && (
          <div className="flex gap-2 p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
            <Lightbulb size={12} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">{error.reason}</p>
          </div>
        )}
      </div>

      <button
        onClick={() => onReplace(error.suggestion)}
        className="group relative flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-xs transition-all active:scale-[0.98] hover:shadow-lg hover:shadow-purple-500/20"
      >
        <Check size={14} />
        一键采纳
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </button>
    </motion.div>,
    document.body
  );
};
