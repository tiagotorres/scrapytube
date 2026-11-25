// Types and constants shared by the server and the web app. Everything the
// API sends or receives is described here.

export const LANGUAGES = ['en', 'pt-PT', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'INVALID_CREDENTIALS'
  | 'WRONG_PASSWORD'
  | 'USERNAME_TAKEN'
  | 'SETUP_DONE'
  | 'CANNOT_REMOVE_SELF'
  // Links and videos
  | 'NOT_A_VIDEO_LINK'
  | 'PLAYLIST_LINK'
  | 'VIDEO_UNAVAILABLE'
  | 'YOUTUBE_BOT_CHECK'
  | 'INVALID_COOKIES'
  | 'LIVE_NOT_SUPPORTED'
  | 'YTDLP_FAILED'
  | 'YTDLP_MISSING'
  // Folders and files
  | 'FOLDER_NOT_FOUND'
  | 'FOLDER_EXISTS'
  | 'INVALID_FOLDER_NAME'
  | 'FILE_EXISTS'
  | 'ALREADY_QUEUED'
  | 'DOWNLOAD_ACTIVE'
  | 'UPDATE_UNAVAILABLE'
  | 'BUSY';

export interface ApiErrorBody {
  error: ErrorCode;
  message?: string;
}

export interface User {
  id: number;
  username: string;
  name: string;
  language: Language;
  createdAt: string;
  /** Last time one of the user's sessions was used; null if never signed in. */
  lastActiveAt: string | null;
}

export interface SessionInfo {
  /** True until the first user is created. */
  setupRequired: boolean;
  user: User | null;
  version: string;
}

// ---------------------------------------------------------------------------
// Videos and downloads
// ---------------------------------------------------------------------------

/** A video saved as an MP4, or its sound saved as an MP3. */
export const DOWNLOAD_KINDS = ['video', 'music'] as const;
export type DownloadKind = (typeof DOWNLOAD_KINDS)[number];

export const FILE_EXTENSIONS: Record<DownloadKind, string> = { video: 'mp4', music: 'mp3' };

/** What YouTube says about a video, before it is downloaded. */
export interface VideoInfo {
  /** YouTube's 11-character id. */
  id: string;
  url: string;
  title: string;
  /** The channel's name ("Rick Astley"). */
  channel: string | null;
  /** The channel's handle, without the @ ("RickAstleyYT"). */
  handle: string | null;
  /** The name of the channel's folder: the handle, else the channel's name. */
  channelFolder: string;
  /** Seconds; null when unknown. */
  duration: number | null;
  /** YYYY-MM-DD. */
  uploadDate: string | null;
  thumbnail: string | null;
}

export type DownloadStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';

/** How far a running download is (kept in memory while it runs). */
export interface DownloadProgress {
  phase: 'starting' | 'downloading' | 'processing';
  /** 0 to 1; null while unknown. */
  fraction: number | null;
  /** Bytes per second. */
  speed: number | null;
  /** Seconds left. */
  eta: number | null;
}

export interface Download {
  id: number;
  videoId: string;
  url: string;
  kind: DownloadKind;
  title: string;
  channel: string | null;
  handle: string | null;
  duration: number | null;
  /** The folder picked, in the media folder ("" for the media folder itself). */
  folder: string;
  /** Where the file is (or will be), in the media folder: "abc/handle1/Video.mp4". */
  filePath: string;
  status: DownloadStatus;
  /** Why it failed (yt-dlp's message). */
  error: string | null;
  /** Bytes, once done. */
  size: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Who asked for it; null once that person was removed. */
  user: { id: number; name: string } | null;
  progress: DownloadProgress | null;
}

/** The folder and option last used for each kind, by the signed-in user. */
export type LastChoices = Record<DownloadKind, { folder: string } | null>;

export interface Folder {
  name: string;
  /** In the media folder, with "/" between folders. */
  path: string;
}

export interface FolderListing {
  /** "" for the media folder itself. */
  path: string;
  /** The folders above it, from the top: [{ name: 'abc', path: 'abc' }, …]. */
  parents: Folder[];
  folders: Folder[];
}

/** The largest cookies.txt accepted (a browser's whole export fits). */
export const MAX_COOKIES_LENGTH = 1_000_000;

export interface SystemInfo {
  version: string;
  ytDlp: {
    version: string | null;
    /** ScrapyTube keeps its own copy and can update it. */
    managed: boolean;
    channel: string;
    updating: boolean;
    lastCheckedAt: string | null;
    /** What the last update check said (yt-dlp's words). */
    lastCheck: string | null;
  };
  ffmpeg: { version: string | null };
  /** YouTube cookies, for when YouTube asks to confirm it isn't a bot (the cookies themselves are never sent). */
  cookies: { added: boolean; updatedAt: string | null };
  /** Space on the media folder's disk, in bytes. */
  media: { free: number | null; total: number | null };
  maxConcurrent: number;
}
