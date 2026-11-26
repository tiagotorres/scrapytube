import { useTranslation } from 'react-i18next';
import type { KeyboardEvent } from 'react';
import type { TFunction } from 'i18next';

import clsx from 'clsx';
import { Check, Clapperboard, Download as DownloadIcon, ExternalLink, MoreVertical, Music, RotateCcw, Square, Trash2 } from 'lucide-react';

import type { Download } from '#shared/types.ts';
import { isBotCheck, thumbnailUrl } from '#shared/youtube.ts';

import { errorMessage } from '@/api/client.ts';
import { useMe } from '@/api/queries.ts';
import { confirmWithOption } from '@/components/ui/Confirm.tsx';
import { Menu } from '@/components/ui/Menu.tsx';
import type { MenuEntry } from '@/components/ui/Menu.tsx';
import { formatBytes, formatDuration, formatPercent, relativeTime } from '@/lib/format.ts';
import { showToast } from '@/lib/toasts.ts';

import { cancelDownload, removeDownloads, retryDownload } from './api.ts';
import styles from './DownloadItem.module.css';

/** Runs an action on a download, saying so if it fails. */
function act(action: () => Promise<unknown>, done?: string) {
  action().then(
    () => done && showToast({ message: done }),
    error => showToast({ message: errorMessage(error), tone: 'error' }),
  );
}

