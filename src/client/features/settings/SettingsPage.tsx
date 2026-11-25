import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { ChevronRight, Download, Film, HardDrive, KeyRound, LogOut, Pencil, RefreshCw, Users } from 'lucide-react';

import { LANGUAGES } from '#shared/types.ts';
import type { Language, SessionInfo, SystemInfo, User } from '#shared/types.ts';

import { api, errorMessage } from '@/api/client.ts';
import { useMe, useSession, useUsers } from '@/api/queries.ts';
import { clearUserData, keys, queryClient } from '@/api/query-client.ts';
import { Avatar } from '@/components/Avatar.tsx';
import { Logo } from '@/components/Logo.tsx';
import { PageBody, PageHeader } from '@/components/PageHeader.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { PasswordField, SegmentedControl, TextField } from '@/components/ui/Field.tsx';
import { Section, Stack } from '@/components/ui/Misc.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useSystem } from '@/features/downloads/api.ts';
import { MIN_PASSWORD_LENGTH } from '@/features/auth/validation.ts';
import { setLanguage } from '@/i18n/index.ts';
import { formatBytes, relativeTime } from '@/lib/format.ts';
import { useLocalSetting } from '@/lib/local-settings.ts';
import { useSheet } from '@/lib/sheets.ts';
import { showToast } from '@/lib/toasts.ts';
import { applyTheme } from '@/theme.ts';
import type { ThemePreference } from '@/theme.ts';

import styles from './SettingsPage.module.css';

const LANGUAGE_SHORT: Record<Language, string> = { en: 'English', 'pt-PT': 'Português', fr: 'Français' };

function storeMe(user: User) {
  queryClient.setQueryData<SessionInfo>(keys.session, session => session && { ...session, user });
}

function NameSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const me = useMe();
  const [name, setName] = useState(me.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(me.name);
      setError(null);
      setBusy(false);
    }
  }, [isOpen, me.name]);

  const save = async () => {
    if (!name.trim()) {
      setError(t('validation.required'));
      return;
    }
    setBusy(true);
    try {
      storeMe(await api.patch<User>('/me', { name }));
      void queryClient.invalidateQueries({ queryKey: keys.users });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings.yourName')}
      size="sm"
      onSubmit={() => void save()}
      footer={
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          {t('common.save')}
        </Button>
      }
    >
      <TextField
        label={t('users.name')}
        value={name}
        onChange={setName}
        autoCapitalize="words"
        autoComplete="name"
        autoFocus
        error={error}
      />
    </Sheet>
  );
}

function PasswordSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrent('');
      setNext('');
      setShowErrors(false);
      setError(null);
      setBusy(false);
    }
  }, [isOpen]);

  const tooShort = next.length < MIN_PASSWORD_LENGTH;

  const save = async () => {
    setShowErrors(true);
    if (tooShort || !current) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/me/password', { currentPassword: current, newPassword: next });
      showToast({ message: t('settings.passwordChanged') });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings.changePassword')}
      size="sm"
      onSubmit={() => void save()}
      footer={
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          {t('settings.changePassword')}
        </Button>
      }
    >
      <Stack>
        <PasswordField
          label={t('settings.currentPassword')}
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          autoFocus
          error={showErrors && !current ? t('validation.required') : null}
        />
        <PasswordField
          label={t('settings.newPassword')}
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint={t('settings.newPasswordHint')}
          error={showErrors && tooShort ? t('validation.password') : null}
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

/** yt-dlp and ffmpeg, which do the downloading, and the space left for it. */
function DownloaderSection() {
  const { t } = useTranslation();
  const system = useSystem();
  const [updating, setUpdating] = useState(false);
  const info = system.data;
  const ytDlp = info?.ytDlp;

  const update = async () => {
    setUpdating(true);
    try {
      queryClient.setQueryData<SystemInfo>(keys.system, await api.post<SystemInfo>('/system/update-ytdlp'));
    } catch (err) {
      showToast({ message: errorMessage(err), tone: 'error' });
    } finally {
      setUpdating(false);
    }
  };

  const footer = [
    ytDlp && (ytDlp.managed ? t('system.autoHint') : t('system.externalHint')),
    info && !info.ffmpeg.version ? t('system.ffmpegMissing') : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Section title={t('system.title')} footer={footer || undefined}>
      <div className={styles.row}>
        <Download size={20} className={styles.rowIcon} />
        <span className={styles.rowLabel}>{t('system.ytDlp')}</span>
        <span className={styles.rowValue}>{info ? (ytDlp?.version ?? t('system.missing')) : '…'}</span>
        {ytDlp?.managed && (
          <Button
            size="sm"
            variant="ghost"
            loading={updating || ytDlp.updating}
            icon={<RefreshCw size={16} />}
            onClick={() => void update()}
          >
            {t('system.update')}
          </Button>
        )}
      </div>
      {ytDlp?.lastCheckedAt && ytDlp.lastCheck && (
        <p className={styles.rowNote}>
          {t('system.lastCheck', { when: relativeTime(Date.parse(ytDlp.lastCheckedAt)), result: ytDlp.lastCheck })}
        </p>
      )}
      <div className={styles.row}>
        <Film size={20} className={styles.rowIcon} />
        <span className={styles.rowLabel}>{t('system.ffmpeg')}</span>
        <span className={styles.rowValue}>{info ? (info.ffmpeg.version ?? t('system.missing')) : '…'}</span>
      </div>
      <div className={styles.row}>
        <HardDrive size={20} className={styles.rowIcon} />
        <span className={styles.rowLabel}>
          {t('system.space')}
          {info && <span className={styles.rowHint}>{t('system.atOnce', { count: info.maxConcurrent })}</span>}
        </span>
        <span className={styles.rowValue}>
          {info?.media.free != null && info.media.total != null
            ? t('system.spaceValue', { free: formatBytes(info.media.free), total: formatBytes(info.media.total) })
            : '…'}
        </span>
      </div>
    </Section>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const version = useSession().data?.version ?? import.meta.env.APP_VERSION;
  const userCount = useUsers().data?.length;
  const [theme, setTheme] = useLocalSetting<ThemePreference>('theme', 'auto');
  const nameSheet = useSheet('settings-name');
  const passwordSheet = useSheet('settings-password');

  const changeLanguage = async (language: Language) => {
    setLanguage(language);
    try {
      storeMe(await api.patch<User>('/me', { language }));
    } catch (err) {
      showToast({ message: errorMessage(err), tone: 'error' });
    }
  };

  const signOut = async () => {
    try {
      await api.post('/logout');
    } catch (err) {
      // Still signed in on the server: say so rather than pretend.
      showToast({ message: errorMessage(err), tone: 'error' });
      return;
    }
    clearUserData();
    queryClient.setQueryData<SessionInfo>(keys.session, session => session && { ...session, user: null });
  };

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <PageBody>
        <Section title={t('settings.account')}>
          <button type="button" className={styles.profile} onClick={() => nameSheet.open()}>
            <Avatar id={me.id} name={me.name} size="lg" />
            <span className={styles.profileText}>
              <span className={styles.profileName}>{me.name}</span>
              <span className={styles.profileMeta}>@{me.username}</span>
            </span>
            <Pencil size={18} className={styles.chevron} />
          </button>
          <button type="button" className={styles.row} onClick={() => passwordSheet.open()}>
            <KeyRound size={20} className={styles.rowIcon} />
            <span className={styles.rowLabel}>{t('settings.changePassword')}</span>
            <ChevronRight size={20} className={styles.chevron} />
          </button>
          <button type="button" className={`${styles.row} ${styles.danger}`} onClick={() => void signOut()}>
            <LogOut size={20} className={styles.rowIcon} />
            <span className={styles.rowLabel}>{t('settings.signOut')}</span>
          </button>
        </Section>

        <DownloaderSection />

        <Section title={t('settings.preferences')}>
          <div className={styles.control}>
            <span className={styles.controlLabel}>{t('settings.language')}</span>
            <SegmentedControl
              label={t('settings.language')}
              value={i18n.language as Language}
              onChange={language => void changeLanguage(language)}
              options={LANGUAGES.map(code => ({ value: code, label: LANGUAGE_SHORT[code] }))}
            />
          </div>
          <div className={styles.control}>
            <span className={styles.controlLabel}>{t('settings.theme')}</span>
            <SegmentedControl
              label={t('settings.theme')}
              value={theme}
              onChange={value => {
                setTheme(value);
                applyTheme(value);
              }}
              options={[
                { value: 'auto', label: t('settings.themeAuto') },
                { value: 'light', label: t('settings.themeLight') },
                { value: 'dark', label: t('settings.themeDark') },
              ]}
            />
          </div>
        </Section>

        <Section title={t('settings.people')} footer={t('settings.peopleHint')}>
          <Link to="/settings/users" className={styles.row}>
            <Users size={20} className={styles.rowIcon} />
            <span className={styles.rowLabel}>{t('settings.users')}</span>
            {userCount !== undefined && <span className={styles.rowValue}>{userCount}</span>}
            <ChevronRight size={20} className={styles.chevron} />
          </Link>
        </Section>

        <Section title={t('settings.data')} footer={t('settings.backupHint')}>
          <a href="/api/backup" className={styles.row} download>
            <Download size={20} className={styles.rowIcon} />
            <span className={styles.rowLabel}>{t('settings.downloadBackup')}</span>
          </a>
        </Section>

        <div className={styles.about}>
          <Logo size={40} />
          <div>
            <div className={styles.aboutName}>{t('common.appName')}</div>
            <div className={styles.aboutVersion}>{t('settings.version', { version })}</div>
          </div>
        </div>
      </PageBody>
      <NameSheet isOpen={nameSheet.isOpen} onClose={nameSheet.close} />
      <PasswordSheet isOpen={passwordSheet.isOpen} onClose={passwordSheet.close} />
    </>
  );
}
