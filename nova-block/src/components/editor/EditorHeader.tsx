import { useState, useRef, useEffect } from 'react';
import { BookMarked, Save, ChevronRight, Pen, Eye, Sticker, Library, Trash2, Copy, Layers, Circle, Type as LineIcon, Grid3X3 } from 'lucide-react';
import type { BackgroundPaperType } from '../../lib/types';

type Breadcrumb = {
  id: number;
  title: string;
  icon: string;
};

type EditorHeaderProps = {
  icon: string;
  title: string;
  isTitleManuallyEdited: boolean;
  breadcrumbs?: Breadcrumb[];
  onSelectBreadcrumb?: (id: number) => void;
  savePhase: 'idle' | 'queued' | 'saving';
  isDirty: boolean;
  lastSavedAt: string | null;
  showRelations: boolean;
  showOutline: boolean;
  viewMode: 'edit' | 'preview';
  isStickerMode: boolean;
  backgroundPaper?: BackgroundPaperType;
  onSave: () => void;
  onUpdateTitle: (newTitle: string, isManual: boolean) => void;
  onToggleRelations: () => void;
  onOutlineEnter: () => void;
  onOutlineLeave: () => void;
  onSetViewMode: (mode: 'edit' | 'preview') => void;
  onToggleStickerMode: () => void;
  onOpenStickerPanel?: () => void;
  onClearStickers?: () => void;
  onSaveAsTemplate?: () => void;
  onChangeBackgroundPaper?: (type: BackgroundPaperType) => void;
};

