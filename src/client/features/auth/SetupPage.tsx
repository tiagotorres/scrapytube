import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { SetupInput } from '#shared/schemas.ts';
import type { Language, SessionInfo } from '#shared/types.ts';

import { api, errorMessage } from '@/api/client.ts';
import { keys, queryClient } from '@/api/query-client.ts';
import { Logo } from '@/components/Logo.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { PasswordField, TextField } from '@/components/ui/Field.tsx';

import styles from './Auth.module.css';
import { LanguagePicker } from './LanguagePicker.tsx';
import { MIN_PASSWORD_LENGTH, USERNAME_PATTERN, suggestUsername } from './validation.ts';

/** First run: creates the first account. */
export function SetupPage() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalUsername = (username ?? suggestUsername(name)).trim().toLowerCase();
  const errors = {
    name: name.trim() ? null : t('validation.required'),
    username: USERNAME_PATTERN.test(finalUsername) ? null : t('validation.username'),
    password: password.length >= MIN_PASSWORD_LENGTH ? null : t('validation.password'),
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (errors.name || errors.username || errors.password) return;
    setSubmitting(true);
    setError(null);
    try {
      const input: SetupInput = {
        name,
        username: finalUsername,
        password,
        language: i18n.language as Language,
      };
      const session = await api.post<SessionInfo>('/setup', input);
      queryClient.setQueryData(keys.session, session);
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
          <h1 className={styles.title}>{t('auth.setupTitle')}</h1>
          <p className={styles.intro}>{t('auth.setupIntro')}</p>
        </div>

        <LanguagePicker className={styles.languages} />

        <TextField
          label={t('auth.name')}
          value={name}
          onChange={setName}
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          error={showErrors && errors.name}
        />
        <TextField
          label={t('auth.username')}
          value={username ?? suggestUsername(name)}
          onChange={setUsername}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          hint={t('auth.usernameHint')}
          error={showErrors && errors.username}
        />
        <PasswordField
          label={t('auth.password')}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          enterKeyHint="done"
          hint={t('auth.passwordHint')}
          error={showErrors && errors.password}
        />

        {error && (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" block loading={submitting}>
          {t('auth.createAccount')}
        </Button>
      </form>
    </div>
  );
}
