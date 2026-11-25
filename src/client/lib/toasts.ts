import { createStore } from './store.ts';

export interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'error';
  action?: { label: string; onClick: () => void };
}

export const toasts = createStore<Toast[]>([]);

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

/** Shows a short message at the bottom of the screen, optionally with an action (Undo). */
export function showToast({
  message,
  tone = 'default',
  action,
  duration,
}: Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone']; duration?: number }): number {
  const id = nextId++;
  // Keep only the latest few on screen.
  toasts.set(list => [...list.slice(-2), { id, message, tone, action }]);
  timers.set(
    id,
    setTimeout(() => dismissToast(id), duration ?? (action ? 6000 : 3500)),
  );
  return id;
}

export function dismissToast(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts.set(list => list.filter(toast => toast.id !== id));
}
