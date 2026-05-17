import React from 'react';

/** 顶栏 4 常驻按钮的可编辑配置（通过设置面板拖拽 / 增减改写） */
const KEY = 'qz.topbar.pinned';
const DEFAULT_PINNED = ['calendar', 'command', 'reading', 'inspector'];
const MAX_PINNED = 4;

export function getPinned(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) return arr.slice(0, MAX_PINNED);
    }
  } catch { /* ignore */ }
  return DEFAULT_PINNED;
}

export function setPinned(next: string[]) {
  localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX_PINNED)));
  window.dispatchEvent(new CustomEvent('qz:topbar-pinned-changed'));
}

export function useQingzhiTopbarConfig() {
  const [pinned, setLocal] = React.useState<string[]>(getPinned);

  React.useEffect(() => {
    const sync = () => setLocal(getPinned());
    window.addEventListener('qz:topbar-pinned-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('qz:topbar-pinned-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return {
    pinned,
    setPinned: (next: string[]) => { setPinned(next); setLocal(next); },
    DEFAULT_PINNED,
    MAX_PINNED,
  };
}
