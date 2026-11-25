import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router';

import clsx from 'clsx';
import { Download, type LucideIcon, Settings } from 'lucide-react';

import { useMe } from '@/api/queries.ts';
import { Avatar } from '@/components/Avatar.tsx';
import { Logo } from '@/components/Logo.tsx';

import styles from './AppLayout.module.css';

type NavKey = 'downloads' | 'settings';

const NAV: { key: NavKey; to: string; icon: LucideIcon; also?: string[] }[] = [
  { key: 'downloads', to: '/', icon: Download },
  { key: 'settings', to: '/settings', icon: Settings },
];

const within = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

function NavItem({
  item,
  className,
  activeClassName,
}: {
  item: (typeof NAV)[number];
  className?: string;
  activeClassName?: string;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const Icon = item.icon;
  const inside = item.also?.some(path => within(pathname, path)) ?? false;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => clsx(className, (isActive || inside) && activeClassName)}
    >
      <Icon size={22} strokeWidth={2} />
      <span>{t(`nav.${item.key}`)}</span>
    </NavLink>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const me = useMe();

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Logo size={36} />
          <span>{t('common.appName')}</span>
        </div>
        <nav className={styles.sideNav} aria-label={t('nav.main')}>
          {NAV.map(item => (
            <NavItem key={item.key} item={item} className={styles.sideLink} activeClassName={styles.active} />
          ))}
        </nav>
        <NavLink to="/settings" className={styles.me}>
          <Avatar id={me.id} name={me.name} size="sm" />
          <span>{me.name}</span>
        </NavLink>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>

      <nav className={styles.bottomNav} aria-label={t('nav.main')}>
        {NAV.map(item => (
          <NavItem key={item.key} item={item} className={styles.tab} activeClassName={styles.active} />
        ))}
      </nav>
    </div>
  );
}