/** Saves the file on this device (the browser's download). */
function saveToDevice(download: Download) {
  const anchor = document.createElement('a');
  anchor.href = `/api/downloads/${download.id}/file`;
  anchor.download = download.filePath.split('/').pop() ?? '';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function Status({ download }: { download: Download }) {
  const { t } = useTranslation();
  const { status, progress } = download;

  if (status === 'queued') return <span className={styles.status}>{t('downloads.queued')}</span>;
  if (status === 'failed') {
    // YouTube's "confirm you're not a bot" says where to add cookies, rather than yt-dlp's advice.
    const reason = download.error && isBotCheck(download.error) ? t('errors.YOUTUBE_BOT_CHECK') : download.error;
    return (
      <span className={clsx(styles.status, styles.failed)} title={download.error ?? undefined}>
        {t('downloads.failed')}
        {reason && `: ${reason}`}
      </span>
    );
  }
  if (status === 'canceled') return <span className={styles.status}>{t('downloads.canceled')}</span>;
  if (status === 'done') {
    const when = download.finishedAt ? relativeTime(Date.parse(download.finishedAt)) : null;
    return (
      <span className={styles.status}>
        {[download.size !== null ? formatBytes(download.size) : null, when].filter(Boolean).join(' · ')}
      </span>
    );
  }

  // Running.
  const phase = progress?.phase ?? 'starting';
  const fraction = progress?.fraction ?? null;
  let label: string;
  if (phase === 'processing') label = t(download.kind === 'video' ? 'downloads.processingVideo' : 'downloads.processingMusic');
  else if (phase === 'starting' || fraction === null) label = t('downloads.starting');
  else {
    label = [
      formatPercent(fraction),
      progress?.speed ? `${formatBytes(progress.speed)}/s` : null,
      progress?.eta != null ? t('downloads.left', { time: formatDuration(progress.eta) }) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  const indeterminate = phase !== 'downloading' || fraction === null;
  return (
    <span className={styles.running}>
      <span
        className={clsx(styles.bar, indeterminate && styles.indeterminate)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round((fraction ?? 0) * 100)}
        aria-label={label}
      >
        <span className={styles.fill} style={indeterminate ? undefined : { width: `${(fraction ?? 0) * 100}%` }} />
      </span>
      <span className={clsx(styles.status, 'tnum')}>{label}</span>
    </span>
  );
}

/** Asks whether to also delete the file, then removes the download from the list. */
async function remove(download: Download, t: TFunction) {
  const answer = await confirmWithOption({
    title: t('downloads.removeTitle', { title: download.title }),
    message: t('downloads.removeBody'),
    option: t('downloads.alsoDeleteFile'),
    optionHint: t('downloads.alsoDeleteFileHint'),
    confirmLabel: t('common.remove'),
    danger: true,
  });
  if (!answer) return;
  try {
    const result = await removeDownloads([download.id], answer.option);
    showToast({ message: answer.option ? removedMessage(t, result.removed, true) : t('downloads.removed') });
  } catch (error) {
    showToast({ message: errorMessage(error), tone: 'error' });
  }
}

/** Says how many downloads left the list, and whether their files were deleted. */
export function removedMessage(t: TFunction, count: number, filesDeleted: boolean) {
  return filesDeleted ? t('downloads.removedDeleted', { count }) : t('downloads.removedKept', { count });
}

type Selection = { selected: boolean; onToggle: () => void };

/** A download in the list; with `selection`, a row to tick for removing several at once. */
export function DownloadItem({ download, selection }: { download: Download; selection?: Selection }) {
  const { t } = useTranslation();
  const me = useMe();
  const active = download.status === 'queued' || download.status === 'running';
  const folder = download.filePath.split('/').slice(0, -1).join('/');
  const who = download.user ? (download.user.id === me.id ? t('downloads.byYou') : download.user.name) : t('downloads.byRemoved');
  const KindIcon = download.kind === 'video' ? Clapperboard : Music;

  const entries: MenuEntry[] = [];
  if (active) {
    entries.push({ id: 'stop', label: t('downloads.stop'), icon: <Square size={18} />, onAction: () => act(() => cancelDownload(download.id)) });
  }
  if (download.status === 'failed' || download.status === 'canceled') {
    entries.push({ id: 'retry', label: t('downloads.retry'), icon: <RotateCcw size={18} />, onAction: () => act(() => retryDownload(download.id)) });
  }
  if (download.status === 'done') {
    entries.push({ id: 'save', label: t('downloads.saveToDevice'), icon: <DownloadIcon size={18} />, onAction: () => saveToDevice(download) });
  }
  entries.push({
    id: 'youtube',
    label: t('downloads.openOnYouTube'),
    icon: <ExternalLink size={18} />,
    onAction: () => window.open(download.url, '_blank', 'noopener,noreferrer'),
  });
  if (!active) {
    entries.push({ id: 'separator', separator: true });
    entries.push({
      id: 'remove',
      label: t('downloads.removeFromList'),
      icon: <Trash2 size={18} />,
      danger: true,
      onAction: () => void remove(download, t),
    });
  }

  const check = selection && (
    <span className={clsx(styles.check, selection.selected && styles.checked)} aria-hidden>
      <Check size={16} strokeWidth={3} />
    </span>
  );

  return (
    <li
      className={clsx(styles.item, selection && styles.selectable, selection?.selected && styles.selectedItem)}
      {...(selection && {
        role: 'checkbox',
        'aria-checked': selection.selected,
        'aria-label': t('downloads.selectDownload', { title: download.title }),
        tabIndex: 0,
        onClick: selection.onToggle,
        onKeyDown: (event: KeyboardEvent) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            selection.onToggle();
          }
        },
      })}
    >
      {check}
      <div className={clsx(styles.thumb, download.kind === 'music' && styles.square)}>
        <img src={thumbnailUrl(download.videoId)} alt="" loading="lazy" referrerPolicy="no-referrer" />
        <span className={styles.kind} aria-label={t(`kinds.${download.kind}`)}>
          <KindIcon size={13} />
        </span>
      </div>
      <div className={styles.text}>
        <span className={styles.title}>{download.title}</span>
        <span className={styles.meta}>
          <span className={styles.path}>
            {t('folders.media')}
            {folder && `/${folder}`}
          </span>
          <span className={styles.who}>· {who}</span>
        </span>
        <Status download={download} />
      </div>
      {!selection && <Menu label={t('downloads.actions')} trigger={<MoreVertical size={20} />} entries={entries} />}
    </li>
  );
}
