/**
 * F2c · openHistory
 *
 * Persists "last opened" timestamps for sidebar nodes (notes / folders).
 * Storage key: qz.openHistory.v1
 *
 * 容错:
 *  - localStorage 不可用时 (SSR / 隐私模式 / quota) 静默回退到内存层
 *  - 单条解析失败不影响其它条目 (整表读不出来时返回空对象)
 */

const STORAGE_KEY = 'qz.openHistory.v1';

export type OpenHistory = Record<string, number>;

let memoryCache: OpenHistory | null = null;

function safeGetStorage(): Storage | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

function readRaw(): OpenHistory {
  const ls = safeGetStorage();
  if (!ls) return memoryCache ? { ...memoryCache } : {};
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const out: OpenHistory = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
      }
      return out;
    }
    return {};
  } catch {
    return memoryCache ? { ...memoryCache } : {};
  }
}

function writeRaw(history: OpenHistory): void {
  memoryCache = { ...history };
  const ls = safeGetStorage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // quota / disabled - keep in-memory cache
  }
}

export function loadOpenHistory(): OpenHistory {
  return readRaw();
}

export function recordOpen(id: string, now: number = Date.now()): void {
  if (!id) return;
  const h = readRaw();
  h[id] = now;
  writeRaw(h);
}

export function getLastOpened(id: string): number {
  if (!id) return 0;
  const h = readRaw();
  const v = h[id];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function clearOpenHistory(): void {
  memoryCache = {};
  const ls = safeGetStorage();
  if (!ls) return;
  try {
    ls.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
