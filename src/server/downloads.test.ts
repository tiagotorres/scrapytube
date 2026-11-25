import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Download } from '#shared/types.ts';

import type { Runner } from './queue.ts';
import { HttpError } from './errors.ts';
import { MARKS } from './ytdlp/args.ts';
import * as helpers from './test-helpers.ts';
import { tick, videoInfo } from './test-helpers.ts';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function setUpApp(options: helpers.TestOptions = {}) {
  const test = await helpers.setUpApp(options);
  cleanups.push(test.cleanup);
  return test;
}

const arg = (args: string[], flag: string, prefix = '') =>
  args.filter((_, index) => args[index - 1] === flag).find(value => value.startsWith(prefix))!;

/** A yt-dlp that writes the file it is asked for (or fails), as the real one says it does. */
function fakeYtDlp(behaviour: { fail?: string } = {}): { runner: Runner; calls: string[][] } {
  const calls: string[][] = [];
  const runner: Runner = async (args, { onLine }) => {
    calls.push(args);
    if (behaviour.fail) return { code: 1, stdout: '', stderr: `ERROR: [youtube] abcdefghijk: ${behaviour.fail}\n`, stopped: false };
    const home = arg(args, '-P', 'home:').slice('home:'.length);
    const kind = args.includes('--extract-audio') ? 'mp3' : 'mp4';
    const file = path.join(home, arg(args, '-o').replace('%(ext)s', kind).replaceAll('%%', '%'));
    onLine?.(`${MARKS.format} 137+140 1000`, 'stdout');
    onLine?.(`${MARKS.progress} {"status":"finished","filename":"x","downloaded_bytes":1000,"total_bytes":1000}`, 'stdout');
    writeFileSync(file, 'video bytes');
    onLine?.(`${MARKS.file} ${file}`, 'stdout');
    return { code: 0, stdout: '', stderr: '', stopped: false };
  };
  return { runner, calls };
}

/** Waits until a download is in one of these states. */
async function waitFor(client: helpers.TestClient, id: number, statuses: string[]): Promise<Download> {
  for (let i = 0; i < 200; i++) {
    const list = (await client.get<Download[]>('/api/downloads')).body;
    const download = list.find(item => item.id === id);
    if (download && statuses.includes(download.status)) return download;
    await tick();
  }
  throw new Error(`Download ${id} never became ${statuses.join(' or ')}`);
}

const LINK = 'https://youtu.be/abcdefghijk?si=shared';

describe('looking up a video', () => {
  it('answers what YouTube says about the link', async () => {
    const { client } = await setUpApp();
    const res = await client.post('/api/probe', { url: LINK });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'abcdefghijk', title: 'Video abcdefghijk', channelFolder: 'handle1' });
  });

  it('refuses playlists and other sites before asking yt-dlp', async () => {
    const asked: string[] = [];
    const { client } = await setUpApp({ fetchInfo: async url => (asked.push(url), videoInfo('abcdefghijk')) });
    expect((await client.post('/api/probe', { url: 'https://www.youtube.com/playlist?list=PL1234' })).body.error).toBe(
      'PLAYLIST_LINK',
    );
    expect((await client.post('/api/probe', { url: 'https://example.com/video' })).body.error).toBe('NOT_A_VIDEO_LINK');
    expect(asked).toEqual([]);
  });

  it('asks yt-dlp once for the same video', async () => {
    let asked = 0;
    const { client } = await setUpApp({ fetchInfo: async () => (asked++, videoInfo('abcdefghijk')) });
    await Promise.all([client.post('/api/probe', { url: LINK }), client.post('/api/probe', { url: LINK })]);
    await client.post('/api/probe', { url: `https://www.youtube.com/watch?v=abcdefghijk` });
    expect(asked).toBe(1);
  });
});

