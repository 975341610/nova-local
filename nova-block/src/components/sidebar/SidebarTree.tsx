import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Settings, FilePlus, FolderPlus, Edit2, Copy, Trash2, FolderOutput, FileText, Waypoints, LayoutGrid, Layout, Sparkles } from 'lucide-react';
import { buildTree, moveNode, isDescendant, flattenTree, normalizeSelectedRoots } from '../../lib/novablock/treeUtils';
import type { TreeNode, FlattenedNode } from '../../lib/novablock/treeUtils';
import { TreeNodeItem } from './TreeNodeItem';
import GlobalSearchPanel from './GlobalSearchPanel';
import BacklinksPanel from './BacklinksPanel';
import AIImportPanel from './AIImportPanel';
import { useNoteStore } from '../../store/useNoteStore';
import { QINGZHI_SETTINGS_EVENT, readQingzhiSettings } from '../../lib/qingzhiSettings';
import { getLastOpened } from '../../lib/novablock/openHistory';

/** F2c · 排序模式 */
type SortMode = 'manual' | 'created' | 'updated' | 'opened';
const SORT_MODE_STORAGE_KEY = 'qz.sidebar.sortMode.v1';

const parseTs = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
};

/**
 * 把时间戳/打开次数转换为可由 buildTree 使用的"逆序" sortKey:
 * 越大的 ts(越新/最近打开) → 越小的字符串 → 在 ascending sort 下排在前面.
 * 13 位 0 填充以保证字符串比较 == 数值比较.
 */
const tsToInvKey = (ts: number): string => {
  const MAX = 9999999999999; // 13 位
  const v = Math.max(0, Math.min(MAX, Math.floor(ts)));
  return String(MAX - v).padStart(13, '0');
};

interface SidebarTreeProps {
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string) => void;
  onNodeAdd?: (parentId: string | null, type?: 'file' | 'folder' | 'canvas') => void;
  onNodeMove?: (nodeId: string, parentId: string | null, sortKey: string) => void;
  onNodeRename?: (nodeId: string, newTitle: string) => void;
  onNodeDelete?: (nodeId: string, deleteChildren: boolean) => void;
  onNodeDuplicate?: (nodeId: string) => void;
  /** F2b · 批量移动 (一次性移动多个节点到 parentId, 父级负责生成 sortKey 序列) */
  onNodesBulkMove?: (nodeIds: string[], parentId: string | null) => void;
  /** F2b · 批量删除 (含其子树) */
  onNodesBulkDelete?: (nodeIds: string[]) => void;
  onTemplateCreate?: (parentId: string | null) => void;
  onQuickSearchOpen?: () => void;
  onSettingsOpen?: () => void;
  className?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

