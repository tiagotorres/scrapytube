import clsx from 'clsx';

import { useStore } from '@/lib/store.ts';
import { dismissToast, toasts } from '@/lib/toasts.ts';

import styles from './Toasts.module.css';

export function Toasts() {
  const list = useStore(toasts);
  return (
    <div className={styles.region} aria-live="polite">
      {list.map(toast => (
        <div
          key={toast.id}
          className={clsx(styles.toast, toast.tone === 'error' && styles.error)}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          onClick={() => dismissToast(toast.id)}
        >
          <span className={styles.message}>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className={styles.action}
              onClick={event => {
                event.stopPropagation();
                toast.action!.onClick();
                dismissToast(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