describe('downloading', () => {
  it('saves a video in the folder, in the channel’s folder', async () => {
    const yt = fakeYtDlp();
    const { client, mediaDir } = await setUpApp({ runner: yt.runner });
    mkdirSync(path.join(mediaDir, 'abc'));

    const res = await client.post<Download>('/api/downloads', { url: LINK, kind: 'video', folder: 'abc', channelFolder: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ filePath: 'abc/handle1/Video abcdefghijk.mp4', user: { name: 'Tiago' } });

    const done = await waitFor(client, res.body.id, ['done', 'failed']);
    expect(done).toMatchObject({ status: 'done', size: 11, error: null });
    expect(readFileSync(path.join(mediaDir, 'abc/handle1/Video abcdefghijk.mp4'), 'utf8')).toBe('video bytes');
    expect(yt.calls[0]).toContain('vcodec:h264,res,acodec:m4a');
  });

  it('saves music straight in the folder unless asked otherwise', async () => {
    const { client, mediaDir } = await setUpApp({ runner: fakeYtDlp().runner });
    const res = await client.post<Download>('/api/downloads', { url: LINK, kind: 'music', folder: '', channelFolder: false });
    expect(res.body.filePath).toBe('Video abcdefghijk.mp3');
    await waitFor(client, res.body.id, ['done']);
    expect(existsSync(path.join(mediaDir, 'Video abcdefghijk.mp3'))).toBe(true);
  });

  it('remembers the folder each person last used for each kind', async () => {
    const { client, mediaDir, addUser } = await setUpApp({ runner: fakeYtDlp().runner });
    mkdirSync(path.join(mediaDir, 'videos'));
    mkdirSync(path.join(mediaDir, 'music'));
    await client.post('/api/downloads', { url: LINK, kind: 'video', folder: 'videos', channelFolder: true });
    await client.post('/api/downloads', { url: 'https://youtu.be/bbbbbbbbbbb', kind: 'music', folder: 'music', channelFolder: false });
    expect((await client.get('/api/downloads/last-choices')).body).toEqual({ video: { folder: 'videos' }, music: { folder: 'music' } });
    const ana = await addUser('ana');
    expect((await ana.get('/api/downloads/last-choices')).body).toEqual({ video: null, music: null });
  });

  it('says why yt-dlp failed, and tries again when asked', async () => {
    const { client } = await setUpApp({ runner: fakeYtDlp({ fail: 'Video unavailable' }).runner });
    const res = await client.post<Download>('/api/downloads', { url: LINK, kind: 'video', folder: '', channelFolder: false });
    const failed = await waitFor(client, res.body.id, ['failed']);
    expect(failed.error).toBe('Video unavailable');

    const again = await client.post<Download>(`/api/downloads/${res.body.id}/retry`);
    expect(['queued', 'running', 'failed']).toContain(again.body.status);
    await waitFor(client, res.body.id, ['failed']);
  });

  it('asks before replacing a file, and replaces it when told to', async () => {
    const yt = fakeYtDlp();
    const { client, mediaDir } = await setUpApp({ runner: yt.runner });
    writeFileSync(path.join(mediaDir, 'Video abcdefghijk.mp4'), 'old');
    const input = { url: LINK, kind: 'video', folder: '', channelFolder: false };

    const refused = await client.post('/api/downloads', input);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: 'FILE_EXISTS', message: 'Video abcdefghijk.mp4' });

    const res = await client.post<Download>('/api/downloads', { ...input, overwrite: true });
    await waitFor(client, res.body.id, ['done']);
    expect(readFileSync(path.join(mediaDir, 'Video abcdefghijk.mp4'), 'utf8')).toBe('video bytes');
    expect(yt.calls[0]).toContain('--force-overwrites');
  });

  it('refuses the same file twice while it is downloading', async () => {
    const { client } = await setUpApp(); // yt-dlp never finishes
    const input = { url: LINK, kind: 'video', folder: '', channelFolder: false };
    expect((await client.post('/api/downloads', input)).status).toBe(201);
    expect((await client.post('/api/downloads', input)).body.error).toBe('ALREADY_QUEUED');
  });

  it('runs a few at a time, and stops one when canceled', async () => {
    const { client } = await setUpApp({ maxConcurrent: 1 });
    const first = await client.post<Download>('/api/downloads', { url: LINK, kind: 'video', folder: '', channelFolder: false });
    const second = await client.post<Download>('/api/downloads', {
      url: 'https://youtu.be/bbbbbbbbbbb',
      kind: 'video',
      folder: '',
      channelFolder: false,
    });
    expect((await waitFor(client, first.body.id, ['running'])).progress).toMatchObject({ phase: 'starting' });
    expect((await waitFor(client, second.body.id, ['queued'])).status).toBe('queued');

    expect((await client.post<Download>(`/api/downloads/${first.body.id}/cancel`)).body.status).toBe('canceled');
    await waitFor(client, second.body.id, ['running']);

    // Only finished downloads leave the list.
    expect((await client.delete(`/api/downloads/${second.body.id}`)).body.error).toBe('DOWNLOAD_ACTIVE');
    expect((await client.delete(`/api/downloads/${first.body.id}`)).status).toBe(204);
  });

  it('needs the folder to exist', async () => {
    const { client } = await setUpApp();
    const res = await client.post('/api/downloads', { url: LINK, kind: 'video', folder: 'nope', channelFolder: false });
    expect(res.body.error).toBe('FOLDER_NOT_FOUND');
  });

  it('sends the finished file to save on the device', async () => {
    const { app, client } = await setUpApp({ runner: fakeYtDlp().runner });
    const res = await client.post<Download>('/api/downloads', { url: LINK, kind: 'music', folder: '', channelFolder: false });
    await waitFor(client, res.body.id, ['done']);
    const file = await app.request(`/api/downloads/${res.body.id}/file`, { headers: { cookie: client.cookie } });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('audio/mpeg');
    expect(file.headers.get('content-disposition')).toContain("filename*=UTF-8''Video%20abcdefghijk.mp3");
    expect(await file.text()).toBe('video bytes');
  });
});

