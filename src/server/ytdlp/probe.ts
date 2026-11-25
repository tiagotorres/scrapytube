import type { VideoInfo } from '#shared/types.ts';

import { HttpError } from '../errors.ts';
import { probeArgs } from './args.ts';
import { errorMessage, isUnavailable, toVideoInfo } from './output.ts';
import { runCommand } from './process.ts';
import type { YtDlpTool } from './tool.ts';

/** Looks a video up: what the web app shows, and what a download is named after. */
export type FetchInfo = (url: string) => Promise<VideoInfo>;

/** Asks yt-dlp about a video. */
export function ytDlpFetchInfo(tool: YtDlpTool): FetchInfo {
  return async url => {
    const result = await runCommand(tool.require(), probeArgs(tool.commonOptions(), url), { timeoutMs: 90_000 });
    if (result.code !== 0) {
      const message = errorMessage(result.stderr) ?? (result.stopped ? 'YouTube took too long to answer.' : null);
      if (message && isUnavailable(message)) throw new HttpError(422, 'VIDEO_UNAVAILABLE', message);
      throw new HttpError(502, 'YTDLP_FAILED', message ?? `yt-dlp stopped (code ${result.code}).`);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(result.stdout);
    } catch {
      throw new HttpError(502, 'YTDLP_FAILED', 'yt-dlp sent something that is not JSON.');
    }
    const parsed = toVideoInfo(raw as Parameters<typeof toVideoInfo>[0]);
    if (!parsed.ok) throw new HttpError(422, parsed.reason);
    return parsed.info;
  };
}

const CACHE_MS = 15 * 60 * 1000;

/**
 * Looks videos up, at most a few at once, remembering the answers for a
 * while: the web app asks when a link is pasted, and the download asks again.
 */
export class VideoLookup {
  private readonly fetchInfo: FetchInfo;
  private readonly cache = new Map<string, { info: VideoInfo; at: number }>();
  private readonly pending = new Map<string, Promise<VideoInfo>>();
  private running = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly maxRunning: number;

  constructor(fetchInfo: FetchInfo, maxRunning = 3) {
    this.fetchInfo = fetchInfo;
    this.maxRunning = maxRunning;
  }

  async get(id: string, url: string): Promise<VideoInfo> {
    const cached = this.cache.get(id);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.info;
    let promise = this.pending.get(id);
    if (!promise) {
      promise = this.limited(() => this.fetchInfo(url))
        .then(info => {
          this.remember(id, info);
          return info;
        })
        .finally(() => this.pending.delete(id));
      this.pending.set(id, promise);
    }
    return promise;
  }

  private remember(id: string, info: VideoInfo) {
    const now = Date.now();
    for (const [key, entry] of this.cache) if (now - entry.at >= CACHE_MS) this.cache.delete(key);
    this.cache.set(id, { info, at: now });
  }

  private async limited<T>(task: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxRunning) await new Promise<void>(resolve => this.waiting.push(resolve));
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}
