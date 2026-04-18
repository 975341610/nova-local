import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export interface TodoTask {
  id: string;
  content: string;
  completed: boolean;
  createdAt: string;
}

export interface TodoList {
  id: string;
  title: string;
  tasks: TodoTask[];
  color?: string;
}

interface TodoContextType {
  todoLists: TodoList[];
  activeListId: string | null;
  setActiveListId: (id: string | null) => void;
  addTodoList: (title: string, color?: string) => void;
  updateTodoList: (id: string, updates: Partial<TodoList>) => void;
  deleteTodoList: (id: string) => void;
  addTask: (listId: string, content: string) => void;
  updateTask: (listId: string, taskId: string, updates: Partial<TodoTask>) => void;
  deleteTask: (listId: string, taskId: string) => void;
  toggleTask: (listId: string, taskId: string) => void;
}

const TodoContext = createContext<TodoContextType | undefined>(undefined);

const STORAGE_KEY_TODOS = 'nova_todo_lists';

export const TodoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [todoLists, setTodoLists] = useState<TodoList[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_TODOS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore
      }
    }
    return [
      {
        id: 'default-work',
        title: '工作清单',
        tasks: [
          { id: 't1', content: '设计 TodoContext', completed: true, createdAt: new Date().toISOString() },
          { id: 't2', content: '实现 UI 组件', completed: false, createdAt: new Date().toISOString() },
        ],
        color: '#B7C0C7' // 莫兰迪蓝
      },
      {
        id: 'default-life',
        title: '生活记录',
        tasks: [],
        color: '#C7B7BE' // 莫兰迪粉
      }
    ];
  });

  const [activeListId, setActiveListId] = useState<string | null>(() => {
    if (todoLists.length > 0) return todoLists[0].id;
    return null;
  });

  // 保存到 LocalStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todoLists));
  }, [todoLists]);

  const addTodoList = useCallback((title: string, color?: string) => {
    const newList: TodoList = {
      id: Math.random().toString(36).substring(2, 9),
      title,
      tasks: [],
      color: color || '#B7C0C7',
    };
    setTodoLists(prev => [...prev, newList]);
    if (!activeListId) setActiveListId(newList.id);
  }, [activeListId]);

  const updateTodoList = useCallback((id: string, updates: Partial<TodoList>) => {
    setTodoLists(prev => prev.map(list => list.id === id ? { ...list, ...updates } : list));
  }, []);

  const deleteTodoList = useCallback((id: string) => {
    setTodoLists(prev => prev.filter(list => list.id !== id));
    if (activeListId === id) {
      const remaining = todoLists.filter(list => list.id !== id);
      setActiveListId(remaining.length > 0 ? remaining[0].id : null);
    }
  }, [activeListId, todoLists]);

  const addTask = useCallback((listId: string, content: string) => {
    const newTask: TodoTask = {
      id: Math.random().toString(36).substring(2, 9),
      content,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setTodoLists(prev => prev.map(list => 
      list.id === listId ? { ...list, tasks: [...list.tasks, newTask] } : list
    ));
  }, []);

  const updateTask = useCallback((listId: string, taskId: string, updates: Partial<TodoTask>) => {
    setTodoLists(prev => prev.map(list => 
      list.id === listId 
        ? { ...list, tasks: list.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t) } 
        : list
    ));
  }, []);

  const deleteTask = useCallback((listId: string, taskId: string) => {
    setTodoLists(prev => prev.map(list => 
      list.id === listId 
        ? { ...list, tasks: list.tasks.filter(t => t.id !== taskId) } 
        : list
    ));
  }, []);

  const toggleTask = useCallback((listId: string, taskId: string) => {
    setTodoLists(prev => prev.map(list => 
      list.id === listId 
        ? { ...list, tasks: list.tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t) } 
        : list
    ));
  }, []);

  const value = useMemo(() => ({
    todoLists,
    activeListId,
    setActiveListId,
    addTodoList,
    updateTodoList,
    deleteTodoList,
    addTask,
    updateTask,
    deleteTask,
    toggleTask,
  }), [todoLists, activeListId, addTodoList, updateTodoList, deleteTodoList, addTask, updateTask, deleteTask, toggleTask]);

  return (
    <TodoContext.Provider value={value}>
      {children}
    </TodoContext.Provider>
  );
};

export const useTodo = () => {
  const context = useContext(TodoContext);
  if (!context) {
    throw new Error('useTodo must be used within a TodoProvider');
  }
  return context;
};
