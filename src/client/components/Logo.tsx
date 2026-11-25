import clsx from 'clsx';

import { markMarkup } from './mark.ts';
import styles from './Logo.module.css';

const MARKUP = markMarkup();

/** The ScrapyTube mark: an arrow down into a tray. */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={clsx(styles.logo, className)}
      aria-hidden
      focusable="false"
      dangerouslySetInnerHTML={{ __html: MARKUP }}
    />
  );
}
