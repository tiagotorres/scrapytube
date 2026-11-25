import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import type { User } from '#shared/types.ts';

import { useSession } from './api/queries.ts';
import { queryClient } from './api/query-client.ts';
import { ConfirmHost } from './components/ui/Confirm.tsx';
import { Toasts } from './components/ui/Toasts.tsx';
import { LoginPage } from './features/auth/LoginPage.tsx';
import { SetupPage } from './features/auth/SetupPage.tsx';
import { SplashScreen, UnreachableScreen } from './features/auth/StatusScreens.tsx';
import { DownloadsPage } from './features/downloads/DownloadsPage.tsx';
import { ShareTarget } from './features/downloads/ShareTarget.tsx';
import { AppLayout } from './features/layout/AppLayout.tsx';
import { UpdateBanner } from './features/layout/UpdateBanner.tsx';
import { SettingsPage } from './features/settings/SettingsPage.tsx';
import { UsersPage } from './features/users/UsersPage.tsx';
import { setLanguage } from './i18n/index.ts';

export function App() {
  useEffect(() => {
    // Back online: everything is checked again.
    const refresh = () => void queryClient.invalidateQueries();
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Root />
        <UpdateBanner />
        <Toasts />
        <ConfirmHost />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Root() {
  const session = useSession();
  if (session.isPending) return <SplashScreen />;
  if (session.isError) return <UnreachableScreen onRetry={() => void session.refetch()} />;
  if (session.data.setupRequired) return <SetupPage />;
  if (!session.data.user) return <LoginPage />;
  return <SignedInApp user={session.data.user} />;
}

function SignedInApp({ user }: { user: User }) {
  useEffect(() => setLanguage(user.language), [user.language]);

  return (
    <Routes>
      {/* A link shared from another app (Android), or opened by a shortcut (iOS). */}
      <Route path="share" element={<ShareTarget />} />
      <Route element={<AppLayout />}>
        <Route index element={<DownloadsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/users" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
