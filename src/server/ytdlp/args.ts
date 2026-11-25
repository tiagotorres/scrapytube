import type { DownloadKind } from '#shared/types.ts';

// The command lines given to yt-dlp. Kept apart (and without side effects) so
// they can be read, and tested, in one place.

/** Lines ScrapyTube asks yt-dlp to print, to follow a download. */
export const MARKS = {
  progress: '@@scrapytube:progress',
  postprocess: '@@scrapytube:postprocess',
  format: '@@scrapytube:format',
  file: '@@scrapytube:file',
} as const;

export interface CommonOptions {
  /** Node.js: yt-dlp needs a JavaScript runtime to read YouTube's pages. */
  nodePath: string;
  cacheDir: string;
  /** A yt-dlp.conf of the person's own (cookies, proxy…), or null. */
  configFile: string | null;
  ffmpegPath: string;
}

function commonArgs(options: CommonOptions): string[] {
  const args = ['--ignore-config'];
  if (options.configFile) args.push('--config-locations', options.configFile);
  args.push('--no-js-runtimes', '--js-runtimes', `node:${options.nodePath}`);
  args.push('--cache-dir', options.cacheDir);
  if (options.ffmpegPath !== 'ffmpeg') args.push('--ffmpeg-location', options.ffmpegPath);
  // A link to a video in a playlist downloads the video only.
  args.push('--no-playlist', '--color', 'never');
  return args;
}

/** Asks for what YouTube says about a video, as JSON, without downloading it. */
export function probeArgs(options: CommonOptions, url: string): string[] {
  return [...commonArgs(options), '--dump-single-json', '--skip-download', '--no-warnings', '--', url];
}

/**
 * The best video that plays everywhere: H.264 with AAC sound, which YouTube
 * has up to 1080p. Other codecs only when there is no H.264 at all; the
 * result is always an MP4.
 */
const VIDEO_ARGS = [
  '-f',
  'bv*+ba/b',
  '-S',
  'vcodec:h264,res,acodec:m4a',
  '--merge-output-format',
  'mp4',
  '--remux-video',
  'mp4',
  '--embed-metadata',
  '--embed-chapters',
];

/** The cover art of an MP3: the video's picture, cropped to a square. */
const SQUARE_COVER =
  'ThumbnailsConvertor+ffmpeg_o:-c:v mjpeg -qmin 1 -qscale:v 1 ' +
  `-vf crop="'if(gt(ih,iw),iw,ih)':'if(gt(iw,ih),ih,iw)'"`;

/** The sound at the best quality, as an MP3 (VBR ~245 kb/s) with the title, artist and cover art. */
const MUSIC_ARGS = [
  '-f',
  'ba/b',
  '--extract-audio',
  '--audio-format',
  'mp3',
  '--audio-quality',
  '0',
  '--embed-metadata',
  '--embed-thumbnail',
  '--convert-thumbnails',
  'jpg',
  '--ppa',
  SQUARE_COVER,
];

/** "100% Pure" → "100%% Pure": the output template reads % as the start of a field. */
export function escapeTemplate(text: string): string {
  return text.replaceAll('%', '%%');
}

export interface DownloadJob {
  url: string;
  kind: DownloadKind;
  /** Absolute folder the file goes to. */
  folder: string;
  /** Absolute folder for the parts while downloading (deleted afterwards). */
  tempFolder: string;
  /** The file's name without its extension. */
  baseName: string;
  overwrite: boolean;
}

export function downloadArgs(options: CommonOptions, job: DownloadJob): string[] {
  return [
    ...commonArgs(options),
    ...(job.kind === 'video' ? VIDEO_ARGS : MUSIC_ARGS),
    '-P',
    `home:${job.folder}`,
    '-P',
    `temp:${job.tempFolder}`,
    '-o',
    `${escapeTemplate(job.baseName)}.%(ext)s`,
    ...(job.overwrite ? ['--force-overwrites'] : []),
    '--no-simulate',
    '--quiet',
    '--progress',
    '--newline',
    '--progress-delta',
    '0.5',
    '--progress-template',
    `download:${MARKS.progress} %(progress)j`,
    '--progress-template',
    `postprocess:${MARKS.postprocess} %(progress.status)s %(progress.postprocessor)s`,
    '--print',
    `before_dl:${MARKS.format} %(format_id)s %(filesize_approx)s`,
    '--print',
    `after_move:${MARKS.file} %(filepath)s`,
    '--',
    job.url,
  ];
}
