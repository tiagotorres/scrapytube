import type { Download, DownloadKind, DownloadProgress, DownloadStatus, LastChoices, VideoInfo } from '#shared/types.ts';

import type { Database } from '../db.ts';
import { now } from '../db.ts';
import { notFound } from '../errors.ts';

// The downloads asked for. Everyone sees everyone's (the media folder is
// shared); each says who asked for it.

export interface DownloadRow {
  id: number;
  user_id: number | null;
  user_name: string | null;
  video_id: string;
  url: string;
  kind: DownloadKind;
  title: string;
  channel: string | null;
  handle: string | null;
  duration: number | null;
  folder: string;
  file_path: string;
  overwrite: number;
  status: DownloadStatus;
  error: string | null;
  size: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const SELECT_DOWNLOAD = `
  SELECT d.*, u.name AS user_name
  FROM downloads d LEFT JOIN users u ON u.id = d.user_id`;

export function toDownload(row: DownloadRow, progress: DownloadProgress | null = null): Download {
  return {
    id: row.id,
    videoId: row.video_id,
    url: row.url,
    kind: row.kind,
    title: row.title,
    channel: row.channel,
    handle: row.handle,
    duration: row.duration,
    folder: row.folder,
    filePath: row.file_path,
    status: row.status,
    error: row.error,
    size: row.size,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    user: row.user_id !== null && row.user_name !== null ? { id: row.user_id, name: row.user_name } : null,
    progress: row.status === 'running' ? progress : null,
  };
}

/** The latest downloads, newest first. */
export function listDownloads(db: Database, limit = 300): DownloadRow[] {
  return db.prepare(`${SELECT_DOWNLOAD} ORDER BY d.id DESC LIMIT ?`).all(limit) as unknown as DownloadRow[];
}

export function findDownload(db: Database, id: number): DownloadRow | undefined {
  return db.prepare(`${SELECT_DOWNLOAD} WHERE d.id = ?`).get(id) as DownloadRow | undefined;
}

export function requireDownload(db: Database, id: number): DownloadRow {
  const row = findDownload(db, id);
  if (!row) throw notFound();
  return row;
}

/** The next download waiting its turn, leaving out those already running. */
export function nextQueued(db: Database, running: number[]): DownloadRow | undefined {
  const exclude = running.length ? `AND d.id NOT IN (${running.map(() => '?').join(', ')})` : '';
  return db.prepare(`${SELECT_DOWNLOAD} WHERE d.status = 'queued' ${exclude} ORDER BY d.id LIMIT 1`).get(...running) as
    | DownloadRow
    | undefined;
}

/** A download not finished yet that saves to this file. */
export function activeForFile(db: Database, filePath: string): DownloadRow | undefined {
  return db
    .prepare(`${SELECT_DOWNLOAD} WHERE d.file_path = ? AND d.status IN ('queued', 'running') LIMIT 1`)
    .get(filePath) as DownloadRow | undefined;
}

export function insertDownload(
  db: Database,
  input: { userId: number; info: VideoInfo; kind: DownloadKind; folder: string; filePath: string; overwrite: boolean },
): number {
  const { info } = input;
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO downloads (user_id, video_id, url, kind, title, channel, handle, duration, folder, file_path, overwrite, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
    )
    .run(
      input.userId,
      info.id,
      info.url,
      input.kind,
      info.title,
      info.channel,
      info.handle,
      info.duration,
      input.folder,
      input.filePath,
      input.overwrite ? 1 : 0,
      now(),
    );
  return Number(lastInsertRowid);
}

export function markRunning(db: Database, id: number) {
  db.prepare(`UPDATE downloads SET status = 'running', started_at = ?, error = NULL WHERE id = ?`).run(now(), id);
}

export function markDone(db: Database, id: number, filePath: string, size: number | null) {
  db.prepare(
    `UPDATE downloads SET status = 'done', file_path = ?, size = ?, error = NULL, finished_at = ? WHERE id = ?`,
  ).run(filePath, size, now(), id);
}

export function markFailed(db: Database, id: number, error: string) {
  db.prepare(`UPDATE downloads SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`).run(error, now(), id);
}

export function markCanceled(db: Database, id: number) {
  db.prepare(`UPDATE downloads SET status = 'canceled', finished_at = ? WHERE id = ?`).run(now(), id);
}

/** Puts a download back in the queue (to try again, or after a restart). */
export function requeue(db: Database, id: number) {
  db.prepare(
    `UPDATE downloads SET status = 'queued', error = NULL, size = NULL, started_at = NULL, finished_at = NULL WHERE id = ?`,
  ).run(id);
}

/** Downloads that were running when ScrapyTube stopped wait their turn again. */
export function requeueInterrupted(db: Database): number {
  return Number(db.prepare(`UPDATE downloads SET status = 'queued', started_at = NULL WHERE status = 'running'`).run().changes);
}

export function deleteDownload(db: Database, id: number) {
  db.prepare('DELETE FROM downloads WHERE id = ?').run(id);
}

/** Removes the finished downloads from the list (the files stay). */
export function clearFinished(db: Database): number {
  return Number(db.prepare(`DELETE FROM downloads WHERE status IN ('done', 'failed', 'canceled')`).run().changes);
}

/** The folder each kind was last saved in by this person. */
export function lastChoices(db: Database, userId: number): LastChoices {
  const last = (kind: DownloadKind) => {
    const row = db
      .prepare('SELECT folder FROM downloads WHERE user_id = ? AND kind = ? ORDER BY id DESC LIMIT 1')
      .get(userId, kind) as { folder: string } | undefined;
    return row ? { folder: row.folder } : null;
  };
  return { video: last('video'), music: last('music') };
}
