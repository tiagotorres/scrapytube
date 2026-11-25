import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { SessionInfo, User } from '#shared/types.ts';

import { api, errorMessage } from '@/api/client.ts';
import { clearUserData, keys, queryClient } from '@/api/query-client.ts';
import { Logo } from '@/components/Logo.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { PasswordField, TextField } from '@/components/ui/Field.tsx';

import styles from './Auth.module.css';
import { LanguagePicker } from './LanguagePicker.tsx';

export function LoginPage() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const user = await api.post<User>('/login', { username, password });
      clearUserData();
      queryClient.setQueryData<SessionInfo>(keys.session, session => session && { ...session, user });
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={submit} noValidate>
        <div className={styles.brand}>
          <Logo size={56} />
          <h1 className={styles.title}>{t('common.appName')}</h1>
          <p className={styles.intro}>{t('auth.loginIntro')}</p>
        </div>

        <TextField
          label={t('auth.username')}
          value={username}
          onChange={setUsername}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          autoFocus
        />
        <PasswordField
          label={t('auth.password')}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          enterKeyHint="go"
        />

        {error && (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" block loading={submitting}>
          {t('auth.signIn')}
        </Button>
        <p className={styles.help}>{t('auth.forgotPassword')}</p>

        <LanguagePicker className={styles.languages} />
      </form>
    </div>
  );
}