export function EditorHeader(props: EditorHeaderProps) {
  const { 
    breadcrumbs, onSelectBreadcrumb, 
    savePhase, isDirty, lastSavedAt, showOutline, 
    viewMode, isStickerMode, backgroundPaper = 'none', onSave,
    onOutlineEnter, onOutlineLeave, onSetViewMode,
    onToggleStickerMode, onOpenStickerPanel, onClearStickers,
    onSaveAsTemplate, onChangeBackgroundPaper
  } = props;

  const [isBackgroundMenuOpen, setIsBackgroundMenuOpen] = useState(false);
  const backgroundMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭背景选择菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (backgroundMenuRef.current && !backgroundMenuRef.current.contains(event.target as Node)) {
        setIsBackgroundMenuOpen(false);
      }
    };

    if (isBackgroundMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isBackgroundMenuOpen]);

  return (
    <div className="flex flex-col bg-transparent px-0 pt-0 pb-0 antialiased">
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl pt-3 pb-3 mb-4 border-b border-border/40 transition-colors flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Status Indicator */}
          <div 
            className="flex items-center gap-2 p-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-accent/50 transition-all cursor-default"
            title={lastSavedAt ? `同步于 ${lastSavedAt}` : undefined}
          >
            <div className={`w-2 h-2 rounded-full ${savePhase === 'saving' ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]' : isDirty ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]' : 'bg-emerald-400'}`} />
            <span className="opacity-70 group-hover:opacity-100">
              {savePhase === 'saving' ? 'SAVING' : 
               savePhase === 'queued' ? 'QUEUED' : 
               isDirty ? 'UNSAVED' : 'SYNCED'}
            </span>
          </div>
          
          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
              {breadcrumbs.map((bc, idx) => (
                <div key={bc.id} className="flex items-center gap-1.5">
                  {idx > 0 && <ChevronRight size={12} className="text-muted-foreground/40" />}
                  <button onClick={() => onSelectBreadcrumb?.(bc.id)} className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition truncate max-w-[100px]">
                    {bc.title || 'Untitled'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
           {/* iOS Style Segmented Control */}
           <div className="relative flex items-center bg-accent/30 rounded-lg p-0.5 border border-border/40 w-[64px] h-[30px]">
            {/* Sliding Highlight Background */}
            <div 
              className="absolute top-0.5 bottom-0.5 w-[28px] bg-background shadow-sm rounded-md transition-transform duration-300 ease-out z-0 border border-border/50"
              style={{ transform: viewMode === 'edit' ? 'translateX(2px)' : 'translateX(30px)' }}
            />
            <button 
              onClick={() => onSetViewMode('edit')} 
              title="编辑模式"
              className={`relative z-10 flex-1 flex items-center justify-center p-1.5 rounded-md transition-colors duration-300 ${viewMode === 'edit' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80'}`}
            >
              <Pen size={13} strokeWidth={2.5} />
            </button>
            <button 
              onClick={() => onSetViewMode('preview')} 
              title="预览模式"
              className={`relative z-10 flex-1 flex items-center justify-center p-1.5 rounded-md transition-colors duration-300 ${viewMode === 'preview' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80'}`}
            >
              <Eye size={15} strokeWidth={2.5} />
            </button>
          </div>

          {/* Background Paper Selector */}
          <div className="relative flex items-center" ref={backgroundMenuRef}>
            <button
              onClick={() => setIsBackgroundMenuOpen(!isBackgroundMenuOpen)}
              className={`flex items-center justify-center w-[30px] h-[30px] rounded-lg border bg-accent/30 border-border/40 text-muted-foreground hover:text-foreground hover:border-border/60 transition-all duration-300 ${
                backgroundPaper !== 'none' || isBackgroundMenuOpen ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-500' : ''
              }`}
              title="更换背景纸"
            >
              <Layers size={16} />
            </button>
            
            {/* Background Selection Menu (Click Triggered) */}
            {isBackgroundMenuOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 z-[100] animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="bg-background/95 backdrop-blur-md rounded-lg shadow-xl border border-border/50 p-1 flex items-center gap-1">
                  {[
                    { type: 'none', icon: <Pen size={12} />, title: '无背景' },
                    { type: 'dot', icon: <Circle size={10} fill="currentColor" />, title: '点阵' },
                    { type: 'line', icon: <LineIcon size={12} />, title: '线稿' },
                    { type: 'grid', icon: <Grid3X3 size={12} />, title: '格子' }
                  ].map((item) => (
                    <button
                      key={item.type}
                      onClick={() => {
                        onChangeBackgroundPaper?.(item.type as BackgroundPaperType);
                        setIsBackgroundMenuOpen(false);
                      }}
                      className={`p-2 hover:bg-accent rounded-md transition-all ${
                        backgroundPaper === item.type ? 'text-indigo-500 bg-indigo-500/10 scale-105 shadow-sm' : 'text-muted-foreground hover:scale-105'
                      }`}
                      title={item.title}
                    >
                      {item.icon}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticker Mode Toggle */}
          <div className="relative group flex items-center">
            <button
              onClick={onToggleStickerMode}
              title={isStickerMode ? "关闭贴纸模式" : "开启贴纸模式"}
              className={`flex items-center justify-center w-[30px] h-[30px] rounded-lg border transition-all duration-300 ${
                isStickerMode 
                  ? 'bg-pink-500/10 border-pink-500/50 text-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.3)]' 
                  : 'bg-accent/30 border-border/40 text-muted-foreground hover:text-foreground hover:border-border/60'
              }`}
            >
              <Sticker size={16} strokeWidth={isStickerMode ? 2.5 : 2} className={isStickerMode ? 'animate-pulse' : ''} />
            </button>

            {/* Hover Menu */}
            {isStickerMode && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform group-hover:translate-y-0 translate-y-1 z-50">
                <div className="bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border border-border/50 p-1 flex items-center gap-1">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if(onOpenStickerPanel) onOpenStickerPanel();
                    }}
                    className="p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors"
                    title="打开贴纸库"
                  >
                    <Library size={16} />
                  </button>
                  <div className="w-px h-4 bg-border/50 mx-0.5" />
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if(window.confirm('确定要清空当前笔记的所有贴纸吗？')) {
                        if(onClearStickers) onClearStickers();
                      }
                    }}
                    className="p-1.5 hover:bg-rose-500/10 rounded-md text-rose-500 transition-colors"
                    title="一键清理"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <button
            onClick={onSaveAsTemplate}
            title="另存为模板"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg border bg-accent/30 border-border/40 text-muted-foreground hover:text-primary hover:border-primary/40 transition-all duration-300"
          >
            <Copy size={16} />
          </button>

          {/* Actions */}
          <div className="flex items-center gap-1 border-l border-border/40 pl-3 ml-1">
            <button onClick={onSave} title="Save" className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Save size={16} />
            </button>
            <button onMouseEnter={onOutlineEnter} onMouseLeave={onOutlineLeave} title="Outline" className={`p-2 rounded-lg transition-colors ${showOutline ? 'bg-primary/10 text-primary' : 'hover:bg-accent text-muted-foreground hover:text-foreground'}`}>
              <BookMarked size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
