import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  BookMarked,
  ChevronRight,
  Circle,
  Copy,
  Eye,
  Grid3X3,
  Layers,
  Library,
  Pen,
  Save,
  Sticker,
  Trash2,
  Type as LineIcon,
} from 'lucide-react'

import { confirmCompat } from '../../lib/confirmCompat'
import type { BackgroundPaperType } from '../../lib/types'

type Breadcrumb = {
  id: number
  title: string
  icon: string
}

type EditorHeaderProps = {
  icon: string
  title: string
  isTitleManuallyEdited: boolean
  breadcrumbs?: Breadcrumb[]
  onSelectBreadcrumb?: (id: number) => void
  savePhase: 'idle' | 'queued' | 'saving'
  isDirty: boolean
  lastSavedAt: string | null
  showRelations: boolean
  showOutline: boolean
  viewMode: 'edit' | 'preview'
  isStickerMode: boolean
  backgroundPaper?: BackgroundPaperType
  onSave: () => void
  onUpdateTitle: (newTitle: string, isManual: boolean) => void
  onToggleRelations: () => void
  onOutlineEnter: () => void
  onOutlineLeave: () => void
  onSetViewMode: (mode: 'edit' | 'preview') => void
  onToggleStickerMode: () => void
  onOpenStickerPanel?: () => void
  onClearStickers?: () => void
  onSaveAsTemplate?: () => void
  onChangeBackgroundPaper?: (type: BackgroundPaperType) => void
}

const BACKGROUND_OPTIONS: Array<{ type: BackgroundPaperType; title: string; icon: ReactNode }> = [
  { type: 'none', title: '无背景', icon: <Pen size={12} /> },
  { type: 'dot', title: '点阵纸', icon: <Circle size={10} fill="currentColor" /> },
  { type: 'line', title: '横线纸', icon: <LineIcon size={12} /> },
  { type: 'grid', title: '方格纸', icon: <Grid3X3 size={12} /> },
]

