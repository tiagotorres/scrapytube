import { channelFolderName } from '#shared/paths.ts';
import type { DownloadProgress, VideoInfo } from '#shared/types.ts';
import { videoPageUrl } from '#shared/youtube.ts';

import { MARKS } from './args.ts';

// Reading what yt-dlp prints: the JSON about a video, the progress lines
// asked for in args.ts, and its error messages.

// ---------------------------------------------------------------------------
// The video
// ---------------------------------------------------------------------------

interface RawInfo {
  id?: unknown;
  title?: unknown;
  channel?: unknown;
  uploader?: unknown;
  uploader_id?: unknown;
  uploader_url?: unknown;
  channel_url?: unknown;
  duration?: unknown;
  upload_date?: unknown;
  thumbnail?: unknown;
  live_status?: unknown;
  is_live?: unknown;
  _type?: unknown;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** The handle in "@RickAstleyYT" or "https://www.youtube.com/@RickAstleyYT". */
function handleFrom(...values: unknown[]): string | null {
  for (const value of values) {
    const raw = text(value);
    if (!raw) continue;
    const match = /(?:^|\/)@([^/?#\s]+)/.exec(raw);
    if (match) {
      try {
        return decodeURIComponent(match[1]!);
      } catch {
        return match[1]!;
      }
    }
  }
  return null;
}

export type InfoResult = { ok: true; info: VideoInfo } | { ok: false; reason: 'LIVE_NOT_SUPPORTED' | 'NOT_A_VIDEO_LINK' };

/** What ScrapyTube keeps of yt-dlp's JSON about a video. */
export function toVideoInfo(raw: RawInfo): InfoResult {
  const id = text(raw.id);
  if (!id || (raw._type !== undefined && raw._type !== 'video')) return { ok: false, reason: 'NOT_A_VIDEO_LINK' };
  if (raw.is_live === true || raw.live_status === 'is_live' || raw.live_status === 'is_upcoming') {
    return { ok: false, reason: 'LIVE_NOT_SUPPORTED' };
  }
  const channel = text(raw.channel) ?? text(raw.uploader);
  const handle = handleFrom(raw.uploader_id, raw.uploader_url, raw.channel_url);
  const date = text(raw.upload_date);
  return {
    ok: true,
    info: {
      id,
      url: videoPageUrl(id),
      title: text(raw.title) ?? id,
      channel,
      handle,
      channelFolder: channelFolderName(handle, channel),
      duration: typeof raw.duration === 'number' && Number.isFinite(raw.duration) ? Math.round(raw.duration) : null,
      uploadDate: date && /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}` : null,
      thumbnail: text(raw.thumbnail),
    },
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * yt-dlp's last error, made readable: "ERROR: [youtube] dQw4w9WgXcQ: Video
 * unavailable" → "Video unavailable".
 */
export function errorMessage(stderr: string): string | null {
  const lines = stderr
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('ERROR:'));
  const last = lines.at(-1);
  if (!last) return null;
  return last
    .replace(/^ERROR:\s*/, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^[A-Za-z0-9_-]{11}:\s*/, '')
    .slice(0, 500);
}

/** The video can't be had (private, removed, age or region restricted…), as opposed to yt-dlp failing. */
export function isUnavailable(message: string): boolean {
  return /unavailable|private video|removed|terminated|not available|members[- ]only|sign in to confirm your age|copyright|blocked/i.test(
    message,
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type OutputEvent =
  | {
      type: 'progress';
      status: string;
      file: string;
      downloaded: number | null;
      total: number | null;
      speed: number | null;
      eta: number | null;
    }
  | { type: 'postprocess'; status: string; name: string }
  | { type: 'format'; formatId: string; size: number | null }
  | { type: 'file'; path: string };

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** One line yt-dlp printed on its output, if it is one of ScrapyTube's. */
export function parseLine(line: string): OutputEvent | null {
  if (line.startsWith(`${MARKS.progress} `)) {
    try {
      const data = JSON.parse(line.slice(MARKS.progress.length + 1)) as Record<string, unknown>;
      return {
        type: 'progress',
        status: typeof data.status === 'string' ? data.status : 'downloading',
        file: typeof data.filename === 'string' ? data.filename : '',
        downloaded: num(data.downloaded_bytes),
        total: num(data.total_bytes) ?? num(data.total_bytes_estimate),
        speed: num(data.speed),
        eta: num(data.eta),
      };
    } catch {
      return null;
    }
  }
  if (line.startsWith(`${MARKS.postprocess} `)) {
    const [status = '', name = ''] = line.slice(MARKS.postprocess.length + 1).split(' ');
    return { type: 'postprocess', status, name };
  }
  if (line.startsWith(`${MARKS.format} `)) {
    const [formatId = '', size = ''] = line.slice(MARKS.format.length + 1).split(' ');
    const bytes = Number(size);
    return { type: 'format', formatId, size: Number.isFinite(bytes) && bytes > 0 ? bytes : null };
  }
  if (line.startsWith(`${MARKS.file} `)) return { type: 'file', path: line.slice(MARKS.file.length + 1) };
  return null;
}

/**
 * Follows a download from its events. A video is often two downloads (the
 * picture, then the sound), so progress counts the bytes of both against
 * the size yt-dlp expected.
 */
export class ProgressTracker {
  private streams = 1;
  private expected: number | null = null;
  private readonly files = new Map<string, { downloaded: number; total: number | null; finished: boolean }>();
  private phase: DownloadProgress['phase'] = 'starting';
  private speed: number | null = null;
  private eta: number | null = null;
  /** The final file, as yt-dlp says once it is in place. */
  finalPath: string | null = null;

  apply(event: OutputEvent) {
    switch (event.type) {
      case 'format':
        this.streams = Math.max(1, event.formatId.split('+').length);
        this.expected = event.size;
        break;
      case 'progress': {
        const entry = this.files.get(event.file) ?? { downloaded: 0, total: null, finished: false };
        if (event.downloaded !== null) entry.downloaded = event.downloaded;
        if (event.total !== null) entry.total = event.total;
        if (event.status === 'finished') {
          entry.finished = true;
          if (entry.total === null) entry.total = entry.downloaded;
        }
        this.files.set(event.file, entry);
        this.phase = 'downloading';
        this.speed = event.status === 'finished' ? null : event.speed;
        this.eta = event.status === 'finished' ? null : event.eta;
        break;
      }
      case 'postprocess':
        // Converting the picture for the cover can happen before downloading.
        if (event.status === 'started' && this.files.size > 0 && [...this.files.values()].every(file => file.finished)) {
          this.phase = 'processing';
          this.speed = null;
          this.eta = null;
        }
        break;
      case 'file':
        this.finalPath = event.path;
        break;
    }
  }

  snapshot(): DownloadProgress {
    return { phase: this.phase, fraction: this.fraction(), speed: this.speed, eta: this.eta };
  }

  private fraction(): number | null {
    if (this.phase === 'processing') return 1;
    if (this.files.size === 0) return this.phase === 'starting' ? 0 : null;
    const files = [...this.files.values()];
    const downloaded = files.reduce((sum, file) => sum + file.downloaded, 0);
    const known = files.reduce((sum, file) => sum + (file.total ?? 0), 0);
    let fraction: number | null = null;
    if (files.length >= this.streams && files.every(file => file.total)) fraction = downloaded / known;
    else if (this.expected) fraction = downloaded / Math.max(this.expected, known);
    else {
      const current = files.at(-1)!;
      const done = files.filter(file => file.finished).length;
      const part = current.finished || !current.total ? 0 : current.downloaded / current.total;
      fraction = (done + part) / Math.max(this.streams, files.length);
    }
    return Math.min(0.99, Math.max(0, fraction));
  }
}
