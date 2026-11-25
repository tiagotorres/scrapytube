import { useTranslation } from 'react-i18next';

import clsx from 'clsx';
import { Clapperboard, Download as DownloadIcon, ExternalLink, MoreVertical, Music, RotateCcw, Square, Trash2 } from 'lucide-react';

import type { Download } from '#shared/types.ts';
import { isBotCheck, thumbnailUrl } from '#shared/youtube.ts';

import { errorMessage } from '@/api/client.ts';
import { useMe } from '@/api/queries.ts';
import { Menu } from '@/components/ui/Menu.tsx';
import type { MenuEntry } from '@/components/ui/Menu.tsx';
import { formatBytes, formatDuration, formatPercent, relativeTime } from '@/lib/format.ts';
import { showToast } from '@/lib/toasts.ts';

import { cancelDownload, removeDownload, retryDownload } from './api.ts';
import styles from './DownloadItem.module.css';

/** Runs an action on a download, saying so if it fails. */
function act(action: () => Promise<void>, done?: string) {
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

export function DownloadItem({ download }: { download: Download }) {
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
      onAction: () => act(() => removeDownload(download.id), t('downloads.removed')),
    });
  }

  return (
    <li className={styles.item}>
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
      <Menu label={t('downloads.actions')} trigger={<MoreVertical size={20} />} entries={entries} />
    </li>
  );
}
