import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { format, subDays } from 'date-fns';

export interface Habit {
  id: string;
  name: string;
  targetValue: number;
  color: string;
  /**
   * 卡片背景颜色（外边框颜色）
   */
  cardColor?: string;
  /**
   * 可为 Emoji，也可为图片 URL（/api/media/files/... 或 data:image/...）。
   * 由于需要离线/无后端环境兜底，这里统一用 string 存储。
   */
  icon: string;
  /**
   * 习惯日历背景图。
   * 优先存后端上传返回的 URL；若上传失败则兜底存 dataUrl(Base64) 到 localStorage。
   */
  backgroundUrl?: string;
  /**
   * 自定义日历背景壁纸（Base64 或 URL）
   */
  bgImage?: string;
  createdAt: string;
}

export interface HabitLog {
  habitId: string;
  date: string; // YYYY-MM-DD
  value: number;
}

interface HabitContextType {
  habits: Habit[];
  logs: HabitLog[];
  activeHabitId: string | null;
  setActiveHabitId: (id: string | null) => void;
  addHabit: (habit: Omit<Habit, 'id' | 'createdAt'>) => void;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  logCheckIn: (habitId: string, date: string, value: number) => void;
  getStreak: (habitId: string) => number;
  getLogForDate: (habitId: string, date: string) => HabitLog | undefined;
}

const HabitContext = createContext<HabitContextType | undefined>(undefined);

const STORAGE_KEY_HABITS = 'nova_habits';
const STORAGE_KEY_LOGS = 'nova_habit_logs';

const normalizeHabit = (raw: any): Habit => {
  const now = new Date().toISOString();
  return {
    id: String(raw?.id ?? Math.random().toString(36).substring(2, 9)),
    name: String(raw?.name ?? '新习惯'),
    targetValue: Number(raw?.targetValue ?? 1) || 1,
    color: String(raw?.color ?? '#b8c6db'),
    cardColor: String(raw?.cardColor ?? '#fcf9f2'),
    icon: String(raw?.icon ?? '✨'),
    backgroundUrl: typeof raw?.backgroundUrl === 'string' ? raw.backgroundUrl : '',
    bgImage: typeof raw?.bgImage === 'string' ? raw.bgImage : '',
    createdAt: String(raw?.createdAt ?? now),
  };
};

export const HabitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [habits, setHabits] = useState<Habit[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_HABITS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.map(normalizeHabit);
      } catch {
        // ignore
      }
    }
    return [
      { id: '1', name: '喝水', targetValue: 8, color: '#a8ebd1', cardColor: '#fcf9f2', icon: '💧', backgroundUrl: '', bgImage: '', createdAt: new Date().toISOString() },
      { id: '2', name: '健身', targetValue: 1, color: '#ffc4d9', cardColor: '#fcf9f2', icon: '🏋️‍♂️', backgroundUrl: '', bgImage: '', createdAt: new Date().toISOString() },
      { id: '3', name: '阅读', targetValue: 1, color: '#ffd8a8', cardColor: '#fcf9f2', icon: '📚', backgroundUrl: '', bgImage: '', createdAt: new Date().toISOString() },
    ];
  });

  const [logs, setLogs] = useState<HabitLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_LOGS);
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeHabitId, setActiveHabitId] = useState<string | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_HABITS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]?.id);
      } catch {
        // ignore
      }
    }
    return '1';
  });

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_HABITS, JSON.stringify(habits));
  }, [habits]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
  }, [logs]);

  const addHabit = useCallback((habit: Omit<Habit, 'id' | 'createdAt'>) => {
    const newHabit: Habit = {
      ...habit,
      id: Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
    };
    setHabits(prev => [...prev, newHabit]);
    if (!activeHabitId) setActiveHabitId(newHabit.id);
  }, [activeHabitId]);

  const updateHabit = useCallback((id: string, updates: Partial<Habit>) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, ...updates } : h));
  }, []);

  const deleteHabit = useCallback((id: string) => {
    setHabits(prev => prev.filter(h => h.id !== id));
    setLogs(prev => prev.filter(l => l.habitId !== id));
    if (activeHabitId === id) {
      setActiveHabitId(habits.find(h => h.id !== id)?.id || null);
    }
  }, [activeHabitId, habits]);

  const logCheckIn = useCallback((habitId: string, date: string, value: number) => {
    setLogs(prev => {
      const existing = prev.find(l => l.habitId === habitId && l.date === date);
      if (existing) {
        return prev.map(l => l.habitId === habitId && l.date === date ? { ...l, value } : l);
      } else {
        return [...prev, { habitId, date, value }];
      }
    });
  }, []);

  const getLogForDate = useCallback((habitId: string, date: string) => {
    return logs.find(l => l.habitId === habitId && l.date === date);
  }, [logs]);

  const getStreak = useCallback((habitId: string) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return 0;

    const habitLogs = logs
      .filter(l => l.habitId === habitId && l.value >= habit.targetValue)
      .map(l => l.date)
      .sort((a, b) => b.localeCompare(a)); // Sort descending

    if (habitLogs.length === 0) return 0;

    let streak = 0;
    let currentDate = new Date();

    // Check if today is completed or yesterday was completed
    const todayStr = format(currentDate, 'yyyy-MM-dd');
    const yesterdayStr = format(subDays(currentDate, 1), 'yyyy-MM-dd');

    if (!habitLogs.includes(todayStr) && !habitLogs.includes(yesterdayStr)) {
      return 0;
    }

    let checkDate = habitLogs.includes(todayStr) ? currentDate : subDays(currentDate, 1);

    while (true) {
      const dateStr = format(checkDate, 'yyyy-MM-dd');
      if (habitLogs.includes(dateStr)) {
        streak++;
        checkDate = subDays(checkDate, 1);
      } else {
        break;
      }
    }

    return streak;
  }, [habits, logs]);

  const value = useMemo(() => ({
    habits,
    logs,
    activeHabitId,
    setActiveHabitId,
    addHabit,
    updateHabit,
    deleteHabit,
    logCheckIn,
    getStreak,
    getLogForDate,
  }), [habits, logs, activeHabitId, addHabit, updateHabit, deleteHabit, logCheckIn, getStreak, getLogForDate]);

  return (
    <HabitContext.Provider value={value}>
      {children}
    </HabitContext.Provider>
  );
};

export const useHabit = () => {
  const context = useContext(HabitContext);
  if (!context) {
    throw new Error('useHabit must be used within a HabitProvider');
  }
  return context;
};
