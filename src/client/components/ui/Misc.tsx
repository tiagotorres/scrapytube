import type { ReactNode } from 'react';

import clsx from 'clsx';

import styles from './Misc.module.css';

export function Spinner({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span
      className={clsx(styles.spinner, className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-busy
    />
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx(styles.empty, className)}>
      {icon && <div className={styles.emptyIcon}>{icon}</div>}
      <h2 className={styles.emptyTitle}>{title}</h2>
      {children && <p className={styles.emptyText}>{children}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

/** Lays out its children in a column with even spacing (form fields). */
export function Stack({
  children,
  gap = 16,
  className,
}: {
  children: ReactNode;
  gap?: number;
  className?: string;
}) {
  return (
    <div className={clsx(styles.stack, className)} style={{ gap }}>
      {children}
    </div>
  );
}

/** A group of rows on a card, like iOS settings. */
export function Section({
  title,
  children,
  footer,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx(styles.section, className)}>
      {title && <h2 className={styles.sectionTitle}>{title}</h2>}
      <div className={styles.card}>{children}</div>
      {footer && <p className={styles.sectionFooter}>{footer}</p>}
    </section>
  );
}
