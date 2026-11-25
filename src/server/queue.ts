import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

import type { DownloadProgress } from '#shared/types.ts';

import type { Config } from './config.ts';
import type { Database } from './db.ts';
import type { MediaFolder } from './media.ts';
import type { DownloadRow } from './store/downloads.ts';
import {
  findDownload,
  markCanceled,
  markDone,
  markFailed,
  markRunning,
  nextQueued,
  requeueInterrupted,
} from './store/downloads.ts';
import { downloadArgs } from './ytdlp/args.ts';
import { ProgressTracker, errorMessage, parseLine } from './ytdlp/output.ts';
import type { RunOptions, RunResult } from './ytdlp/process.ts';
import { runCommand } from './ytdlp/process.ts';
import type { YtDlpTool } from './ytdlp/tool.ts';

// Runs the downloads, a few at a time, in the order they were asked for.
// Each runs yt-dlp with its parts in a folder of its own in DATA_DIR/tmp, so
// the media folder only ever gets finished files. If ScrapyTube stops, the
// running ones start again (and carry on where they were) on the next start.

/** Runs yt-dlp; replaced in tests. */
export type Runner = (args: string[], options: RunOptions) => Promise<RunResult>;

interface Running {
  abort: AbortController;
  tracker: ProgressTracker;
  /** Why it was stopped: by someone, or because ScrapyTube is stopping. */
  stopReason: 'cancel' | 'shutdown' | null;
  done: Promise<void>;
}

export class DownloadQueue {
  private readonly db: Database;
  private readonly media: MediaFolder;
  private readonly tool: YtDlpTool;
  private readonly config: Config;
  private readonly runner: Runner;
  private readonly running = new Map<number, Running>();
  private stopping = false;
  private started = false;

  constructor(deps: { db: Database; media: MediaFolder; tool: YtDlpTool; config: Config; runner?: Runner }) {
    this.db = deps.db;
    this.media = deps.media;
    this.tool = deps.tool;
    this.config = deps.config;
    this.runner = deps.runner ?? ((args, options) => runCommand(this.tool.require(), args, options));
  }

  /** Starts working through the queue, starting again what a stop interrupted. */
  start() {
    const interrupted = requeueInterrupted(this.db);
    if (interrupted) console.log(`${interrupted} interrupted download(s) start again.`);
    this.started = true;
    this.pump();
  }

  get busy(): boolean {
    return this.running.size > 0;
  }

  progress(id: number): DownloadProgress | null {
    return this.running.get(id)?.tracker.snapshot() ?? null;
  }

  /** Starts waiting downloads while there is room (not while yt-dlp is being updated). */
  pump() {
    if (!this.started || this.stopping || this.tool.updating) return;
    while (this.running.size < this.config.maxConcurrent) {
      const next = nextQueued(this.db, [...this.running.keys()]);
      if (!next) return;
      this.begin(next);
    }
  }

  /** Stops a running download; true if it was running. */
  async cancel(id: number): Promise<boolean> {
    const job = this.running.get(id);
    if (!job) return false;
    job.stopReason = 'cancel';
    job.abort.abort();
    await job.done;
    return true;
  }

  /** Stops everything (ScrapyTube is stopping): what was running starts again next time. */
  async stop() {
    this.stopping = true;
    for (const job of this.running.values()) {
      job.stopReason = 'shutdown';
      job.abort.abort();
    }
    await Promise.all([...this.running.values()].map(job => job.done));
  }

  private tempFolder(id: number): string {
    return path.join(this.config.dataDir, 'tmp', String(id));
  }

  private begin(row: DownloadRow) {
    const job: Running = {
      abort: new AbortController(),
      tracker: new ProgressTracker(),
      stopReason: null,
      done: Promise.resolve(),
    };
    this.running.set(row.id, job);
    markRunning(this.db, row.id);
    job.done = this.execute(row, job)
      .catch(error => {
        console.error(`Download ${row.id} failed:`, error);
        markFailed(this.db, row.id, error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        this.running.delete(row.id);
        this.pump();
      });
  }

  private async execute(row: DownloadRow, job: Running) {
    const finalFile = this.media.resolve(row.file_path);
    const folder = path.dirname(finalFile);
    if (!row.overwrite && existsSync(finalFile)) {
      markFailed(this.db, row.id, `There is already a file called "${path.basename(finalFile)}" in this folder.`);
      return;
    }
    const temp = this.tempFolder(row.id);
    mkdirSync(folder, { recursive: true });
    mkdirSync(temp, { recursive: true });

    const args = downloadArgs(this.tool.commonOptions(temp), {
      url: row.url,
      kind: row.kind,
      folder,
      tempFolder: temp,
      baseName: path.basename(finalFile, path.extname(finalFile)),
      overwrite: row.overwrite === 1,
    });
    const result = await this.runner(args, {
      signal: job.abort.signal,
      onLine: (line, stream) => {
        if (stream !== 'stdout') return;
        const event = parseLine(line);
        if (event) job.tracker.apply(event);
      },
    });

    if (job.stopReason === 'shutdown') return; // Stays "running": queued again at the next start, parts kept.
    rmSync(temp, { recursive: true, force: true });

    if (job.stopReason === 'cancel') {
      // It may have been removed from the list meanwhile.
      if (findDownload(this.db, row.id)) markCanceled(this.db, row.id);
      return;
    }

    const saved = job.tracker.finalPath ?? finalFile;
    if (result.code === 0 && existsSync(saved)) {
      const relative = path.relative(this.media.root, saved).split(path.sep).join('/');
      markDone(this.db, row.id, relative.startsWith('..') ? row.file_path : relative, statSync(saved).size);
      return;
    }
    const message =
      errorMessage(result.stderr) ??
      (result.code === 0 ? 'yt-dlp finished without making the file.' : `yt-dlp stopped (code ${result.code}).`);
    markFailed(this.db, row.id, message);
  }
}
