import { useTranslation } from 'react-i18next';

import { RefreshCw } from 'lucide-react';

import { updateAvailable } from '@/api/client.ts';
import { useStore } from '@/lib/store.ts';

import styles from './UpdateBanner.module.css';

/** Offers to reload when the server was updated while this page was open. */
export function UpdateBanner() {
  const { t } = useTranslation();
  const show = useStore(updateAvailable);
  if (!show) return null;
  return (
    <div className={styles.banner} role="status">
      <span>{t('app.updateAvailable')}</span>
      <button type="button" className={styles.reload} onClick={() => window.location.reload()}>
        <RefreshCw size={16} />
        {t('app.reload')}
      </button>
    </div>
  );
}
