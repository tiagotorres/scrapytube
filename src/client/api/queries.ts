import { useQuery } from '@tanstack/react-query';

import type { SessionInfo, User } from '#shared/types.ts';

import { api } from './client.ts';
import { keys } from './query-client.ts';

export function useSession() {
  return useQuery<SessionInfo>({
    queryKey: keys.session,
    queryFn: () => api.get<SessionInfo>('/session'),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** The signed-in user (only inside the signed-in app). */
export function useMe(): User {
  const { data } = useSession();
  if (!data?.user) throw new Error('useMe() outside the signed-in app');
  return data.user;
}

export function useUsers() {
  return useQuery({
    queryKey: keys.users,
    queryFn: () => api.get<User[]>('/users'),
  });
}
