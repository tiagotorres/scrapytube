import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { createStore, useStore } from '@/lib/store.ts';

import { Button } from './Button.tsx';
import { CheckboxField } from './Field.tsx';
import { Sheet } from './Sheet.tsx';
import styles from './Misc.module.css';

type ConfirmRequest = {
  title: ReactNode;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** A checkbox shown under the message (off at first), e.g. to do something more on confirm. */
  option?: string;
  optionHint?: string;
  /** Called with null when cancelled, or whether the option is on. */
  resolve: (answer: { option: boolean } | null) => void;
};

const request = createStore<ConfirmRequest | null>(null);

/** Asks the person to confirm; resolves with their answer. */
export function confirm(options: Omit<ConfirmRequest, 'resolve' | 'option'>): Promise<boolean> {
  return new Promise(resolve => request.set({ ...options, resolve: answer => resolve(answer !== null) }));
}

/** Asks the person to confirm, with a checkbox; resolves with null when cancelled. */
export function confirmWithOption(
  options: Omit<ConfirmRequest, 'resolve'> & { option: string },
): Promise<{ option: boolean } | null> {
  return new Promise(resolve => request.set({ ...options, resolve }));
}

export function ConfirmHost() {
  const { t } = useTranslation();
  const current = useStore(request);
  const [option, setOption] = useState(false);

  useEffect(() => setOption(false), [current]);

  const finish = (confirmed: boolean) => {
    current?.resolve(confirmed ? { option } : null);
    request.set(null);
  };

  return (
    <Sheet
      isOpen={current !== null}
      onClose={() => finish(false)}
      title={current?.title}
      size="sm"
      footer={
        <>
          <Button onClick={() => finish(false)}>{t('common.cancel')}</Button>
          <Button variant={current?.danger ? 'danger' : 'primary'} onClick={() => finish(true)} autoFocus>
            {current?.confirmLabel}
          </Button>
        </>
      }
    >
      {current?.message && <p className={styles.confirmMessage}>{current.message}</p>}
      {current?.option && (
        <CheckboxField label={current.option} hint={current.optionHint} checked={option} onChange={setOption} />
      )}
    </Sheet>
  );
}
