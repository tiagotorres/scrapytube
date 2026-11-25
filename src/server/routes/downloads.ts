import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { Hono } from 'hono';

import { downloadPath } from '#shared/paths.ts';
import { createDownloadSchema, probeSchema } from '#shared/schemas.ts';
import type { VideoInfo } from '#shared/types.ts';
import { parseVideoLink } from '#shared/youtube.ts';

import { HttpError, notFound } from '../errors.ts';
import type { AppContext, AppEnv } from '../http.ts';
import { idParam, readBody, userId } from '../http.ts';
import {
  activeForFile,
  clearFinished,
  deleteDownload,
  insertDownload,
  lastChoices,
  listDownloads,
  markCanceled,
  requeue,
  requireDownload,
  toDownload,
} from '../store/downloads.ts';

/** A YouTube video from a link, or a 400 saying why it isn't one. */
function videoLink(url: string) {
  const link = parseVideoLink(url);
  if (!link.ok) throw new HttpError(400, link.reason);
  return link;
}

/** "Vídeo.mp4" in a Content-Disposition header, for every browser. */
function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function probeRoutes({ lookup }: AppContext) {
  const app = new Hono<AppEnv>();

  /** What YouTube says about the video of a link (title, channel…), before downloading it. */
  app.post('/', async c => {
    const { url } = await readBody(c, probeSchema);
    const link = videoLink(url);
    return c.json(await lookup.get(link.id, link.url));
  });

  return app;
}

export function downloadRoutes(ctx: AppContext) {
  const { db, media, lookup, queue } = ctx;
  const app = new Hono<AppEnv>();

  const withProgress = (row: Parameters<typeof toDownload>[0]) => toDownload(row, queue.progress(row.id));

  app.get('/', c => c.json(listDownloads(db).map(withProgress)));

  app.get('/last-choices', c => c.json(lastChoices(db, userId(c))));

  app.post('/', async c => {
    const input = await readBody(c, createDownloadSchema);
    const link = videoLink(input.url);
    if (!media.isFolder(input.folder)) throw new HttpError(404, 'FOLDER_NOT_FOUND');
    const info: VideoInfo = await lookup.get(link.id, link.url);
    const filePath = downloadPath({
      folder: input.folder,
      channelFolder: input.channelFolder ? info.channelFolder : null,
      title: info.title,
      kind: input.kind,
    });
    if (activeForFile(db, filePath)) throw new HttpError(409, 'ALREADY_QUEUED', filePath);
    if (!input.overwrite && media.exists(filePath)) throw new HttpError(409, 'FILE_EXISTS', filePath);
    const id = insertDownload(db, {
      userId: userId(c),
      info,
      kind: input.kind,
      folder: input.folder,
      filePath,
      overwrite: input.overwrite ?? false,
    });
    queue.pump();
    return c.json(withProgress(requireDownload(db, id)), 201);
  });

  /** Stops a download, or takes it out of the queue. */
  app.post('/:id/cancel', async c => {
    const id = idParam(c);
    const row = requireDownload(db, id);
    if (row.status === 'queued') markCanceled(db, id);
    else if (row.status === 'running' && !(await queue.cancel(id))) markCanceled(db, id);
    return c.json(withProgress(requireDownload(db, id)));
  });

  /** Tries a failed or stopped download again. */
  app.post('/:id/retry', c => {
    const id = idParam(c);
    const row = requireDownload(db, id);
    if (row.status === 'failed' || row.status === 'canceled') {
      if (activeForFile(db, row.file_path)) throw new HttpError(409, 'ALREADY_QUEUED', row.file_path);
      requeue(db, id);
      queue.pump();
    }
    return c.json(withProgress(requireDownload(db, id)));
  });

  /** Removes finished downloads from the list; the files stay. */
  app.post('/clear', c => {
    clearFinished(db);
    return c.body(null, 204);
  });

  /** Removes a download from the list; the file stays. */
  app.delete('/:id', c => {
    const id = idParam(c);
    const row = requireDownload(db, id);
    if (row.status === 'queued' || row.status === 'running') throw new HttpError(409, 'DOWNLOAD_ACTIVE');
    deleteDownload(db, id);
    return c.body(null, 204);
  });

  /** The downloaded file, to save it on the device. */
  app.get('/:id/file', c => {
    const row = requireDownload(db, idParam(c));
    if (row.status !== 'done') throw notFound();
    const file = media.resolve(row.file_path);
    if (!existsSync(file)) throw notFound();
    const { size } = statSync(file);
    const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        'Content-Type': row.kind === 'music' ? 'audio/mpeg' : 'video/mp4',
        'Content-Length': String(size),
        'Content-Disposition': attachment(path.basename(file)),
      },
    });
  });

  return app;
}
