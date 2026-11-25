import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import { AlertCircle, ChevronLeft, Clapperboard, Music } from 'lucide-react';

import { downloadPath } from '#shared/paths.ts';
import type { DownloadKind, VideoInfo } from '#shared/types.ts';
import { parseVideoLink, thumbnailUrl } from '#shared/youtube.ts';

import { ApiError, errorMessage, isApiError } from '@/api/client.ts';
import { keys, queryClient } from '@/api/query-client.ts';
import { Button, IconButton } from '@/components/ui/Button.tsx';
import { confirm } from '@/components/ui/Confirm.tsx';
import { ToggleField } from '@/components/ui/Field.tsx';
import { Spinner } from '@/components/ui/Misc.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { formatDuration } from '@/lib/format.ts';
import { useFolderStep, useNewDownloadSheet, useOnOpen } from '@/lib/sheets.ts';
import { showToast } from '@/lib/toasts.ts';

import { createDownload, useLastChoices, useVideoInfo } from './api.ts';
import { FolderPicker, FolderTrail } from './FolderPicker.tsx';
import styles from './NewDownloadSheet.module.css';

/** The video the link is for: its picture, title and channel. */
function VideoCard({
  videoId,
  info,
  loading,
  error,
  onRetry,
}: {
  videoId: string | null;
  info: VideoInfo | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (error) {
    const detail = error instanceof ApiError && error.message !== error.code ? error.message : null;
    return (
      <div className={styles.problem} role="alert">
        <AlertCircle size={22} className={styles.problemIcon} />
        <div className={styles.problemText}>
          <strong>{errorMessage(error)}</strong>
          {detail && <span className={styles.detail}>{detail}</span>}
          {videoId && (
            <Button size="sm" variant="soft" className={styles.problemRetry} onClick={onRetry}>
              {t('common.retry')}
            </Button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.video} aria-busy={loading || undefined}>
      <div className={styles.thumb}>
        {videoId && <img src={thumbnailUrl(videoId)} alt="" loading="lazy" referrerPolicy="no-referrer" />}
        {info?.duration != null && <span className={styles.duration}>{formatDuration(info.duration)}</span>}
      </div>
      <div className={styles.videoText}>
        {info ? (
          <>
            <span className={styles.videoTitle}>{info.title}</span>
            <span className={styles.channel}>
              {info.channel}
              {info.handle && <span className={styles.handle}> @{info.handle}</span>}
            </span>
          </>
        ) : (
          <span className={styles.looking}>
            <Spinner size={16} />
            {t('newDownload.looking')}
          </span>
        )}
      </div>
    </div>
  );
}

function KindButton({
  kind,
  disabled,
  onChoose,
}: {
  kind: DownloadKind;
  disabled: boolean;
  onChoose: (kind: DownloadKind) => void;
}) {
  const { t } = useTranslation();
  const Icon = kind === 'video' ? Clapperboard : Music;
  return (
    <button type="button" className={styles.kind} disabled={disabled} onClick={() => onChoose(kind)}>
      <span className={styles.kindIcon}>
        <Icon size={26} />
      </span>
      <span className={styles.kindLabel}>{t(`newDownload.${kind}`)}</span>
      <span className={styles.kindHint}>{t(`newDownload.${kind}Hint`)}</span>
    </button>
  );
}

/**
 * A pasted or shared link: asks whether to save the video or its music,
 * then where (a folder of the media folder, and the channel's folder in it).
 */
export function NewDownloadSheet() {
  const { t } = useTranslation();
  const sheet = useNewDownloadSheet();
  const step = useFolderStep();
  const location = useLocation();
  const navigate = useNavigate();

  const url = sheet.data?.url ?? null;
  const link = useMemo(() => (url === null ? null : parseVideoLink(url)), [url]);
  const video = link?.ok ? { id: link.id, url: link.url } : null;
  const info = useVideoInfo(sheet.isOpen ? video : null);
  const choices = useLastChoices();

  const kind = step.data?.kind ?? null;
  const [folder, setFolder] = useState('');
  const [channelFolder, setChannelFolder] = useState(true);
  const [busy, setBusy] = useState(false);

  // Each time the folder step opens: where this kind was saved last time;
  // the channel's folder on for videos, off for music.
  useOnOpen(
    step.openId,
    () => {
      setFolder((kind && choices.data?.[kind]?.folder) || '');
      setChannelFolder(kind === 'video');
    },
    !choices.isPending,
  );

  /** Closes the sheet, with its folder step if open. */
  const closeAll = useCallback(() => {
    if (location.key === 'default') navigate(location.pathname, { replace: true, state: null });
    else navigate(step.isOpen ? -2 : -1);
  }, [location.key, location.pathname, navigate, step.isOpen]);

  const target =
    info.data && kind
      ? downloadPath({
          folder,
          channelFolder: channelFolder ? info.data.channelFolder : null,
          title: info.data.title,
          kind,
        })
      : null;

  const submit = async (overwrite = false): Promise<void> => {
    if (!video || !kind) return;
    setBusy(true);
    try {
      await createDownload({ url: video.url, kind, folder, channelFolder, overwrite });
      void queryClient.invalidateQueries({ queryKey: keys.lastChoices });
      showToast({ message: t('downloads.added') });
      closeAll();
    } catch (err) {
      if (!overwrite && isApiError(err, 'FILE_EXISTS')) {
        const replace = await confirm({
          title: t('newDownload.replaceTitle'),
          message: t('newDownload.replaceBody', { path: (err as ApiError).message }),
          confirmLabel: t('newDownload.replace'),
          danger: true,
        });
        if (replace) return submit(true);
      } else {
        showToast({ message: errorMessage(err), tone: 'error' });
      }
    } finally {
      setBusy(false);
    }
  };

  const linkError = link && !link.ok ? new ApiError(400, link.reason) : null;

  if (step.isOpen && kind) {
    return (
      <Sheet
        isOpen={sheet.isOpen}
        onClose={closeAll}
        title={t('newDownload.whereTitle')}
        tall
        headerStart={
          <IconButton label={t('common.back')} onClick={step.close} className={styles.back}>
            <ChevronLeft size={24} />
          </IconButton>
        }
        toolbar={<FolderTrail path={folder} onNavigate={setFolder} />}
        footer={
          <div className={styles.footer}>
            <ToggleField
              label={t('newDownload.channelFolder')}
              hint={
                info.data
                  ? t('newDownload.channelFolderHint', { folder: info.data.channelFolder })
                  : t('newDownload.channelFolderPending')
              }
              checked={channelFolder}
              onChange={setChannelFolder}
            />
            {target && (
              <p className={styles.target}>
                <span className={styles.targetLabel}>{t('newDownload.savedAs')}</span>
                <span className={styles.targetPath}>
                  {t('folders.media')}/{target}
                </span>
              </p>
            )}
            <Button
              variant="primary"
              size="lg"
              block
              loading={busy || info.isPending}
              disabled={!info.isSuccess}
              onClick={() => void submit()}
            >
              {t('newDownload.downloadHere')}
            </Button>
          </div>
        }
      >
        <FolderPicker path={folder} onNavigate={setFolder} />
      </Sheet>
    );
  }

  return (
    <Sheet isOpen={sheet.isOpen} onClose={closeAll} title={t('newDownload.title')}>
      <div className={styles.body}>
        <VideoCard
          videoId={video?.id ?? null}
          info={info.data}
          loading={info.isPending}
          error={linkError ?? info.error}
          onRetry={() => void info.refetch()}
        />
        <h3 className={styles.question}>{t('newDownload.question')}</h3>
        <div className={styles.kinds}>
          {(['video', 'music'] as const).map(option => (
            <KindButton
              key={option}
              kind={option}
              disabled={!video || info.isError}
              onChoose={chosen => step.open({ kind: chosen })}
            />
          ))}
        </div>
      </div>
    </Sheet>
  );
}
