import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ClipboardPaste, Download as DownloadIcon, Link2, ListX, MoreVertical } from 'lucide-react';

import type { Download } from '#shared/types.ts';
import { parseVideoLink } from '#shared/youtube.ts';

import { errorMessage } from '@/api/client.ts';
import { PageBody, PageHeader } from '@/components/PageHeader.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { confirm } from '@/components/ui/Confirm.tsx';
import { TextField } from '@/components/ui/Field.tsx';
import { Menu } from '@/components/ui/Menu.tsx';
import { EmptyState, Spinner } from '@/components/ui/Misc.tsx';
import { useNewDownloadSheet } from '@/lib/sheets.ts';
import { showToast } from '@/lib/toasts.ts';

import { clearFinished, useDownloads } from './api.ts';
import { DownloadItem } from './DownloadItem.tsx';
import styles from './DownloadsPage.module.css';
import { NewDownloadSheet } from './NewDownloadSheet.tsx';

const canReadClipboard = () => window.isSecureContext && typeof navigator.clipboard?.readText === 'function';

/** Where a link is pasted. A YouTube link opens the new download sheet at once. */
function LinkBox() {
  const { t } = useTranslation();
  const sheet = useNewDownloadSheet();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const start = (value: string): boolean => {
    const link = parseVideoLink(value);
    if (!link.ok) {
      setError(t(`errors.${link.reason}`));
      return false;
    }
    setError(null);
    setText('');
    sheet.open({ url: link.url });
    return true;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim()) start(text);
  };

  const paste = async () => {
    try {
      const value = await navigator.clipboard.readText();
      setText(value);
      start(value);
    } catch {
      showToast({ message: t('downloads.pasteFailed'), tone: 'error' });
    }
  };

  return (
    <form className={styles.linkBox} onSubmit={submit} noValidate>
      <TextField
        label={t('downloads.linkLabel')}
        placeholder={t('downloads.linkPlaceholder')}
        value={text}
        onChange={value => {
          setText(value);
          setError(null);
        }}
        onPaste={event => {
          // Pasting a link is enough: no need to press Next.
          if (start(event.clipboardData.getData('text'))) event.preventDefault();
        }}
        icon={<Link2 size={20} />}
        error={error}
        type="url"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        clearable
      />
      <div className={styles.linkActions}>
        {canReadClipboard() && (
          <Button size="lg" icon={<ClipboardPaste size={20} />} onClick={() => void paste()}>
            {t('downloads.paste')}
          </Button>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={!text.trim()}>
          {t('downloads.next')}
        </Button>
      </div>
    </form>
  );
}

function DownloadList({ title, downloads }: { title: string; downloads: Download[] }) {
  if (downloads.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <ul className={styles.list}>
        {downloads.map(download => (
          <DownloadItem key={download.id} download={download} />
        ))}
      </ul>
    </section>
  );
}

export function DownloadsPage() {
  const { t } = useTranslation();
  const downloads = useDownloads();
  const all = downloads.data ?? [];
  // Running first, then waiting ones in the order they will run.
  const active = all
    .filter(download => download.status === 'running' || download.status === 'queued')
    .sort((a, b) => (a.status === b.status ? a.id - b.id : a.status === 'running' ? -1 : 1));
  const finished = all.filter(download => download.status !== 'running' && download.status !== 'queued');

  const clear = async () => {
    const ok = await confirm({
      title: t('downloads.clearTitle'),
      message: t('downloads.clearBody'),
      confirmLabel: t('downloads.clearList'),
    });
    if (!ok) return;
    try {
      await clearFinished();
      showToast({ message: t('downloads.cleared', { count: finished.length }) });
    } catch (err) {
      showToast({ message: errorMessage(err), tone: 'error' });
    }
  };

  return (
    <>
      <PageHeader
        title={t('downloads.title')}
        actions={
          finished.length > 0 && (
            <Menu
              label={t('downloads.actions')}
              trigger={<MoreVertical size={22} />}
              entries={[
                { id: 'clear', label: t('downloads.clearList'), icon: <ListX size={18} />, onAction: () => void clear() },
              ]}
            />
          )
        }
      />
      <PageBody>
        <LinkBox />
        {downloads.isPending ? (
          <div className={styles.loading}>
            <Spinner />
          </div>
        ) : downloads.isError ? (
          <p className={styles.error}>{errorMessage(downloads.error)}</p>
        ) : all.length === 0 ? (
          <EmptyState icon={<DownloadIcon size={30} />} title={t('downloads.emptyTitle')}>
            {t('downloads.emptyBody')}
          </EmptyState>
        ) : (
          <>
            <DownloadList title={t('downloads.inProgress')} downloads={active} />
            <DownloadList title={t('downloads.recent')} downloads={finished} />
          </>
        )}
      </PageBody>
      <NewDownloadSheet />
    </>
  );
}
