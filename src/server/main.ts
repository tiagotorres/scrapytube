import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { serve } from '@hono/node-server';

import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDatabase } from './db.ts';
import { MediaFolder } from './media.ts';
import { DownloadQueue } from './queue.ts';
import { deleteExpiredSessions } from './sessions.ts';
import { VideoLookup, ytDlpFetchInfo } from './ytdlp/probe.ts';
import { YtDlpTool } from './ytdlp/tool.ts';

const DAY = 24 * 60 * 60 * 1000;

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const db = openDatabase(path.join(config.dataDir, 'scrapytube.db'));
const media = new MediaFolder(config.mediaDir);
media.ensureRoot();

deleteExpiredSessions(db);
const sessionCleanup = setInterval(() => deleteExpiredSessions(db), DAY);
sessionCleanup.unref();

const ytDlp = new YtDlpTool(config);
const lookup = new VideoLookup(ytDlpFetchInfo(ytDlp));
const queue = new DownloadQueue({ db, media, tool: ytDlp, config });
ytDlp.onUpdated = () => queue.pump();

const app = createApp({ db, config, media, ytDlp, lookup, queue });
const server = serve({ fetch: app.fetch, port: config.port }, info => {
  console.log(
    `ScrapyTube ${config.version} listening on port ${info.port}, data in ${config.dataDir}, media in ${config.mediaDir}`,
  );
});

// Parts of downloads that won't start again (removed from the list meanwhile).
const tempDir = path.join(config.dataDir, 'tmp');
mkdirSync(tempDir, { recursive: true });

let updateTimer: ReturnType<typeof setInterval> | undefined;
await ytDlp.init();
console.log(`yt-dlp ${ytDlp.version ?? 'missing'}, ffmpeg ${ytDlp.ffmpegVersion ?? 'missing'}`);
for (const id of readdirSync(tempDir)) {
  const row = db.prepare(`SELECT 1 FROM downloads WHERE id = ? AND status IN ('queued', 'running')`).get(Number(id));
  if (!row) rmSync(path.join(tempDir, id), { recursive: true, force: true });
}
queue.start();

if (config.ytDlp.autoUpdate && ytDlp.managed) {
  // Once a day, when nothing is downloading (an update pauses new downloads).
  const check = () => {
    if (queue.busy) return void setTimeout(check, 60 * 60 * 1000).unref();
    ytDlp.update().catch(error => console.warn('yt-dlp update check failed:', error));
  };
  check();
  updateTimer = setInterval(check, DAY);
  updateTimer.unref();
}

let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, stopping…`);
  clearInterval(sessionCleanup);
  clearInterval(updateTimer);
  const exit = () => {
    db.close();
    process.exit(0);
  };
  // Running downloads stop; they start again (where they were) next time.
  void queue.stop().finally(() => server.close(exit));
  // Don't wait forever for open connections.
  setTimeout(exit, 8000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