export function EditorHeader(props: EditorHeaderProps) {
  const {
    breadcrumbs,
    onSelectBreadcrumb,
    savePhase,
    isDirty,
    lastSavedAt,
    showOutline,
    viewMode,
    isStickerMode,
    backgroundPaper = 'none',
    onSave,
    onOutlineEnter,
    onOutlineLeave,
    onSetViewMode,
    onToggleStickerMode,
    onOpenStickerPanel,
    onClearStickers,
    onSaveAsTemplate,
    onChangeBackgroundPaper,
  } = props

  const [isBackgroundMenuOpen, setIsBackgroundMenuOpen] = useState(false)
  const backgroundMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (backgroundMenuRef.current && !backgroundMenuRef.current.contains(event.target as Node)) {
        setIsBackgroundMenuOpen(false)
      }
    }

    if (isBackgroundMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isBackgroundMenuOpen])

  return (
    <div className="flex flex-col bg-transparent px-0 pt-0 pb-0 antialiased">
      <div className="sticky top-0 z-50 mb-4 flex items-center justify-between border-b border-border/40 bg-background/80 pt-3 pb-3 backdrop-blur-xl transition-colors">
        <div className="flex items-center gap-4">
          <div
            className="flex cursor-default items-center gap-2 rounded-lg p-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-all hover:bg-accent/50"
            title={lastSavedAt ? `已同步于 ${lastSavedAt}` : undefined}
          >
            <div
              className={`h-2 w-2 rounded-full ${
                savePhase === 'saving'
                  ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                  : isDirty
                    ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]'
                    : 'bg-emerald-400'
              }`}
            />
            <span className="opacity-70 group-hover:opacity-100">
              {savePhase === 'saving' ? 'SAVING' : savePhase === 'queued' ? 'QUEUED' : isDirty ? 'UNSAVED' : 'SYNCED'}
            </span>
          </div>

          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1.5 opacity-60 transition-opacity hover:opacity-100">
              {breadcrumbs.map((bc, idx) => (
                <div key={bc.id} className="flex items-center gap-1.5">
                  {idx > 0 && <ChevronRight size={12} className="text-muted-foreground/40" />}
                  <button
                    onClick={() => onSelectBreadcrumb?.(bc.id)}
                    className="max-w-[100px] truncate text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
                  >
                    {bc.title || 'Untitled'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex h-[30px] w-[64px] items-center rounded-lg border border-border/40 bg-accent/30 p-0.5">
            <div
              className="absolute top-0.5 bottom-0.5 z-0 w-[28px] rounded-md border border-border/50 bg-background shadow-sm transition-transform duration-300 ease-out"
              style={{ transform: viewMode === 'edit' ? 'translateX(2px)' : 'translateX(30px)' }}
            />
            <button
              onClick={() => onSetViewMode('edit')}
              title="编辑模式"
              className={`relative z-10 flex flex-1 items-center justify-center rounded-md p-1.5 transition-colors duration-300 ${
                viewMode === 'edit' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80'
              }`}
            >
              <Pen size={13} strokeWidth={2.5} />
            </button>
            <button
              onClick={() => onSetViewMode('preview')}
              title="预览模式"
              className={`relative z-10 flex flex-1 items-center justify-center rounded-md p-1.5 transition-colors duration-300 ${
                viewMode === 'preview' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80'
              }`}
            >
              <Eye size={15} strokeWidth={2.5} />
            </button>
          </div>

          <div className="relative flex items-center" ref={backgroundMenuRef}>
            <button
              onClick={() => setIsBackgroundMenuOpen((open) => !open)}
              className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-border/40 bg-accent/30 text-muted-foreground transition-all duration-300 hover:border-border/60 hover:text-foreground ${
                backgroundPaper !== 'none' || isBackgroundMenuOpen ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-500' : ''
              }`}
              title="切换背景纸"
            >
              <Layers size={16} />
            </button>

            {isBackgroundMenuOpen && (
              <div className="animate-in fade-in slide-in-from-top-1 absolute top-full left-1/2 z-[100] -translate-x-1/2 pt-2 duration-200">
                <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-background/95 p-1 shadow-xl backdrop-blur-md">
                  {BACKGROUND_OPTIONS.map((item) => (
                    <button
                      key={item.type}
                      onClick={() => {
                        onChangeBackgroundPaper?.(item.type)
                        setIsBackgroundMenuOpen(false)
                      }}
                      className={`rounded-md p-2 transition-all hover:bg-accent ${
                        backgroundPaper === item.type
                          ? 'scale-105 bg-indigo-500/10 text-indigo-500 shadow-sm'
                          : 'text-muted-foreground hover:scale-105'
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

          <div className="group relative flex items-center">
            <button
              onClick={onToggleStickerMode}
              title={isStickerMode ? '关闭贴纸模式' : '开启贴纸模式'}
              aria-label="toggle-sticker-mode"
              className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg border transition-all duration-300 ${
                isStickerMode
                  ? 'border-pink-500/50 bg-pink-500/10 text-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.3)]'
                  : 'border-border/40 bg-accent/30 text-muted-foreground hover:border-border/60 hover:text-foreground'
              }`}
            >
              <Sticker size={16} strokeWidth={isStickerMode ? 2.5 : 2} className={isStickerMode ? 'animate-pulse' : ''} />
            </button>

            {isStickerMode && (
              <div className="invisible absolute top-full left-1/2 z-50 -translate-x-1/2 translate-y-1 pt-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-background/95 p-1 shadow-lg backdrop-blur-sm">
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenStickerPanel?.()
                    }}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="打开贴纸库"
                    aria-label="open-sticker-panel"
                  >
                    <Library size={16} />
                  </button>
                  <div className="mx-0.5 h-4 w-px bg-border/50" />
                  <button
                    aria-label="clear-stickers"
                    onClick={async (event) => {
                      event.stopPropagation()
                      const confirmed = await confirmCompat({
                        title: '确定要清空当前笔记的所有贴纸吗？',
                        description: '清理后当前笔记里的贴纸会立即移除，但不会影响贴纸库。',
                        confirmLabel: '清空贴纸',
                        cancelLabel: '再想想',
                        danger: true,
                      })

                      if (confirmed) {
                        onClearStickers?.()
                      }
                    }}
                    className="rounded-md p-1.5 text-rose-500 transition-colors hover:bg-rose-500/10"
                    title="一键清理贴纸"
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
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-border/40 bg-accent/30 text-muted-foreground transition-all duration-300 hover:border-primary/40 hover:text-primary"
          >
            <Copy size={16} />
          </button>

          <div className="ml-1 flex items-center gap-1 border-l border-border/40 pl-3">
            <button
              onClick={onSave}
              title="Save"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Save size={16} />
            </button>
            <button
              onMouseEnter={onOutlineEnter}
              onMouseLeave={onOutlineLeave}
              title="Outline"
              className={`rounded-lg p-2 transition-colors ${
                showOutline ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <BookMarked size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
