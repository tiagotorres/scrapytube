import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronRight, Folder, FolderPlus, HardDrive } from 'lucide-react';

import { FORBIDDEN_IN_NAMES, checkFolderName } from '#shared/paths.ts';

import { errorMessage, isApiError } from '@/api/client.ts';
import { keys, queryClient } from '@/api/query-client.ts';
import { Button } from '@/components/ui/Button.tsx';
import { TextField } from '@/components/ui/Field.tsx';
import { Spinner } from '@/components/ui/Misc.tsx';
import { showToast } from '@/lib/toasts.ts';

import { createFolder, useFolders } from './api.ts';
import styles from './FolderPicker.module.css';

/** "Media › abc › def": each part opens that folder. */
export function FolderTrail({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const { t } = useTranslation();
  const parts = path ? path.split('/') : [];
  const end = useRef<HTMLSpanElement>(null);
  // The current folder stays in view when the trail is longer than the screen.
  useEffect(() => {
    // Newer browsers return a promise here: it must not reach React as a clean-up.
    void end.current?.scrollIntoView({ block: 'nearest', inline: 'end' });
  }, [path]);
  return (
    <nav className={styles.trail} aria-label={t('folders.label')}>
      <button
        type="button"
        className={styles.crumb}
        aria-current={parts.length === 0 ? 'location' : undefined}
        onClick={() => onNavigate('')}
      >
        <HardDrive size={16} />
        {t('folders.media')}
      </button>
      {parts.map((name, index) => {
        const target = parts.slice(0, index + 1).join('/');
        const current = index === parts.length - 1;
        return (
          <span key={target} className={styles.crumbGroup}>
            <ChevronRight size={16} className={styles.separator} aria-hidden />
            <button
              type="button"
              className={styles.crumb}
              aria-current={current ? 'location' : undefined}
              onClick={() => onNavigate(target)}
            >
              {name}
            </button>
          </span>
        );
      })}
      <span ref={end} />
    </nav>
  );
}

/** The folders inside `path`, to go into, and a way to make a new one. */
export function FolderPicker({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const { t } = useTranslation();
  const listing = useFolders(path);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCreating(false);
    setName('');
    setNameError(null);
  }, [path]);

  // A folder remembered from last time may have been moved or deleted.
  const missing = listing.isError && isApiError(listing.error, 'FOLDER_NOT_FOUND');
  useEffect(() => {
    if (missing && path !== '') {
      showToast({ message: t('folders.notFound') });
      onNavigate('');
    }
  }, [missing, path, onNavigate, t]);

  const create = async () => {
    const checked = checkFolderName(name);
    if (!checked.ok) {
      setNameError(name.trim() ? t('folders.invalidName', { chars: FORBIDDEN_IN_NAMES }) : t('validation.required'));
      return;
    }
    setBusy(true);
    try {
      const folder = await createFolder(path, checked.name);
      void queryClient.invalidateQueries({ queryKey: keys.folders(path) });
      onNavigate(folder.path);
    } catch (err) {
      setNameError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.picker}>
      {listing.isPending ? (
        <div className={styles.loading}>
          <Spinner />
        </div>
      ) : listing.isError ? (
        <p className={styles.error}>{errorMessage(listing.error)}</p>
      ) : (
        <ul className={styles.list} aria-label={t('folders.label')}>
          {listing.data.folders.map(folder => (
            <li key={folder.path}>
              <button type="button" className={styles.row} onClick={() => onNavigate(folder.path)}>
                <Folder size={20} className={styles.icon} />
                <span className={styles.name}>{folder.name}</span>
                <ChevronRight size={18} className={styles.chevron} />
              </button>
            </li>
          ))}
          {listing.data.folders.length === 0 && <li className={styles.empty}>{t('folders.empty')}</li>}
        </ul>
      )}

      {creating ? (
        <div
          className={styles.create}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              // Not the sheet's own form: this only makes the folder.
              event.preventDefault();
              void create();
            }
            if (event.key === 'Escape') {
              event.stopPropagation();
              setCreating(false);
            }
          }}
        >
          <TextField
            label={t('folders.name')}
            value={name}
            onChange={value => {
              setName(value);
              setNameError(null);
            }}
            error={nameError}
            autoFocus
            autoCapitalize="sentences"
            enterKeyHint="done"
            maxLength={120}
          />
          <div className={styles.createActions}>
            <Button onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={busy} onClick={() => void create()}>
              {t('folders.create')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" icon={<FolderPlus size={20} />} className={styles.newFolder} onClick={() => setCreating(true)}>
          {t('folders.newFolder')}
        </Button>
      )}
    </div>
  );
}
