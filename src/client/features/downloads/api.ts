import { useQuery } from '@tanstack/react-query';

import type { CreateDownloadInput } from '#shared/schemas.ts';
import type { Download, FolderListing, LastChoices, SystemInfo, VideoInfo } from '#shared/types.ts';

import { api } from '@/api/client.ts';
import { keys, queryClient } from '@/api/query-client.ts';

const isActive = (download: Download) => download.status === 'queued' || download.status === 'running';

/** Everyone's downloads, newest first; checked every second while some are running. */
export function useDownloads() {
  return useQuery({
    queryKey: keys.downloads,
    queryFn: () => api.get<Download[]>('/downloads'),
    refetchInterval: query => (query.state.data?.some(isActive) ? 1000 : 15_000),
  });
}

export function useLastChoices() {
  return useQuery({
    queryKey: keys.lastChoices,
    queryFn: () => api.get<LastChoices>('/downloads/last-choices'),
    staleTime: 0,
  });
}

/** What YouTube says about a video (asked once per video for a while). */
export function useVideoInfo(video: { id: string; url: string } | null) {
  return useQuery({
    queryKey: ['video', video?.id],
    queryFn: () => api.post<VideoInfo>('/probe', { url: video!.url }),
    enabled: video !== null,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

export function useFolders(path: string, enabled = true) {
  return useQuery({
    queryKey: keys.folders(path),
    queryFn: () => api.get<FolderListing>(`/folders?path=${encodeURIComponent(path)}`),
    enabled,
    staleTime: 5_000,
    retry: false,
  });
}

export function useSystem() {
  return useQuery({
    queryKey: keys.system,
    queryFn: () => api.get<SystemInfo>('/system'),
    // While yt-dlp is being updated (at start, or once a day), until it's done.
    refetchInterval: query => (query.state.data?.ytDlp.updating ? 2000 : false),
  });
}

/** Puts a changed download in the list at once, before the next check. */
function storeDownload(download: Download) {
  queryClient.setQueryData<Download[]>(keys.downloads, list => {
    if (!list) return [download];
    const index = list.findIndex(item => item.id === download.id);
    if (index === -1) return [download, ...list];
    return list.map(item => (item.id === download.id ? download : item));
  });
}

export async function createDownload(input: CreateDownloadInput): Promise<Download> {
  const download = await api.post<Download>('/downloads', input);
  storeDownload(download);
  void queryClient.invalidateQueries({ queryKey: keys.downloads });
  return download;
}

export async function cancelDownload(id: number) {
  storeDownload(await api.post<Download>(`/downloads/${id}/cancel`));
}

export async function retryDownload(id: number) {
  storeDownload(await api.post<Download>(`/downloads/${id}/retry`));
  void queryClient.invalidateQueries({ queryKey: keys.downloads, exact: true });
}

export async function removeDownload(id: number) {
  await api.delete(`/downloads/${id}`);
  queryClient.setQueryData<Download[]>(keys.downloads, list => list?.filter(item => item.id !== id));
}

export async function clearFinished() {
  await api.post('/downloads/clear');
  queryClient.setQueryData<Download[]>(keys.downloads, list => list?.filter(isActive));
}

export function createFolder(parent: string, name: string) {
  return api.post<{ name: string; path: string }>('/folders', { parent, name });
}
