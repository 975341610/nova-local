import React, { useMemo, useState, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { Plus, CheckCircle2, Circle, Settings, Trash2, ChevronDown } from 'lucide-react';
import { useTodo } from '../../contexts/TodoContext';
import type { TodoTask } from '../../contexts/TodoContext';
import { motion, AnimatePresence } from 'framer-motion';
import { promptCompat } from '../../lib/promptCompat';

// 莫兰迪色系配置
const morandi = {
  bg: 'bg-[#F6F3EF]',
  card: 'bg-white/70',
  text: 'text-[#3F3A3A]',
  subtle: 'text-[#6E6868]',
  border: 'border-[#E6DFD8]',
  accent: 'bg-[#B7C0C7]', // 蓝
  accent2: 'bg-[#C7B7BE]', // 粉
  accent3: 'bg-[#C8D3C5]', // 绿
};

// 任务项组件，使用 React.memo 优化
const TodoItem = React.memo(({ 
  task, 
  onToggle, 
  onDelete 
}: { 
  task: TodoTask; 
  onToggle: (id: string) => void; 
  onDelete: (id: string) => void;
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className={`group flex items-center gap-3 p-3.5 rounded-2xl border ${morandi.border} ${morandi.card} shadow-sm hover:shadow-md transition-all duration-300`}
    >
      <button 
        onClick={() => onToggle(task.id)}
        className={`flex-shrink-0 transition-all duration-500 transform hover:scale-110 active:scale-95 ${
          task.completed ? 'text-[#8BA494]' : 'text-black/10 hover:text-black/20'
        }`}
      >
        {task.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </button>
      
      <span className={`flex-1 text-sm font-medium transition-all duration-500 leading-relaxed ${
        morandi.text
      } ${task.completed ? 'line-through opacity-40 italic' : ''}`}>
        {task.content}
      </span>

      <button 
        onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-xl text-red-300 hover:text-red-400 hover:bg-red-50 transition-all"
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  );
});

TodoItem.displayName = 'TodoItem';

export const TodoWidget: React.FC<any> = (props) => {
  const { node, updateAttributes, selected } = props;
  const { listId } = node.attrs;
  const { todoLists, addTask, toggleTask, deleteTask, addTodoList } = useTodo();
  
  const [isSettingOpen, setIsSettingOpen] = useState(false);

  // 获取当前显示的清单
  const currentList = useMemo(() => {
    return todoLists.find(l => l.id === listId) || todoLists[0] || null;
  }, [todoLists, listId]);

  const progress = useMemo(() => {
    if (!currentList || currentList.tasks.length === 0) return 0;
    const completed = currentList.tasks.filter(t => t.completed).length;
    return Math.round((completed / currentList.tasks.length) * 100);
  }, [currentList]);

  const handleAddTask = useCallback(async () => {
    if (!currentList) return;
    const content = await promptCompat({ title: '任务内容', placeholder: '输入任务内容' });
    if (content?.trim()) {
      addTask(currentList.id, content.trim());
    }
  }, [currentList, addTask]);

  const handleToggleTask = useCallback((taskId: string) => {
    if (!currentList) return;
    toggleTask(currentList.id, taskId);
  }, [currentList, toggleTask]);

  const handleDeleteTask = useCallback((taskId: string) => {
    if (!currentList) return;
    deleteTask(currentList.id, taskId);
  }, [currentList, deleteTask]);

  const handleSwitchList = (newListId: string) => {
    updateAttributes({ listId: newListId });
    setIsSettingOpen(false);
  };

  const handleCreateNewList = async () => {
    const title = await promptCompat({ title: '清单名称', placeholder: '输入新清单名称' });
    if (title?.trim()) {
      // 简单随机选一个莫兰迪色
      const colors = ['#B7C0C7', '#C7B7BE', '#C8D3C5', '#D6CFC7'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      addTodoList(title.trim(), color);
    }
  };

  if (!currentList) return null;

  return (
    <NodeViewWrapper 
      className={`my-6 rounded-[2.5rem] border ${morandi.border} ${morandi.bg} shadow-soft hover:shadow-card transition-all overflow-hidden select-none ${selected ? 'ring-2 ring-black/5 scale-[1.01]' : ''}`}
      data-drag-handle
    >
      <div className="p-7 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsSettingOpen(!isSettingOpen)}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentList.color || '#B7C0C7' }} />
              <h3 className={`text-base font-bold tracking-tight ${morandi.text}`}>{currentList.title}</h3>
              <ChevronDown size={14} className={`${morandi.subtle} opacity-40 group-hover:opacity-100 transition-opacity`} />
            </div>
            <span className={`text-[10px] ${morandi.subtle} uppercase tracking-[0.2em] font-bold opacity-60`}>Todo List • {currentList.tasks.length} Items</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end gap-1.5">
              <span className={`text-[10px] font-bold ${morandi.subtle} opacity-70`}>{progress}%</span>
              <div className="w-20 h-1.5 bg-black/5 rounded-full overflow-hidden">
                 <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: `${progress}%` }}
                   className="h-full bg-[#8BA494]"
                   transition={{ duration: 1, ease: "easeOut" }}
                 />
              </div>
            </div>
            <button 
              onClick={() => setIsSettingOpen(!isSettingOpen)}
              className={`p-2 rounded-2xl border border-transparent hover:border-black/5 hover:bg-black/5 transition-all ${isSettingOpen ? 'bg-black/5 rotate-90' : ''}`}
            >
              <Settings size={18} className={morandi.subtle} />
            </button>
          </div>
        </div>

        {/* Task List */}
        <div className="space-y-3 min-h-[100px]">
          <AnimatePresence mode="popLayout">
            {currentList.tasks.map(task => (
              <TodoItem 
                key={task.id} 
                task={task} 
                onToggle={handleToggleTask} 
                onDelete={handleDeleteTask}
              />
            ))}
          </AnimatePresence>

          <motion.button 
            layout
            onClick={handleAddTask}
            className={`w-full flex items-center justify-center gap-2 py-4 mt-4 rounded-2xl border-2 border-dashed ${morandi.border} hover:border-[#8BA494]/30 hover:bg-[#8BA494]/5 transition-all group`}
          >
            <Plus size={18} className={`${morandi.subtle} group-hover:text-[#8BA494] transition-colors`} />
            <span className={`text-xs font-bold ${morandi.subtle} group-hover:text-[#8BA494] transition-colors`}>添加新任务</span>
          </motion.button>
        </div>

        {/* Settings Panel */}
        <AnimatePresence>
          {isSettingOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-8 pt-6 border-t border-black/5">
                <div className="flex items-center justify-between mb-4 px-1">
                  <span className={`text-[10px] font-bold ${morandi.subtle} uppercase tracking-widest`}>切换清单</span>
                  <button 
                    onClick={handleCreateNewList}
                    className="text-[10px] font-bold text-[#8BA494] hover:underline"
                  >
                    + 新建清单
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {todoLists.map(list => (
                    <button 
                      key={list.id}
                      onClick={() => handleSwitchList(list.id)}
                      className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl text-left border transition-all ${
                        list.id === listId 
                          ? 'border-[#8BA494] bg-[#8BA494]/5 shadow-sm' 
                          : 'border-transparent bg-black/5 hover:bg-black/10'
                      }`}
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: list.color }} />
                      <span className={`text-xs font-bold truncate ${list.id === listId ? 'text-[#8BA494]' : morandi.text}`}>
                        {list.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </NodeViewWrapper>
  );
};
