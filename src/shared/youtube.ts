// Reading YouTube links, as pasted or shared from the YouTube app. Shared by
// the web app (to react as soon as a link is pasted) and the server (which
// never runs yt-dlp on anything else).

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export type ParsedLink =
  | { ok: true; id: string; /** The video's own page, without playlist or timestamp. */ url: string }
  | { ok: false; reason: 'NOT_A_VIDEO_LINK' | 'PLAYLIST_LINK' };

/** The first web address in a text ("Watch this! https://youtu.be/…"), or the text itself. */
function firstLink(text: string): string {
  const match = /https?:\/\/\S+/i.exec(text);
  if (match) return match[0];
  const bare = /(?:^|\s)((?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/\S+)/i.exec(text);
  return bare ? `https://${bare[1]}` : text.trim();
}

export function videoPageUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Finds a single YouTube video in a link (or a text holding one). */
export function parseVideoLink(text: string): ParsedLink {
  let url: URL;
  try {
    url = new URL(firstLink(text));
  } catch {
    return { ok: false, reason: 'NOT_A_VIDEO_LINK' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'NOT_A_VIDEO_LINK' };
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  let id: string | null = null;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = parts[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const [first, second] = parts;
    if (first === 'watch') id = url.searchParams.get('v');
    else if (first && ['shorts', 'live', 'embed', 'v', 'e'].includes(first)) id = second ?? null;
    else if (first === 'playlist' || url.searchParams.has('list')) return { ok: false, reason: 'PLAYLIST_LINK' };
  } else {
    return { ok: false, reason: 'NOT_A_VIDEO_LINK' };
  }

  if (!id || !VIDEO_ID.test(id)) {
    return { ok: false, reason: url.searchParams.has('list') ? 'PLAYLIST_LINK' : 'NOT_A_VIDEO_LINK' };
  }
  return { ok: true, id, url: videoPageUrl(id) };
}

/** A small picture of the video, from YouTube (16:9). */
export function thumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}
