import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronLeft, KeyRound, UserX } from 'lucide-react';

import { LANGUAGES } from '#shared/types.ts';
import type { Language, User } from '#shared/types.ts';

import { api, errorMessage } from '@/api/client.ts';
import { useMe, useUsers } from '@/api/queries.ts';
import { keys, queryClient } from '@/api/query-client.ts';
import { Avatar } from '@/components/Avatar.tsx';
import { Button, IconButton } from '@/components/ui/Button.tsx';
import { confirm } from '@/components/ui/Confirm.tsx';
import { PasswordField, SegmentedControl, TextField } from '@/components/ui/Field.tsx';
import { Stack } from '@/components/ui/Misc.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { MIN_PASSWORD_LENGTH, USERNAME_PATTERN, suggestUsername } from '@/features/auth/validation.ts';
import { useUserSheet } from '@/lib/sheets.ts';
import { showToast } from '@/lib/toasts.ts';

import styles from './UserSheet.module.css';

const LANGUAGE_SHORT: Record<Language, string> = { en: 'English', 'pt-PT': 'Português', fr: 'Français' };

type View = 'details' | 'password';

export function UserSheet() {
  const { t, i18n } = useTranslation();
  const sheet = useUserSheet();
  const me = useMe();
  const users = useUsers().data ?? [];
  const user: User | undefined = sheet.data?.id === undefined ? undefined : users.find(u => u.id === sheet.data?.id);
  const isNew = sheet.data?.id === undefined;
  const isMe = user?.id === me.id;
  // After a page reload the users may not have loaded yet.
  const ready = isNew || user !== undefined;

  const [view, setView] = useState<View>('details');
  const [name, setName] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sheet.isOpen || !ready) return;
    setView('details');
    setName(user?.name ?? '');
    setUsername(user ? user.username : null);
    setPassword('');
    setLanguage((i18n.language as Language) ?? 'en');
    setShowErrors(false);
    setBusy(false);
    setError(null);
  }, [sheet.isOpen, sheet.data?.id, ready]);

  const finalUsername = (username ?? suggestUsername(name)).trim().toLowerCase();
  const errors = {
    name: name.trim() ? null : t('validation.required'),
    username: USERNAME_PATTERN.test(finalUsername) ? null : t('validation.username'),
    password: password.length >= MIN_PASSWORD_LENGTH ? null : t('validation.password'),
  };

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const saveDetails = () => {
    setShowErrors(true);
    if (errors.name || errors.username || (isNew && errors.password)) return;
    void run(async () => {
      if (isNew) {
        await api.post('/users', { name, username: finalUsername, password, language });
        showToast({ message: t('users.added', { name: name.trim() }) });
      } else if (user) {
        await api.patch(`/users/${user.id}`, { name, username: finalUsername });
        if (isMe) await queryClient.invalidateQueries({ queryKey: keys.session });
        showToast({ message: t('toast.saved') });
      }
      await queryClient.invalidateQueries({ queryKey: keys.users });
      sheet.close();
    });
  };

  const savePassword = () => {
    setShowErrors(true);
    if (!user || errors.password) return;
    void run(async () => {
      await api.post(`/users/${user.id}/password`, { password });
      showToast({ message: t('users.passwordSet', { name: user.name }) });
      sheet.close();
    });
  };

  const remove = async () => {
    if (!user) return;
    const confirmed = await confirm({
      title: t('users.removeTitle', { name: user.name }),
      message: t('users.removeBody'),
      confirmLabel: t('users.remove'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/users/${user.id}`);
      await queryClient.invalidateQueries({ queryKey: keys.users });
      showToast({ message: t('users.removed', { name: user.name }) });
      sheet.close();
    } catch (err) {
      showToast({ message: errorMessage(err), tone: 'error' });
    }
  };

  if (!isNew && !user) return null;

  if (view === 'password' && user) {
    return (
      <Sheet
        isOpen={sheet.isOpen}
        onClose={sheet.close}
        title={t('users.newPasswordFor', { name: user.name })}
        headerStart={
          <IconButton label={t('common.back')} onClick={() => setView('details')} className={styles.back}>
            <ChevronLeft size={24} />
          </IconButton>
        }
        onSubmit={savePassword}
        footer={
          <Button type="submit" variant="primary" size="lg" loading={busy}>
            {t('users.setPassword')}
          </Button>
        }
      >
        <Stack>
          <p className={styles.hint}>{t('users.newPasswordHint')}</p>
          <PasswordField
            label={t('users.newPassword')}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            autoFocus
            hint={t('auth.passwordHint')}
            error={showErrors && errors.password}
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </Stack>
      </Sheet>
    );
  }

  return (
    <Sheet
      isOpen={sheet.isOpen}
      onClose={sheet.close}
      title={isNew ? t('users.addTitle') : t('users.editTitle')}
      onSubmit={saveDetails}
      footer={
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          {isNew ? t('users.add') : t('common.save')}
        </Button>
      }
    >
      <Stack gap={18}>
        {user && (
          <div className={styles.identity}>
            <Avatar id={user.id} name={name || user.name} size="lg" />
            <div>
              <div className={styles.identityName}>{name || user.name}</div>
              <div className={styles.identityMeta}>@{finalUsername || user.username}</div>
            </div>
          </div>
        )}
        <TextField
          label={t('users.name')}
          value={name}
          onChange={setName}
          autoCapitalize="words"
          autoComplete="off"
          autoFocus={isNew}
          error={showErrors && errors.name}
        />
        <TextField
          label={t('auth.username')}
          value={username ?? suggestUsername(name)}
          onChange={setUsername}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          hint={t('auth.usernameHint')}
          error={showErrors && errors.username}
        />
        {isNew && (
          <>
            <PasswordField
              label={t('auth.password')}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              hint={t('users.passwordShareHint')}
              error={showErrors && errors.password}
            />
            <div className={styles.block}>
              <span className={styles.label}>{t('settings.language')}</span>
              <SegmentedControl
                label={t('settings.language')}
                value={language}
                onChange={setLanguage}
                options={LANGUAGES.map(code => ({ value: code, label: LANGUAGE_SHORT[code] }))}
              />
            </div>
          </>
        )}

        {user && (
          <div className={styles.actions}>
            {!isMe && (
              <button type="button" className={styles.action} onClick={() => setView('password')}>
                <KeyRound size={20} />
                {t('users.setNewPassword')}
              </button>
            )}
            {!isMe && (
              <button type="button" className={`${styles.action} ${styles.danger}`} onClick={() => void remove()}>
                <UserX size={20} />
                {t('users.remove')}
              </button>
            )}
            {isMe && <p className={styles.hint}>{t('users.selfHint')}</p>}
          </div>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </Stack>
    </Sheet>
  );
}
