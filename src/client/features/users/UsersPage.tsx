import { useTranslation } from 'react-i18next';

import { ChevronRight, UserPlus } from 'lucide-react';

import type { User } from '#shared/types.ts';

import { useMe, useUsers } from '@/api/queries.ts';
import { Avatar } from '@/components/Avatar.tsx';
import { PageBody, PageHeader } from '@/components/PageHeader.tsx';
import { Button, IconButton } from '@/components/ui/Button.tsx';
import { Spinner } from '@/components/ui/Misc.tsx';
import { calendarDaysBetween, relativeSpan } from '@/lib/format.ts';
import { useUserSheet } from '@/lib/sheets.ts';

import { UserSheet } from './UserSheet.tsx';
import styles from './UsersPage.module.css';

function useActivityLabel() {
  const { t } = useTranslation();
  return (user: User) =>
    user.lastActiveAt
      ? t('users.activeWhen', {
          when: relativeSpan(-calendarDaysBetween(Date.parse(user.lastActiveAt), Date.now())),
        })
      : t('users.neverActive');
}

export function UsersPage() {
  const { t } = useTranslation();
  const users = useUsers();
  const me = useMe();
  const sheet = useUserSheet();
  const activity = useActivityLabel();

  return (
    <>
      <PageHeader
        title={t('users.title')}
        backTo="/settings"
        actions={
          <IconButton label={t('users.add')} onClick={() => sheet.open({})}>
            <UserPlus size={22} />
          </IconButton>
        }
      />
      <PageBody>
        {users.isPending ? (
          <div className={styles.loading}>
            <Spinner />
          </div>
        ) : (
          <ul className={styles.list}>
            {(users.data ?? []).map(user => (
              <li key={user.id}>
                <button type="button" className={styles.row} onClick={() => sheet.open({ id: user.id })}>
                  <Avatar id={user.id} name={user.name} />
                  <span className={styles.text}>
                    <span className={styles.name}>
                      {user.name}
                      {user.id === me.id && <span className={styles.you}>{t('users.you')}</span>}
                    </span>
                    <span className={styles.meta}>
                      @{user.username} · {activity(user)}
                    </span>
                  </span>
                  <ChevronRight size={20} className={styles.chevron} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.note}>{t('users.samePermissions')}</p>
        <Button variant="soft" size="lg" block icon={<UserPlus size={20} />} onClick={() => sheet.open({})}>
          {t('users.add')}
        </Button>
      </PageBody>
      <UserSheet />
    </>
  );
}
