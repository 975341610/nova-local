import React, { useMemo } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { Plus, ChevronLeft, ChevronRight, CheckCircle2, Circle } from 'lucide-react';
import { promptCompat } from '../../lib/promptCompat';

const morandi = {
  bg: 'bg-[#F6F3EF]',
  card: 'bg-white/70',
  text: 'text-[#3F3A3A]',
  subtle: 'text-[#6E6868]',
  border: 'border-[#E6DFD8]',
  accent: 'bg-[#B7C0C7]',
  accent2: 'bg-[#C7B7BE]',
};

export const KanbanComponent: React.FC<any> = (props) => {
  const { node, updateAttributes, selected } = props;
  const columns = node.attrs.columns || [];

  const totalTasks = useMemo(() => {
    return columns.reduce((acc: number, col: any) => acc + col.tasks.length, 0);
  }, [columns]);

  const completedTasks = useMemo(() => {
    return columns.reduce((acc: number, col: any) => 
      acc + col.tasks.filter((t: any) => t.completed).length, 0);
  }, [columns]);

  const progress = totalTasks === 0 ? 0 : (completedTasks / totalTasks) * 100;

  const cloneColumns = () => JSON.parse(JSON.stringify(columns ?? []));

  const handleAddTask = async (colIndex: number) => {
    const content = await promptCompat({ title: '任务内容', placeholder: '输入任务内容' });
    if (!content?.trim()) return;

    const newColumns = cloneColumns();
    newColumns[colIndex].tasks.push({
      id: Math.random().toString(36).substring(7),
      content: content.trim(),
      completed: false,
    });
    updateAttributes({ columns: newColumns });
  };

  const moveTask = (fromColIndex: number, toColIndex: number, taskIndex: number) => {
    const newColumns = cloneColumns();
    const [task] = newColumns[fromColIndex].tasks.splice(taskIndex, 1);
    newColumns[toColIndex].tasks.push(task);
    updateAttributes({ columns: newColumns });
  };

  const toggleTask = (colIndex: number, taskIndex: number) => {
    const newColumns = cloneColumns();
    newColumns[colIndex].tasks[taskIndex].completed = !newColumns[colIndex].tasks[taskIndex].completed;
    updateAttributes({ columns: newColumns });
  };

  const removeTask = (colIndex: number, taskIndex: number) => {
    const newColumns = cloneColumns();
    newColumns[colIndex].tasks.splice(taskIndex, 1);
    updateAttributes({ columns: newColumns });
  };

  return (
    <NodeViewWrapper 
      className={`my-6 rounded-2xl border ${morandi.border} ${morandi.bg} shadow-sm shadow-black/5 hover:shadow-md hover:-translate-y-1 transition-all overflow-hidden select-none ${selected ? 'ring-2 ring-black/10' : ''}`}
      data-drag-handle
    >
      <div className="p-5 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col">
            <span className={`text-sm font-bold ${morandi.text}`}>手账看板</span>
            <span className={`text-[10px] ${morandi.subtle} uppercase tracking-widest`}>Kanban Board</span>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`text-[10px] font-bold ${morandi.subtle}`}>总体进度 {Math.round(progress)}%</span>
            <div className="w-32 h-2 bg-black/5 rounded-full overflow-hidden">
               <div 
                 className={`h-full transition-all duration-700 ease-out ${morandi.accent}`}
                 style={{ width: `${progress}%` }}
               />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[260px]">
          {columns.map((column: any, colIndex: number) => (
            <div 
              key={column.title} 
              className={`flex flex-col rounded-2xl border ${morandi.border} bg-white/40 p-3.5 transition-all`}
            >
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full ${colIndex === 0 ? 'bg-[#C7B7BE]' : colIndex === 1 ? 'bg-[#B7C0C7]' : 'bg-[#C8D3C5]'}`} />
                   <span className={`text-xs font-bold ${morandi.text}`}>{column.title}</span>
                   <span className={`text-[10px] ${morandi.subtle} bg-black/5 px-2 py-0.5 rounded-full font-mono`}>{column.tasks.length}</span>
                </div>
                <button 
                  onClick={() => handleAddTask(colIndex)}
                  className="p-1 rounded-full hover:bg-black/5 transition-colors"
                >
                  <Plus size={14} className={morandi.subtle} />
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                {column.tasks.map((task: any, taskIndex: number) => (
                  <div 
                    key={task.id}
                    className={`group relative rounded-xl border ${morandi.border} ${morandi.card} p-3.5 shadow-sm shadow-black/5 hover:shadow-md hover:-translate-y-1 transition-all cursor-default`}
                  >
                    <div className="flex items-start gap-2.5">
                      <button 
                        onClick={() => toggleTask(colIndex, taskIndex)}
                        className={`mt-0.5 transition-colors ${task.completed ? 'text-[#8BA494]' : 'text-black/10 hover:text-black/20'}`}
                      >
                        {task.completed ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                      </button>
                      <span className={`text-xs leading-relaxed font-medium ${morandi.text} ${task.completed ? 'line-through opacity-40' : ''}`}>
                        {task.content}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                       <div className="flex gap-1.5">
                         {colIndex > 0 && (
                           <button 
                             onClick={() => moveTask(colIndex, colIndex - 1, taskIndex)}
                             className="p-1 rounded-lg bg-black/5 hover:bg-black/10 transition-colors text-black/40"
                           >
                             <ChevronLeft size={13} />
                           </button>
                         )}
                         {colIndex < columns.length - 1 && (
                           <button 
                             onClick={() => moveTask(colIndex, colIndex + 1, taskIndex)}
                             className="p-1 rounded-lg bg-black/5 hover:bg-black/10 transition-colors text-black/40"
                           >
                             <ChevronRight size={13} />
                           </button>
                         )}
                       </div>
                       <button 
                         onClick={() => removeTask(colIndex, taskIndex)}
                         className="text-[10px] text-red-300 hover:text-red-400 font-bold px-2 py-1 rounded-lg hover:bg-red-50/50 transition-colors"
                       >
                         移除
                       </button>
                    </div>
                  </div>
                ))}

                {column.tasks.length === 0 && (
                   <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-black/5 rounded-xl">
                      <span className="text-[10px] text-black/20 font-bold italic tracking-widest uppercase">Empty</span>
                   </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </NodeViewWrapper>
  );
};
