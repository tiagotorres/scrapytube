import { useCallback, useSyncExternalStore } from 'react';

// Per-device conveniences (theme, language). Stored in
// localStorage; never required for correctness.

const PREFIX = 'scrapytube:';
const listeners = new Set<() => void>();
const cache = new Map<string, unknown>();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function getCached<T>(key: string, fallback: T): T {
  if (!cache.has(key)) cache.set(key, read(key, fallback));
  return cache.get(key) as T;
}

export function getLocalSetting<T>(key: string, fallback: T): T {
  return getCached(key, fallback);
}

export function setLocalSetting<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private browsing): the value lasts for this visit.
  }
  cache.set(key, value);
  listeners.forEach(listener => listener());
}

export function useLocalSetting<T>(key: string, fallback: T): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => getCached(key, fallback),
  );
  const setValue = useCallback((next: T) => setLocalSetting(key, next), [key]);
  return [value, setValue];
}
