import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { TodoProvider, useTodo } from '../../contexts/TodoContext';

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TodoProvider>{children}</TodoProvider>
);

describe('TodoContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should have default todo lists', () => {
    const { result } = renderHook(() => useTodo(), { wrapper });
    expect(result.current.todoLists.length).toBeGreaterThan(0);
    expect(result.current.todoLists[0].title).toBe('工作清单');
  });

  it('should add a new todo list', () => {
    const { result } = renderHook(() => useTodo(), { wrapper });
    act(() => {
      result.current.addTodoList('新清单', '#B7C0C7');
    });
    expect(result.current.todoLists).toContainEqual(
      expect.objectContaining({ title: '新清单', color: '#B7C0C7' })
    );
  });

  it('should add a task to a list', () => {
    const { result } = renderHook(() => useTodo(), { wrapper });
    const listId = result.current.todoLists[0].id;
    
    act(() => {
      result.current.addTask(listId, '新任务');
    });

    const list = result.current.todoLists.find(l => l.id === listId);
    expect(list?.tasks).toContainEqual(
      expect.objectContaining({ content: '新任务', completed: false })
    );
  });

  it('should toggle a task status', () => {
    const { result } = renderHook(() => useTodo(), { wrapper });
    const listId = result.current.todoLists[0].id;
    
    act(() => {
      result.current.addTask(listId, '任务1');
    });

    const taskId = result.current.todoLists[0].tasks.find(t => t.content === '任务1')?.id;
    
    act(() => {
      result.current.toggleTask(listId, taskId!);
    });

    const task = result.current.todoLists[0].tasks.find(t => t.id === taskId);
    expect(task?.completed).toBe(true);

    act(() => {
      result.current.toggleTask(listId, taskId!);
    });
    expect(result.current.todoLists[0].tasks.find(t => t.id === taskId)?.completed).toBe(false);
  });
});
