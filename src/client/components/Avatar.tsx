import clsx from 'clsx';

import styles from './Avatar.module.css';

/** Colors people's initials are shown in (a different one for each person). */
const TINTS = ['#4b3fc4', '#0f8a7f', '#c92a72', '#d35a10', '#2f5fd0', '#87613d', '#7041d6', '#1d7f48'];

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '?';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toLocaleUpperCase();
}

/** A round badge with the person's initials, in a color of their own. */
export function Avatar({
  id,
  name,
  size = 'md',
  className,
}: {
  id: number;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const tint = TINTS[(id * 5) % TINTS.length]!;
  return (
    <span
      className={clsx(styles.avatar, styles[size], className)}
      style={{ '--tint': tint } as React.CSSProperties}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
