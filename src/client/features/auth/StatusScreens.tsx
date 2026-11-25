import { useTranslation } from 'react-i18next';

import { WifiOff } from 'lucide-react';

import { Logo } from '@/components/Logo.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Spinner } from '@/components/ui/Misc.tsx';

import styles from './Auth.module.css';

export function SplashScreen() {
  return (
    <div className={styles.status}>
      <Logo size={64} />
      <Spinner />
    </div>
  );
}

export function UnreachableScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className={styles.status}>
      <div className={styles.statusIcon}>
        <WifiOff size={32} />
      </div>
      <h1 className={styles.statusTitle}>{t('app.unreachableTitle')}</h1>
      <p className={styles.statusText}>{t('app.unreachableBody')}</p>
      <Button variant="primary" size="lg" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}