describe('folders', () => {
  it('lists folders by name, hiding hidden and NAS folders', async () => {
    const { client, mediaDir } = await setUpApp();
    for (const name of ['abc/def', 'Music', 'video 10', 'video 9', '.hidden', '@eaDir', '#recycle']) {
      mkdirSync(path.join(mediaDir, name), { recursive: true });
    }
    writeFileSync(path.join(mediaDir, 'file.mp4'), '');
    const root = await client.get('/api/folders');
    expect(root.body.folders.map((folder: { name: string }) => folder.name)).toEqual(['abc', 'Music', 'video 9', 'video 10']);

    const inside = await client.get('/api/folders?path=abc');
    expect(inside.body).toEqual({
      path: 'abc',
      parents: [{ name: 'abc', path: 'abc' }],
      folders: [{ name: 'def', path: 'abc/def' }],
    });
  });

  it('creates folders, once, with names that work on the shares', async () => {
    const { client, mediaDir } = await setUpApp();
    const res = await client.post('/api/folders', { parent: '', name: '  New   one ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ name: 'New one', path: 'New one' });
    expect(existsSync(path.join(mediaDir, 'New one'))).toBe(true);

    expect((await client.post('/api/folders', { parent: '', name: 'NEW ONE' })).body.error).toBe('FOLDER_EXISTS');
    expect((await client.post('/api/folders', { parent: '', name: 'a/b' })).body.error).toBe('INVALID_FOLDER_NAME');
    expect((await client.post('/api/folders', { parent: 'missing', name: 'x' })).body.error).toBe('FOLDER_NOT_FOUND');
    expect((await client.post('/api/folders', { parent: 'New one', name: 'Inside' })).body.path).toBe('New one/Inside');
  });

  it('never leads out of the media folder', async () => {
    const { client, mediaDir, dataDir } = await setUpApp();
    symlinkSync(dataDir, path.join(mediaDir, 'escape'));
    expect((await client.get('/api/folders?path=..')).status).toBe(400);
    expect((await client.get('/api/folders?path=escape')).status).toBe(400);
    expect((await client.get('/api/folders')).body.folders).toEqual([]);
    expect((await client.post('/api/folders', { parent: '../', name: 'x' })).status).toBe(400);
    expect(
      (await client.post('/api/downloads', { url: LINK, kind: 'video', folder: 'escape', channelFolder: false })).status,
    ).toBe(400);
  });
});

const COOKIES = ['# Netscape HTTP Cookie File', ['.youtube.com', 'TRUE', '/', 'TRUE', '1798761600', 'SID', 'secret'].join('\t')].join('\n');

describe('YouTube cookies', () => {
  it('are added, used by each download through a copy of their own, and removed', async () => {
    const yt = fakeYtDlp();
    let copy = '';
    const runner: Runner = async (args, options) => {
      copy = args[args.indexOf('--cookies') + 1] ?? '';
      expect(readFileSync(copy, 'utf8')).toContain('secret');
      return yt.runner(args, options);
    };
    const { client, dataDir } = await setUpApp({ runner });
    expect((await client.get('/api/system')).body.cookies).toEqual({ added: false, updatedAt: null });

    const added = await client.put('/api/system/cookies', { text: COOKIES });
    expect(added.status).toBe(200);
    expect(added.body.cookies.added).toBe(true);
    expect(JSON.stringify(added.body)).not.toContain('secret');
    expect(statSync(path.join(dataDir, 'cookies.txt')).mode & 0o777).toBe(0o600);

    const res = await client.post<Download>('/api/downloads', { url: LINK, kind: 'music', folder: '', channelFolder: false });
    await waitFor(client, res.body.id, ['done']);
    expect(copy).toBe(path.join(dataDir, 'tmp', String(res.body.id), 'cookies.txt'));
    expect(existsSync(copy)).toBe(false); // Gone with the download's temporary folder.

    expect((await client.delete('/api/system/cookies')).body.cookies.added).toBe(false);
    expect(existsSync(path.join(dataDir, 'cookies.txt'))).toBe(false);
  });

  it('refuses a file without YouTube cookies', async () => {
    const { client } = await setUpApp();
    expect((await client.put('/api/system/cookies', { text: '{"cookies": []}' })).body.error).toBe('INVALID_COOKIES');
    const google = COOKIES.replace('.youtube.com', '.example.com');
    expect((await client.put('/api/system/cookies', { text: google })).body.error).toBe('INVALID_COOKIES');
  });

  it('accept a whole browser export (over the usual size limit)', async () => {
    const { client } = await setUpApp();
    const big = `${COOKIES}\n${Array.from({ length: 3000 }, (_, i) => ['.example.com', 'TRUE', '/', 'FALSE', '0', `c${i}`, 'x'.repeat(20)].join('\t')).join('\n')}`;
    expect(big.length).toBeGreaterThan(64 * 1024);
    expect((await client.put('/api/system/cookies', { text: big })).status).toBe(200);
  });

  it('passes YouTube’s bot check on as its own error', async () => {
    const { client } = await setUpApp({
      fetchInfo: async () => {
        throw new HttpError(422, 'YOUTUBE_BOT_CHECK', 'Sign in to confirm you’re not a bot.');
      },
    });
    const res = await client.post('/api/probe', { url: LINK });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('YOUTUBE_BOT_CHECK');
  });
});

describe('system', () => {
  it('tells the versions and the space left', async () => {
    const { client } = await setUpApp();
    const res = await client.get('/api/system');
    expect(res.body).toMatchObject({ version: 'test', ytDlp: { managed: false, channel: 'stable' }, maxConcurrent: 2 });
    expect(res.body.media.free).toBeGreaterThan(0);
    expect((await client.post('/api/system/update-ytdlp')).body.error).toBe('UPDATE_UNAVAILABLE');
  });
});