const AnimatedLabel = ({ children, isCollapsed, className = "" }: { children: React.ReactNode, isCollapsed: boolean, className?: string }) => (
  <AnimatePresence>
    {!isCollapsed && (
      <motion.span
        initial={{ opacity: 0, x: -10, width: 0 }}
        animate={{ opacity: 1, x: 0, width: "auto" }}
        exit={{ opacity: 0, x: -10, width: 0 }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        className={`whitespace-nowrap overflow-hidden ${className}`}
      >
        {children}
      </motion.span>
    )}
  </AnimatePresence>
);

export const SidebarTree = ({
  selectedNodeId = null,
  onNodeSelect,
  onNodeAdd,
  onNodeMove,
  onNodeRename,
  onNodeDelete,
  onNodeDuplicate,
  onNodesBulkMove,
  onNodesBulkDelete,
  onTemplateCreate,
  onQuickSearchOpen,
  onSettingsOpen,
  className = '',
  isCollapsed: externalIsCollapsed,
}: SidebarTreeProps) => {
  const notes = useNoteStore((state) => state.notes);

  // F2c · 排序模式 (持久化)
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    try {
      const v = localStorage.getItem(SORT_MODE_STORAGE_KEY);
      if (v === 'created' || v === 'updated' || v === 'opened' || v === 'manual') return v;
    } catch { /* ignore */ }
    return 'manual';
  });

  useEffect(() => {
    try {
      localStorage.setItem(SORT_MODE_STORAGE_KEY, sortMode);
    } catch { /* ignore */ }
  }, [sortMode]);

  // 将 treeData 转换为 TreeNode 格式以供 treeUtils 使用
  // F2b: 显式将 id / parentId 强制为 string,避免下游 callback 收到 number
  // F2c: 当 sortMode != 'manual' 时,用合成 sortKey 覆盖 position,使 buildTree 按目标字段降序排列
  const nodes = useMemo(() => {
    return notes.map(n => {
      const id = String(n.id);
      let sortKey: string;
      if (sortMode === 'created') {
        sortKey = tsToInvKey(parseTs((n as { created_at?: string | number }).created_at));
      } else if (sortMode === 'updated') {
        sortKey = tsToInvKey(parseTs((n as { updated_at?: string | number }).updated_at));
      } else if (sortMode === 'opened') {
        sortKey = tsToInvKey(getLastOpened(id));
      } else {
        // F2 bug 2b: 优先使用 sort_key (后端真相),回退到 position
        const sk = (n as { sort_key?: string | null }).sort_key;
        if (sk != null && sk !== '') {
          sortKey = String(sk);
        } else {
          sortKey = n.position?.toString() || 'm';
        }
      }
      return {
        ...n,
        id,
        parentId: n.parent_id == null ? null : String(n.parent_id),
        sortKey,
        isFolder: n.is_folder,
      };
    }) as unknown as TreeNode[];
  }, [notes, sortMode]);

  const [selectedId, setSelectedId] = useState<string | undefined>(selectedNodeId ?? undefined);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['root']));
  const [internalIsCollapsed] = useState(false);

  const isCollapsed = externalIsCollapsed !== undefined ? externalIsCollapsed : internalIsCollapsed;

  const [activeTab, setActiveTab] = useState<'tree' | 'search' | 'backlinks' | 'ai'>('tree');
  const [mascotOpacity, setMascotOpacity] = useState(() => readQingzhiSettings().mascotOpacity);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: TreeNode } | null>(null);
  const [blankContextMenu, setBlankContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [bulkContextMenu, setBulkContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ node: TreeNode } | null>(null);
  const [bulkDeleteModal, setBulkDeleteModal] = useState<{ ids: string[] } | null>(null);
  const [moveToModal, setMoveToModal] = useState<{ node: TreeNode } | null>(null);
  const [bulkMoveModal, setBulkMoveModal] = useState<{ ids: string[] } | null>(null);
  const [moveToSearchQuery, setMoveToSearchQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // F2b · multi-select state
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);

  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setBlankContextMenu(null);
      setBulkContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    setSelectedId(selectedNodeId ?? undefined);
  }, [selectedNodeId]);

  useEffect(() => {
    if (contextMenu && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const padding = 8;
      let { x, y } = contextMenu;
      
      if (x + rect.width > window.innerWidth - padding) {
        x = window.innerWidth - rect.width - padding;
      }
      if (y + rect.height > window.innerHeight - padding) {
        y = window.innerHeight - rect.height - padding;
      }
      
      menuRef.current.style.left = `${Math.max(padding, x)}px`;
      menuRef.current.style.top = `${Math.max(padding, y)}px`;
      // Ensure visibility is restored after positioning
      menuRef.current.style.opacity = '1';
    }
  }, [contextMenu]);

  useEffect(() => {
    const handleSettingsChange = () => {
      setMascotOpacity(readQingzhiSettings().mascotOpacity);
    };

    window.addEventListener(QINGZHI_SETTINGS_EVENT, handleSettingsChange);
    return () => window.removeEventListener(QINGZHI_SETTINGS_EVENT, handleSettingsChange);
  }, []);

  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const visibleNodes = useMemo(() => flattenTree(tree, expandedIds), [tree, expandedIds]);

  // F3 bug · 排序按日期分组 (今天/昨天/更早)
  // 仅当 sortMode 选择了 created/updated/opened 时,把 visibleNodes 按日期桶分段,
  // 在每段前插入一行 group header (id 以 __group__: 开头, 渲染时显式区分)。
  type GroupBucket = 'today' | 'yesterday' | 'earlier';
  type GroupHeaderRow = { __isGroupHeader: true; id: string; title: string; bucket: GroupBucket };
  type RowItem = FlattenedNode | GroupHeaderRow;

  const groupedRows: RowItem[] = useMemo(() => {
    if (sortMode === 'manual') return visibleNodes as RowItem[];
    // 计算今天 0 点
    const now = Date.now();
    const today0 = new Date(now);
    today0.setHours(0, 0, 0, 0);
    const todayStart = today0.getTime();
    const yesterdayStart = todayStart - 24 * 3600 * 1000;
    const tomorrowStart = todayStart + 24 * 3600 * 1000;

    const tsForNode = (n: TreeNode): number => {
      const id = String(n.id);
      if (sortMode === 'opened') return getLastOpened(id);
      if (sortMode === 'created')
        return parseTs((n as { created_at?: string | number }).created_at);
      if (sortMode === 'updated')
        return parseTs((n as { updated_at?: string | number }).updated_at);
      return 0;
    };
    const bucketOf = (ts: number): GroupBucket => {
      if (ts >= todayStart && ts < tomorrowStart) return 'today';
      if (ts >= yesterdayStart && ts < todayStart) return 'yesterday';
      return 'earlier';
    };
    const labelOf = (b: GroupBucket): string =>
      b === 'today' ? '今天' : b === 'yesterday' ? '昨天' : '更早';

    const rows: RowItem[] = [];
    let lastBucket: GroupBucket | null = null;
    for (const n of visibleNodes) {
      // 仅在 root 层(depth=0,即没有 parentId 的可见节点)插入分组头,
      // 子节点跟随其父级,不重复分组。
      if (n.parentId == null) {
        const b = bucketOf(tsForNode(n));
        if (b !== lastBucket) {
          rows.push({
            __isGroupHeader: true,
            id: `__group__:${b}`,
            title: labelOf(b),
            bucket: b,
          });
          lastBucket = b;
        }
      }
      rows.push(n);
    }
    return rows;
  }, [visibleNodes, sortMode]);

  const handleToggle = (nodeId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleMove = (nodeId: string, targetId: string, position: 'before' | 'after' | 'into') => {
    // 1. 禁止将节点移动到自身
    if (nodeId === targetId) return;

    // 2. 循环检测：禁止将节点移动到其自身的子孙节点内部
    // 如果目标是 nodeId 的子孙，则拦截
    if (isDescendant(nodes, targetId, nodeId)) {
      console.warn('Cannot move a parent node into its own descendant');
      return;
    }

    // F2 bug 2a: 如果被拖拽的节点处于多选集合 (size>=2),走批量移动而非单条移动。
    // 仅当 position === 'into' 时支持(批量 only 接受 parentId,不区分 before/after)。
    if (multiSelected.has(nodeId) && multiSelected.size >= 2 && position === 'into') {
      const ids = normalizeSelectedRoots(nodes, multiSelected);
      // 拒绝把多选集合中的祖先移动到自己的子孙
      const blocked = ids.some((id) => isDescendant(nodes, targetId, id));
      if (blocked) {
        console.warn('Cannot bulk-move into a descendant of selected nodes');
        return;
      }
      onNodesBulkMove?.(ids, targetId);
      // 自动展开目标文件夹
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(targetId);
        return next;
      });
      setMultiSelected(new Set());
      return;
    }

    const { parentId, sortKey } = moveNode(nodes, nodeId, targetId, position);

    // Batch 4-pre: 移除直接 store 写入,统一委托父级 onNodeMove
    // 父级 (App.tsx handleNodeMove) 是 source of truth,
    // 负责本地乐观更新 + 远端 api.updateNote + 失败回滚。
    onNodeMove?.(nodeId, parentId, sortKey);
  };

  const handleSelect = (nodeId: string) => {
    setSelectedId(nodeId);
    onNodeSelect?.(nodeId);
  };

  const activeBacklinksNoteId = useMemo(() => {
    const effectiveId = selectedNodeId ?? selectedId ?? null;
    if (!effectiveId) {
      return null;
    }

    const parsed = parseInt(effectiveId, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, [selectedId, selectedNodeId]);

  return (
    <motion.aside
      initial={false}
      animate={{ 
        width: isCollapsed ? 64 : 280,
      }}
      transition={{ 
        duration: 0.4, 
        ease: [0.32, 0.72, 0, 1] 
      }}
      data-testid="qingzhi-real-sidebar"
      className={`
        qz-sidebar h-full border-r border-border/40 bg-background/60 backdrop-blur-2xl flex flex-col relative
        ${className}
      `}
    >
      <div
        data-testid="qingzhi-sidebar-mascot"
        className="qz-mascot-backdrop"
        style={{ opacity: mascotOpacity }}
      />
      {/* Sidebar Header */}
      <div data-testid="qingzhi-sidebar-header" className="qz-sidebar-header relative z-10 flex items-center h-[72px] overflow-hidden px-4">
        <motion.div
          animate={{
            width: isCollapsed ? 64 : "auto",
            justifyContent: isCollapsed ? "center" : "flex-start"
          }}
          className={`flex items-center shrink-0 ${isCollapsed ? 'gap-0' : 'gap-3'}`}
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-[var(--nv-color-border)] bg-[var(--nv-color-surface-2)] text-sm font-bold text-[var(--nv-color-accent-fg)] shadow-[var(--nv-shadow-rest)]">
            知
          </div>
          <AnimatedLabel isCollapsed={isCollapsed}>
            <span className="text-sm font-bold text-foreground/80 tracking-[0.16em]">清知手账</span>
          </AnimatedLabel>
        </motion.div>
      </div>

      <motion.div 
        animate={{ 
          flexDirection: isCollapsed ? "column" : "row",
          gap: isCollapsed ? 8 : 16,
          paddingLeft: isCollapsed ? 12 : 16,
          paddingRight: isCollapsed ? 12 : 16
        }}
        className="qz-sidebar-tab-strip py-2 flex items-center justify-center border-b border-border/10 mb-2 min-h-[56px] overflow-hidden"
        data-testid="qingzhi-sidebar-tab-strip"
      >
        <button
          onClick={() => setActiveTab('tree')}
          title="文件树"
          className={`qz-sidebar-tab relative group flex items-center justify-center w-10 h-10 rounded-xl transition-all shrink-0 ${
            activeTab === 'tree' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/50'
          }`}
        >
          <FileText size={18} />
          <div className="absolute left-full ml-2 px-2 py-1 bg-foreground text-background text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
            文件树
          </div>
        </button>
        <button
          onClick={() => setActiveTab('search')}
          title="全局搜索"
          className={`qz-sidebar-tab relative group flex items-center justify-center w-10 h-10 rounded-xl transition-all shrink-0 ${
            activeTab === 'search' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/50'
          }`}
        >
          <Search size={18} />
          <div className="absolute left-full ml-2 px-2 py-1 bg-foreground text-background text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
            全局搜索
          </div>
        </button>
        <button
          onClick={() => setActiveTab('backlinks')}
          title="双向链接"
          className={`qz-sidebar-tab relative group flex items-center justify-center w-10 h-10 rounded-xl transition-all shrink-0 ${
            activeTab === 'backlinks' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/50'
          }`}
        >
          <Waypoints size={18} />
          <div className="absolute left-full ml-2 px-2 py-1 bg-foreground text-background text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
            双向链接
          </div>
        </button>
        <button
          type="button"
          aria-label="open-ai-panel"
          onClick={() => setActiveTab('ai')}
          title="AI"
          className={`qz-sidebar-tab relative group flex items-center justify-center w-10 h-10 rounded-xl transition-all shrink-0 ${
            activeTab === 'ai' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/50'
          }`}
        >
          <Sparkles size={18} />
          <div className="absolute left-full ml-2 px-2 py-1 bg-foreground text-background text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
            AI
          </div>
        </button>
      </motion.div>

      {activeTab === 'search' && (
        <div className="flex-1 overflow-hidden">
          <GlobalSearchPanel 
            notes={notes} 
            onSelectNote={(note) => onNodeSelect?.(note.id.toString())}
            onClose={() => setActiveTab('tree')}
          />
        </div>
      )}

      {activeTab === 'backlinks' && (
        <div className="flex-1 overflow-hidden">
          <BacklinksPanel 
            currentNoteId={activeBacklinksNoteId}
            notes={notes}
            onSelectNote={(note) => onNodeSelect?.(note.id.toString())}
          />
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="flex-1 overflow-hidden">
          <AIImportPanel
            selectedNoteId={selectedNodeId ?? selectedId ?? null}
            onSelectNoteId={(noteId) => {
              setSelectedId(noteId);
              onNodeSelect?.(noteId);
            }}
          />
        </div>
      )}

      {activeTab === 'tree' && (
        <>
          {/* Quick Actions */}
          <div className="px-3 pb-4 space-y-2">
            <button
              onClick={onQuickSearchOpen}
              className="qz-sidebar-quick-search flex items-center h-11 w-full text-xs font-medium text-muted-foreground bg-accent/30 hover:bg-accent/60 border border-border/20 rounded-2xl transition-all duration-300 group overflow-hidden"
              data-testid="qingzhi-sidebar-quick-search"
              title={isCollapsed ? "快速搜索 (⌘K)" : undefined}
            >
              <motion.div
                animate={{
                  width: isCollapsed ? 40 : 44,
                  marginLeft: isCollapsed ? 0 : 4,
                  marginRight: isCollapsed ? 0 : 4
                }}
                className="h-10 flex items-center justify-center shrink-0 w-full"
              >
                <Search size={14} className="group-hover:scale-110 transition-transform shrink-0" />
              </motion.div>
              <AnimatedLabel isCollapsed={isCollapsed} className="flex-1">
                <div className="flex items-center w-full pr-3">
                  <span>快速搜索</span>
                  <kbd className="ml-auto text-[10px] opacity-40 font-sans bg-background/50 px-1.5 py-0.5 rounded-lg border border-border/10">⌘K</kbd>
                </div>
              </AnimatedLabel>
            </button>
          </div>

          {/* Scrollable Tree Area */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-1 custom-scrollbar px-3">
            {!isCollapsed && (
              <div className="flex items-center justify-between px-3 py-2 group/header">
                <div data-testid="qingzhi-sidebar-section-title" className="qz-sidebar-section-title text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">我的手账</div>
                <div className="flex items-center gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity duration-200">
                  <button 
                    onClick={() => onNodeAdd?.(null, 'file')}
                    className="p-1 rounded-md hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110"
                    title="新建笔记"
                  >
                    <FilePlus size={14} />
                  </button>
                  <button 
                    onClick={() => onTemplateCreate?.(null)}
                    className="p-1 rounded-md hover:bg-accent/60 text-primary hover:text-primary transition-all duration-200 hover:scale-110"
                    title="从模板创建"
                  >
                    <Layout size={14} />
                  </button>
                  <button 
                    onClick={() => onNodeAdd?.(null, 'canvas')}
                    className="p-1 rounded-md hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110"
                    title="新建画布"
                  >
                    <LayoutGrid size={14} />
                  </button>
                  <button 
                    onClick={() => onNodeAdd?.(null, 'folder')}
                    className="p-1 rounded-md hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110"
                    title="新建文件夹"
                  >
                    <FolderPlus size={14} />
                  </button>
                </div>
              </div>
            )}
            {isCollapsed && (
               <div className="flex flex-col items-center gap-2 py-2">
                 <button 
                   onClick={() => onNodeAdd?.(null, 'file')}
                   className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all flex items-center justify-center w-10 h-10"
                   title="新建笔记"
                 >
                   <FilePlus size={16} />
                 </button>
                 <button 
                   onClick={() => onTemplateCreate?.(null)}
                   className="p-2 rounded-xl bg-primary text-white hover:scale-105 transition-all flex items-center justify-center w-10 h-10 shadow-lg shadow-primary/20"
                   title="从模板创建"
                 >
                   <Layout size={16} />
                 </button>
                 <button 
                   onClick={() => onNodeAdd?.(null, 'canvas')}
                   className="p-2 rounded-xl bg-accent/40 text-muted-foreground hover:bg-accent/70 hover:text-foreground transition-all flex items-center justify-center w-10 h-10"
                   title="新建画布"
                 >
                   <LayoutGrid size={16} />
                 </button>
               </div>
            )}
            {!isCollapsed && (
              <div className="px-2 pb-1 flex items-center justify-end">
                <select
                  data-testid="qingzhi-sidebar-sort-select"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="text-xs bg-transparent border border-border/50 rounded-md px-2 py-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  title="排序方式"
                >
                  <option value="manual">手动顺序</option>
                  <option value="created">创建时间</option>
                  <option value="updated">修改时间</option>
                  <option value="opened">最近打开</option>
                </select>
              </div>
            )}
            {!isCollapsed && (
              <div
                data-sidebar-tree-canvas
                onClick={(e) => {
                  // F2 bug 2c: 点击空白区域(非节点本身)→ 清空多选
                  const target = e.target as HTMLElement;
                  if (target.closest('[data-tree-node-id]')) return;
                  if (multiSelected.size > 0) setMultiSelected(new Set());
                }}
                onContextMenu={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('[data-tree-node-id]')) return;
                  if (!target.closest('[data-sidebar-tree-canvas]')) return;
                  e.preventDefault();
                  setBlankContextMenu({ x: e.clientX, y: e.clientY });
                }}
                className="flex-1"
                style={{ height: '100%', minHeight: 400 }}
              >
                <div style={{ height: '100%' }}>
                  {groupedRows.map((row) => {
                    if ('__isGroupHeader' in row && row.__isGroupHeader) {
                      return (
                        <div
                          key={row.id}
                          data-testid="qingzhi-sidebar-group-header"
                          data-group-bucket={row.bucket}
                          className="qz-sidebar-group-header px-3 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-muted-foreground/60 uppercase select-none"
                        >
                          {row.title}
                        </div>
                      );
                    }
                    const node = row as FlattenedNode;
                    return (
                      <TreeNodeItem
                        key={node.id}
                        node={node}
                        onMove={handleMove}
                        onSelect={handleSelect}
                        onToggle={handleToggle}
                        selectedId={selectedId}
                        editingId={editingId}
                        isMultiSelected={multiSelected.has(node.id)}
                        onItemClick={(e, n) => {
                          // F2b 多选交互: Ctrl/Cmd toggle, Shift range, plain → 清空多选
                          const isMod = e.ctrlKey || e.metaKey;
                          if (isMod) {
                            setMultiSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(n.id)) next.delete(n.id);
                              else next.add(n.id);
                              return next;
                            });
                            setRangeAnchor(n.id);
                            return true;
                          }
                          if (e.shiftKey && rangeAnchor) {
                            const ids = visibleNodes.map((v) => v.id);
                            const a = ids.indexOf(rangeAnchor);
                            const b = ids.indexOf(n.id);
                            if (a >= 0 && b >= 0) {
                              const [from, to] = a < b ? [a, b] : [b, a];
                              const range = ids.slice(from, to + 1);
                              setMultiSelected((prev) => {
                                const next = new Set(prev);
                                range.forEach((id) => next.add(id));
                                return next;
                              });
                            }
                            return true;
                          }
                          // plain click → 清空多选,让默认行为继续 (toggle/select)
                          if (multiSelected.size > 0) setMultiSelected(new Set());
                          setRangeAnchor(n.id);
                          return false;
                        }}
                        onContextMenu={(e, n) => {
                          // F2b: 若右击节点本身处于多选集合且 size>=2 → 弹批量菜单
                          if (multiSelected.has(n.id) && multiSelected.size >= 2) {
                            setBulkContextMenu({ x: e.clientX, y: e.clientY });
                            return;
                          }
                          setContextMenu({ x: e.clientX, y: e.clientY, node: n });
                        }}
                        onRenameSubmit={(nodeId, newTitle) => {
                          setEditingId(null);
                          if (newTitle.trim() && newTitle !== node.title) {
                            onNodeRename?.(nodeId, newTitle);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            
            {!isCollapsed && visibleNodes.length === 0 && (
              <div className="py-12 text-center space-y-3 opacity-40">
                <div className="text-muted-foreground text-xs">暂无手账内容</div>
                <button 
                  onClick={() => onNodeAdd?.(null, 'file')}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  开启第一篇治愈之旅
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-border/20 flex justify-center overflow-hidden">
            <button 
              onClick={onSettingsOpen}
              className="qz-sidebar-footer-settings flex items-center h-11 w-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-xl transition-all duration-300 overflow-hidden"
              data-testid="qingzhi-sidebar-footer-settings"
              title={isCollapsed ? "设置与空间管理" : undefined}
            >
              <motion.div 
                animate={{ 
                  width: isCollapsed ? 40 : 44,
                  marginLeft: isCollapsed ? 0 : 4,
                  marginRight: isCollapsed ? 0 : 4
                }}
                className="h-10 flex items-center justify-center shrink-0 w-full"
              >
                <Settings size={14} className="shrink-0" />
              </motion.div>
              <AnimatedLabel isCollapsed={isCollapsed}>
                <span className="pr-3">设置与空间管理</span>
              </AnimatedLabel>
            </button>
          </div>
        </>
      )}

      {/* 移除旧的 isCollapsed 判断块，因为我们现在采用了统一的侧边栏结构 */}

      {/* Context Menu Portal */}
      {contextMenu && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 w-48 bg-background/80 backdrop-blur-2xl border border-border/40 shadow-xl rounded-xl py-1 max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ top: contextMenu.y, left: contextMenu.x, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node.isFolder && (
            <>
              <button 
                onClick={() => {
                  onNodeAdd?.(contextMenu.node.id, 'file');
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-foreground transition-colors"
              >
                <FilePlus size={14} className="text-muted-foreground" /> 新建笔记
              </button>
              <button 
                onClick={() => {
                  onNodeAdd?.(contextMenu.node.id, 'canvas');
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-foreground transition-colors"
              >
                <LayoutGrid size={14} className="text-muted-foreground" /> 新建画布
              </button>
              <button 
                onClick={() => {
                  onNodeAdd?.(contextMenu.node.id, 'folder');
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-foreground transition-colors"
              >
                <FolderPlus size={14} className="text-muted-foreground" /> 新建文件夹
              </button>
              <div className="h-px bg-border/40 my-1 mx-2" />
            </>
          )}
          <button 
            onClick={() => {
              setEditingId(contextMenu.node.id);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-foreground transition-colors"
          >
            <Edit2 size={14} className="text-muted-foreground" /> 重命名
          </button>
          <button 
            onClick={() => {
              onNodeDuplicate?.(contextMenu.node.id);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-foreground transition-colors"
          >
            <Copy size={14} className="text-muted-foreground" /> 制作副本
          </button>
          <button 
            onClick={() => {
              setMoveToModal({ node: contextMenu.node });
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-foreground transition-colors"
          >
            <FolderOutput size={14} className="text-muted-foreground" /> 移动到...
          </button>
          <div className="h-px bg-border/40 my-1 mx-2" />
          <button
            onClick={() => {
              if (contextMenu.node.isFolder && contextMenu.node.children && contextMenu.node.children.length > 0) {
                setDeleteModal({ node: contextMenu.node });
              } else {
                onNodeDelete?.(contextMenu.node.id, true);
              }
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-destructive/10 text-destructive transition-colors group"
          >
            <Trash2 size={14} className="text-destructive/70 group-hover:text-destructive" /> 删除
          </button>
        </div>,
        document.body
      )}

      {/* Blank-area Context Menu Portal (F2a) */}
      {blankContextMenu && createPortal(
        <div
          data-testid="qingzhi-sidebar-blank-context-menu"
          className="fixed z-50 w-44 bg-background/80 backdrop-blur-2xl border border-border/40 shadow-xl rounded-xl py-1"
          style={{ top: blankContextMenu.y, left: blankContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            data-testid="qingzhi-sidebar-blank-new-folder"
            onClick={() => {
              onNodeAdd?.(null, 'folder');
              setBlankContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-foreground transition-colors"
          >
            <FolderPlus size={14} className="text-muted-foreground" /> 新建文件夹
          </button>
          <button
            data-testid="qingzhi-sidebar-blank-new-note"
            onClick={() => {
              onNodeAdd?.(null, 'file');
              setBlankContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-foreground transition-colors"
          >
            <FilePlus size={14} className="text-muted-foreground" /> 新建笔记
          </button>
          <button
            data-testid="qingzhi-sidebar-blank-new-canvas"
            onClick={() => {
              onNodeAdd?.(null, 'canvas');
              setBlankContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-foreground transition-colors"
          >
            <LayoutGrid size={14} className="text-muted-foreground" /> 新建画布
          </button>
        </div>,
        document.body
      )}

      {/* Bulk Context Menu Portal (F2b) */}
      {bulkContextMenu && createPortal(
        <div
          data-testid="qingzhi-sidebar-bulk-context-menu"
          className="fixed z-50 w-48 bg-background/80 backdrop-blur-2xl border border-border/40 shadow-xl rounded-xl py-1"
          style={{ top: bulkContextMenu.y, left: bulkContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
            已选 {multiSelected.size} 项
          </div>
          <button
            data-testid="qingzhi-sidebar-bulk-move"
            onClick={() => {
              const ids = normalizeSelectedRoots(nodes, multiSelected);
              setBulkMoveModal({ ids });
              setBulkContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-foreground transition-colors"
          >
            <FolderOutput size={14} className="text-muted-foreground" /> 移动选中...
          </button>
          <div className="h-px bg-border/40 my-1 mx-2" />
          <button
            data-testid="qingzhi-sidebar-bulk-delete"
            onClick={() => {
              const ids = normalizeSelectedRoots(nodes, multiSelected);
              setBulkDeleteModal({ ids });
              setBulkContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-destructive/10 text-destructive transition-colors group"
          >
            <Trash2 size={14} className="text-destructive/70 group-hover:text-destructive" /> 删除选中
          </button>
        </div>,
        document.body
      )}

      {/* Bulk Delete Confirmation (F2b) */}
      <AnimatePresence>
        {bulkDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-background border border-border/40 shadow-2xl rounded-2xl p-6 max-w-sm w-full"
            >
              <h3 className="text-lg font-bold mb-2">删除 {bulkDeleteModal.ids.length} 项</h3>
              <p className="text-sm text-muted-foreground mb-6">
                这些条目及其所有子项都会被一并删除。此操作无法撤销。
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setBulkDeleteModal(null)}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-accent/30 hover:bg-accent/60 rounded-xl transition-colors"
                >
                  取消
                </button>
                <button
                  data-testid="qingzhi-sidebar-bulk-delete-confirm"
                  onClick={() => {
                    onNodesBulkDelete?.(bulkDeleteModal.ids);
                    setBulkDeleteModal(null);
                    setMultiSelected(new Set());
                  }}
                  className="px-4 py-2 text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-xl transition-colors"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Move Dialog (F2b) */}
      <AnimatePresence>
        {bulkMoveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-background border border-border/40 shadow-2xl rounded-2xl flex flex-col max-w-md w-full max-h-[80vh]"
            >
              <div className="p-4 border-b border-border/20">
                <h3 className="text-lg font-bold mb-3">移动 {bulkMoveModal.ids.length} 项到...</h3>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    autoFocus
                    type="text"
                    value={moveToSearchQuery}
                    onChange={(e) => setMoveToSearchQuery(e.target.value)}
                    placeholder="搜索目标文件夹..."
                    className="w-full bg-accent/30 border border-border/20 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <button
                  data-testid="qingzhi-sidebar-bulk-move-root"
                  onClick={() => {
                    onNodesBulkMove?.(bulkMoveModal.ids, null);
                    setBulkMoveModal(null);
                    setMultiSelected(new Set());
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 rounded-lg text-left"
                >
                  <LayoutGrid size={16} className="text-muted-foreground" /> 根目录
                </button>
                {nodes
                  .filter((n) => n.isFolder
                    && !bulkMoveModal.ids.includes(n.id)
                    && !bulkMoveModal.ids.some((mId) => isDescendant(nodes, n.id, mId))
                    && (n.title || '').toLowerCase().includes(moveToSearchQuery.toLowerCase()))
                  .map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => {
                        onNodesBulkMove?.(bulkMoveModal.ids, folder.id);
                        // F2 bug 2b: 自动展开目标文件夹,避免移动后看不到结果
                        setExpandedIds((prev) => {
                          const next = new Set(prev);
                          next.add(folder.id);
                          return next;
                        });
                        setBulkMoveModal(null);
                        setMultiSelected(new Set());
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 rounded-lg text-left"
                    >
                      <FolderPlus size={16} className="text-primary/70" /> {folder.title || '无标题文件夹'}
                    </button>
                  ))}
              </div>
              <div className="p-4 border-t border-border/20 flex justify-end">
                <button
                  onClick={() => setBulkMoveModal(null)}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-accent/30 hover:bg-accent/60 rounded-xl transition-colors"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-background border border-border/40 shadow-2xl rounded-2xl p-6 max-w-sm w-full"
            >
              <h3 className="text-lg font-bold mb-2">删除文件夹</h3>
              <p className="text-sm text-muted-foreground mb-6">
                「{deleteModal.node.title}」包含子项目。您希望如何处理这些子项目？
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    onNodeDelete?.(deleteModal.node.id, false);
                    setDeleteModal(null);
                  }}
                  className="w-full px-4 py-2 text-sm font-medium text-foreground bg-accent/50 hover:bg-accent rounded-xl transition-colors text-left"
                >
                  仅删除文件夹 (保留内容)
                </button>
                <button
                  onClick={() => {
                    onNodeDelete?.(deleteModal.node.id, true);
                    setDeleteModal(null);
                  }}
                  className="w-full px-4 py-2 text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-xl transition-colors text-left"
                >
                  删除文件夹及其所有内容
                </button>
                <button
                  onClick={() => setDeleteModal(null)}
                  className="w-full px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-xl transition-colors text-left mt-2"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Move To Modal */}
      <AnimatePresence>
        {moveToModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-background border border-border/40 shadow-2xl rounded-2xl flex flex-col max-w-md w-full max-h-[80vh]"
            >
              <div className="p-4 border-b border-border/20">
                <h3 className="text-lg font-bold mb-3">移动「{moveToModal.node.title || (moveToModal.node.isFolder ? '无标题文件夹' : '无标题笔记')}」到...</h3>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input 
                    autoFocus
                    type="text"
                    value={moveToSearchQuery}
                    onChange={e => setMoveToSearchQuery(e.target.value)}
                    placeholder="搜索目标文件夹..."
                    className="w-full bg-accent/30 border border-border/20 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <button
                  onClick={() => {
                    const sortKey = Date.now().toString();
                    onNodeMove?.(moveToModal.node.id, null, sortKey);
                    setMoveToModal(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 rounded-lg text-left"
                >
                  <LayoutGrid size={16} className="text-muted-foreground" /> 根目录
                </button>
                {nodes
                  .filter(n => n.isFolder && n.id !== moveToModal.node.id && !isDescendant(nodes, n.id, moveToModal.node.id) && (n.title || '').toLowerCase().includes(moveToSearchQuery.toLowerCase()))
                  .map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => {
                        handleMove(moveToModal.node.id, folder.id, 'into');
                        setMoveToModal(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 rounded-lg text-left"
                    >
                      <FolderPlus size={16} className="text-primary/70" /> {folder.title || '无标题文件夹'}
                    </button>
                  ))}
              </div>
              <div className="p-4 border-t border-border/20 flex justify-end">
                <button
                  onClick={() => setMoveToModal(null)}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-accent/30 hover:bg-accent/60 rounded-xl transition-colors"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
};
