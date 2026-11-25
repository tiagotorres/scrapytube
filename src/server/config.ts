import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface Config {
  port: number;
  /** Folder holding the database and ScrapyTube's own files (a Docker volume). */
  dataDir: string;
  /** Folder the downloads are saved in (the other Docker volume). */
  mediaDir: string;
  /** How long a sign-in lasts without using the app. */
  sessionDays: number;
  /** Built web app, served when present (production). */
  clientDir: string;
  version: string;
  ytDlp: {
    /** A yt-dlp to use as it is (never updated); null for ScrapyTube's own copy in DATA_DIR/bin. */
    path: string | null;
    /** The copy shipped in the Docker image, installed in DATA_DIR/bin on the first start. */
    bundled: string | null;
    /** Check for a new yt-dlp at start and every day. */
    autoUpdate: boolean;
    /** "stable" or "nightly". */
    channel: string;
  };
  ffmpegPath: string;
  /** Downloads running at the same time. */
  maxConcurrent: number;
}

const rootDir = path.resolve(import.meta.dirname, '../..');

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

function intFromEnv(name: string, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number from ${min} to ${max} (got "${raw}").`);
  }
  return value;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`${name} must be true or false (got "${process.env[name]}").`);
}

function channelFromEnv(): string {
  const channel = process.env.YTDLP_CHANNEL?.trim() || 'stable';
  if (!['stable', 'nightly', 'master'].includes(channel)) {
    throw new Error(`YTDLP_CHANNEL must be stable, nightly or master (got "${channel}").`);
  }
  return channel;
}

export function loadConfig(): Config {
  return {
    port: intFromEnv('PORT', 5011, 1, 65535),
    dataDir: path.resolve(process.env.DATA_DIR || path.join(rootDir, 'data')),
    mediaDir: path.resolve(process.env.MEDIA_DIR || path.join(rootDir, 'media')),
    sessionDays: intFromEnv('SESSION_DAYS', 180, 1),
    clientDir: path.join(rootDir, 'dist/client'),
    version: readVersion(),
    ytDlp: {
      path: process.env.YTDLP_PATH?.trim() || null,
      bundled: process.env.YTDLP_BUNDLED?.trim() || null,
      autoUpdate: boolFromEnv('YTDLP_AUTO_UPDATE', true),
      channel: channelFromEnv(),
    },
    ffmpegPath: process.env.FFMPEG_PATH?.trim() || 'ffmpeg',
    maxConcurrent: intFromEnv('MAX_DOWNLOADS', 2, 1, 10),
  };
}
