import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';

import { parseVideoLink } from '#shared/youtube.ts';

import { SplashScreen } from '@/features/auth/StatusScreens.tsx';
import { sheetState } from '@/lib/sheets.ts';
import { showToast } from '@/lib/toasts.ts';

/**
 * /share?url=… (or ?text=…): a link shared to ScrapyTube from another app
 * (Android, once installed), or opened by an iOS shortcut. Opens the new
 * download sheet over the downloads.
 */
export function ShareTarget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    // The YouTube app puts the link in the text; other apps in the url.
    const shared = [params.get('url'), params.get('text'), params.get('title')].filter(Boolean).join(' ');
    const link = parseVideoLink(shared);
    // The downloads first, so closing the sheet lands there rather than leaving the app.
    navigate('/', { replace: true });
    if (link.ok) navigate('/', { state: sheetState('new-download', { url: link.url }) });
    else showToast({ message: t(`errors.${link.reason}`), tone: 'error' });
  }, [params, navigate, t]);

  return <SplashScreen />;
}
