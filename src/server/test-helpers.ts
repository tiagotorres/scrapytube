import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { SetupInput } from '#shared/schemas.ts';
import type { VideoInfo } from '#shared/types.ts';
import { videoPageUrl } from '#shared/youtube.ts';

import { CSRF_HEADER, createApp } from './app.ts';
import type { Config } from './config.ts';
import { openDatabase } from './db.ts';
import { MediaFolder } from './media.ts';
import type { Runner } from './queue.ts';
import { DownloadQueue } from './queue.ts';
import type { FetchInfo } from './ytdlp/probe.ts';
import { VideoLookup } from './ytdlp/probe.ts';
import { YtDlpTool } from './ytdlp/tool.ts';

/** What the fake YouTube says about a video. */
export function videoInfo(id: string, overrides: Partial<VideoInfo> = {}): VideoInfo {
  return {
    id,
    url: videoPageUrl(id),
    title: `Video ${id}`,
    channel: 'Channel One',
    handle: 'handle1',
    channelFolder: 'handle1',
    duration: 212,
    uploadDate: '2026-11-01',
    thumbnail: null,
    ...overrides,
  };
}

export interface TestOptions {
  /** Answers video lookups (default: videoInfo(id)). */
  fetchInfo?: FetchInfo;
  /** Runs yt-dlp (default: never finishes, until stopped). */
  runner?: Runner;
  maxConcurrent?: number;
  /** A built web app to serve. */
  clientDir?: string;
}

/** Waits for nothing to be pending on the event loop's next turns. */
export const tick = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));

export function createTestApp(options: TestOptions = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'scrapytube-test-'));
  const mediaDir = path.join(dataDir, 'media');
  mkdirSync(mediaDir);
  const db = openDatabase(':memory:');
  const config: Config = {
    port: 0,
    dataDir,
    mediaDir,
    sessionDays: 30,
    clientDir: options.clientDir ?? path.join(dataDir, 'no-client'),
    version: 'test',
    ytDlp: { path: '/nonexistent/yt-dlp', bundled: null, autoUpdate: false, channel: 'stable' },
    ffmpegPath: 'ffmpeg',
    maxConcurrent: options.maxConcurrent ?? 2,
  };
  const media = new MediaFolder(mediaDir);
  const ytDlp = new YtDlpTool(config);
  ytDlp.path = config.ytDlp.path;
  const fetchInfo: FetchInfo =
    options.fetchInfo ?? (async url => videoInfo(new URL(url).searchParams.get('v') ?? 'xxxxxxxxxxx'));
  const lookup = new VideoLookup(fetchInfo);
  const runner: Runner =
    options.runner ??
    ((_args, { signal }) =>
      new Promise(resolve => {
        signal?.addEventListener('abort', () => resolve({ code: null, stdout: '', stderr: '', stopped: true }));
      }));
  const queue = new DownloadQueue({ db, media, tool: ytDlp, config, runner });
  queue.start();
  return {
    app: createApp({ db, config, media, ytDlp, lookup, queue }),
    db,
    dataDir,
    mediaDir,
    queue,
    async cleanup() {
      await queue.stop();
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

type App = ReturnType<typeof createTestApp>['app'];

interface Response<T> {
  status: number;
  body: T;
  headers: Headers;
}

/** Talks to the app like the browser does, keeping the session cookie. */
export class TestClient {
  cookie = '';
  private readonly app: App;

  constructor(app: App) {
    this.app = app;
  }

  async request<T = any>(method: string, url: string, body?: unknown): Promise<Response<T>> {
    const headers: Record<string, string> = { [CSRF_HEADER]: '1' };
    if (this.cookie) headers.cookie = this.cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.app.request(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0]!;
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed as T, headers: res.headers };
  }

  get<T = any>(url: string) {
    return this.request<T>('GET', url);
  }
  post<T = any>(url: string, body?: unknown) {
    return this.request<T>('POST', url, body);
  }
  patch<T = any>(url: string, body?: unknown) {
    return this.request<T>('PATCH', url, body);
  }
  put<T = any>(url: string, body?: unknown) {
    return this.request<T>('PUT', url, body);
  }
  delete<T = any>(url: string) {
    return this.request<T>('DELETE', url);
  }
}

export const SETUP: SetupInput = {
  name: 'Tiago',
  username: 'tiago',
  password: 'correct horse',
  language: 'en',
};

/** An app that went through setup, with a signed-in client. */
export async function setUpApp(options: TestOptions = {}) {
  const test = createTestApp(options);
  const client = new TestClient(test.app);
  const res = await client.post('/api/setup', SETUP);
  if (res.status !== 200) throw new Error(`Setup failed: ${JSON.stringify(res.body)}`);

  /** Adds a person and returns a client signed in as them. */
  const addUser = async (username: string, name = username) => {
    const created = await client.post('/api/users', { name, username, password: 'another password', language: 'fr' });
    if (created.status !== 201) throw new Error(`User not made: ${JSON.stringify(created.body)}`);
    const other = new TestClient(test.app);
    const login = await other.post('/api/login', { username, password: 'another password' });
    if (login.status !== 200) throw new Error(`Login failed: ${JSON.stringify(login.body)}`);
    return other;
  };
  return { ...test, client, addUser };
}
