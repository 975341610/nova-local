import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Layout, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { NoteTemplate } from '../../lib/types';

interface TemplatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'select' | 'save';
  onSelect?: (template: NoteTemplate) => void;
  onSave?: (name: string) => void;
  initialContent?: string;
}

export function TemplatePicker({ isOpen, onClose, mode, onSelect, onSave }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<NoteTemplate | null>(null);

  useEffect(() => {
    if (isOpen && mode === 'select') {
      loadTemplates();
    }
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen) {
      setPendingDelete(null);
      setSearchQuery('');
      setNewName('');
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await api.listTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (newName.trim() && onSave) {
      onSave(newName.trim());
      setNewName('');
      onClose();
    }
  };

  const handleDeleteTemplate = (e: React.MouseEvent, template: NoteTemplate) => {
    e.stopPropagation();
    setPendingDelete(template);
  };

  const confirmDeleteTemplate = async () => {
    if (!pendingDelete) {
      return;
    }

    try {
      await api.deleteTemplate(pendingDelete.id);
      setTemplates((prev) => prev.filter((template) => template.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  const filteredTemplates = templates.filter((template) =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border/40 bg-accent/10 p-4">
              <h3 className="flex items-center gap-2 font-bold">
                <Layout size={18} className="text-primary" />
                {mode === 'select' ? '选择模板' : '另存为模板'}
              </h3>
              <button onClick={onClose} className="rounded-full p-1 transition-colors hover:bg-accent">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {mode === 'select' ? (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <input
                      autoFocus
                      type="text"
                      placeholder="搜索模板..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-border/40 bg-accent/30 py-2 pl-10 pr-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {pendingDelete && (
                    <div
                      data-testid="template-delete-confirm"
                      className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-rose-600">确认删除模板？</div>
                        <div className="truncate text-xs text-muted-foreground">{pendingDelete.name}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          data-testid="template-delete-cancel"
                          onClick={() => setPendingDelete(null)}
                          className="px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          data-testid="template-delete-confirm-action"
                          onClick={confirmDeleteTemplate}
                          className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-600"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )}

                  {loading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
                      正在加载模板库...
                    </div>
                  ) : filteredTemplates.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {filteredTemplates.map((template) => (
                        <div
                          key={template.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelect?.(template)}
                          onKeyDown={(e) => e.key === 'Enter' && onSelect?.(template)}
                          className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent p-3 text-left transition-all hover:border-primary/20 hover:bg-primary/5"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/40 text-xl transition-colors group-hover:bg-primary/10">
                            {template.icon || '📝'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{template.name}</div>
                            <div className="truncate text-[10px] text-muted-foreground opacity-60">
                              {template.category || '通用'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={(e) => handleDeleteTemplate(e, template)}
                              className="rounded-md p-1.5 text-rose-500 transition-colors hover:bg-rose-500/10"
                              title="删除模板"
                              aria-label={`delete-template-${template.id}`}
                            >
                              <Trash2 size={14} />
                            </button>
                            <div className="p-1.5 text-primary">
                              <Check size={16} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 py-12 text-center">
                      <div className="text-sm text-muted-foreground">暂无匹配模板</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      模板名称
                    </label>
                    <input
                      autoFocus
                      type="text"
                      placeholder="例如：每日复盘、项目周报..."
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                      className="w-full rounded-xl border border-border/40 bg-accent/30 px-4 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="rounded-xl border border-primary/10 bg-primary/5 p-3 text-[11px] leading-relaxed text-primary/70">
                    将当前笔记的内容、布局与装饰保存为模板，后续可以一键复用。
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-border/40 bg-accent/5 p-4">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                取消
              </button>
              {mode === 'save' && (
                <button
                  disabled={!newName.trim()}
                  onClick={handleSave}
                  className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                >
                  <Plus size={16} />
                  保存模板
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
