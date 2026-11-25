import { QueryClient } from '@tanstack/react-query';

import type { SessionInfo } from '#shared/types.ts';

import { ApiError, setUnauthorizedHandler } from './client.ts';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Retry only when the server could not be reached.
      retry: (count, error) => error instanceof ApiError && error.code === 'NETWORK' && count < 1,
    },
    mutations: { retry: false },
  },
});

export const keys = {
  session: ['session'],
  users: ['users'],
  downloads: ['downloads'],
  lastChoices: ['downloads', 'last-choices'],
  folders: (path: string) => ['folders', path] as const,
  system: ['system'],
} as const;

setUnauthorizedHandler(() => {
  queryClient.setQueryData<SessionInfo>(keys.session, session =>
    session ? { ...session, user: null } : session,
  );
});

/** Forgets everything loaded for the previous user. */
export function clearUserData() {
  queryClient.removeQueries({ predicate: query => query.queryKey[0] !== keys.session[0] });
}
