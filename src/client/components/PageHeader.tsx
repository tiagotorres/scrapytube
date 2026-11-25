import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { ChevronLeft } from 'lucide-react';

import { IconButton } from './ui/Button.tsx';
import styles from './PageHeader.module.css';

/** The sticky top of a page: title, actions, and optional tools below (search, filters). */
export function PageHeader({
  title,
  backTo,
  actions,
  children,
}: {
  title: ReactNode;
  /** Shows a back button to this path. */
  backTo?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <header className={styles.header}>
      <div className={styles.row}>
        {backTo && (
          <IconButton label={t('common.back')} onClick={() => navigate(backTo)} className={styles.back}>
            <ChevronLeft size={26} />
          </IconButton>
        )}
        <h1 className={styles.title}>{title}</h1>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {children && <div className={styles.tools}>{children}</div>}
    </header>
  );
}

/** The scrolling part of a page, under its header. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `${styles.body} ${className}` : styles.body}>{children}</div>;
}
