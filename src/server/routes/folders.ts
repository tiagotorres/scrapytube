import { Hono } from 'hono';

import { createFolderSchema } from '#shared/schemas.ts';
import type { SystemInfo } from '#shared/types.ts';

import type { AppContext, AppEnv } from '../http.ts';
import { readBody } from '../http.ts';

/** The folders of the media folder, to pick where a download goes. */
export function folderRoutes({ media }: AppContext) {
  const app = new Hono<AppEnv>();

  app.get('/', c => c.json(media.list(c.req.query('path') ?? '')));

  app.post('/', async c => {
    const input = await readBody(c, createFolderSchema);
    return c.json(media.createFolder(input.parent, input.name), 201);
  });

  return app;
}

/** The tools ScrapyTube runs (yt-dlp, ffmpeg) and the space left. */
export function systemRoutes({ config, media, ytDlp }: AppContext) {
  const app = new Hono<AppEnv>();

  const info = (): SystemInfo => ({
    version: config.version,
    ytDlp: ytDlp.status(),
    ffmpeg: { version: ytDlp.ffmpegVersion },
    media: media.space(),
    maxConcurrent: config.maxConcurrent,
  });

  app.get('/', c => c.json(info()));

  /** Checks for a new yt-dlp, and installs it. */
  app.post('/update-ytdlp', async c => {
    await ytDlp.update();
    return c.json(info());
  });

  return app;
}
