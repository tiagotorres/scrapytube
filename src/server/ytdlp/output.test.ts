import { describe, expect, it } from 'vitest';

import { MARKS, downloadArgs, escapeTemplate, probeArgs } from './args.ts';
import { ProgressTracker, errorMessage, isBotCheck, parseLine, toVideoInfo } from './output.ts';
import { compareVersions, tidyUpdateMessage } from './tool.ts';

const OPTIONS = { nodePath: '/usr/bin/node', cacheDir: '/data/cache', configFile: null, cookiesFile: null, ffmpegPath: 'ffmpeg' };

describe('what yt-dlp says about a video', () => {
  it('keeps the title, the channel and its handle', () => {
    const result = toVideoInfo({
      _type: 'video',
      id: 'jNQXAC9IVRw',
      title: 'Me at the zoo',
      channel: 'jawed',
      uploader_id: '@jawed',
      duration: 19,
      upload_date: '20050424',
      thumbnail: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg',
      live_status: 'not_live',
    });
    expect(result).toEqual({
      ok: true,
      info: {
        id: 'jNQXAC9IVRw',
        url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        title: 'Me at the zoo',
        channel: 'jawed',
        handle: 'jawed',
        channelFolder: 'jawed',
        duration: 19,
        uploadDate: '2005-04-24',
        thumbnail: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg',
      },
    });
  });

  it('finds the handle in the channel’s address when the uploader id is not one', () => {
    const result = toVideoInfo({ id: 'abcdefghijk', uploader_id: 'UC123', uploader_url: 'https://www.youtube.com/@Some%C3%A9' });
    expect(result.ok && result.info.handle).toBe('Someé');
  });

  it('refuses live streams', () => {
    expect(toVideoInfo({ id: 'abcdefghijk', live_status: 'is_live' })).toEqual({ ok: false, reason: 'LIVE_NOT_SUPPORTED' });
    expect(toVideoInfo({ id: 'abcdefghijk', live_status: 'is_upcoming' })).toEqual({ ok: false, reason: 'LIVE_NOT_SUPPORTED' });
  });

  it('tells YouTube’s bot check from other errors', () => {
    const message = errorMessage(
      'ERROR: [youtube] dQw4w9WgXcQ: Sign in to confirm you’re not a bot. This helps protect our community. Use --cookies-from-browser or --cookies for the authentication.',
    )!;
    expect(isBotCheck(message)).toBe(true);
    expect(isBotCheck("Sign in to confirm you're not a bot")).toBe(true);
    expect(isBotCheck('Sign in to confirm your age')).toBe(false);
  });

  it('reads the last error', () => {
    expect(errorMessage('WARNING: x\nERROR: [youtube] dQw4w9WgXcQ: Video unavailable. This video is private\n')).toBe(
      'Video unavailable. This video is private',
    );
    expect(errorMessage('all good')).toBeNull();
  });
});

describe('the lookup command', () => {
  it('asks only for the fields ScrapyTube reads, as one line of JSON', () => {
    const args = probeArgs(OPTIONS, 'https://www.youtube.com/watch?v=Jatwf_XOncE');
    const template = args[args.indexOf('--print') + 1];
    expect(template).toBe(
      '%(.{id,title,channel,uploader,uploader_id,uploader_url,channel_url,duration,upload_date,thumbnail,live_status,is_live,_type})j',
    );
    expect(args).not.toContain('--dump-single-json');
    expect(args.slice(-2)).toEqual(['--', 'https://www.youtube.com/watch?v=Jatwf_XOncE']);
  });
});

describe('the download command', () => {
  it('asks for H.264 up to 1080p in an MP4, in its own temporary folder', () => {
    const args = downloadArgs(OPTIONS, {
      url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      kind: 'video',
      folder: '/media/abc/jawed',
      tempFolder: '/data/tmp/1',
      baseName: '100% zoo',
      overwrite: false,
    });
    const joined = args.join(' ');
    expect(joined).toContain('-S vcodec:h264,res,acodec:m4a');
    expect(joined).toContain('--merge-output-format mp4');
    expect(joined).toContain('-P home:/media/abc/jawed -P temp:/data/tmp/1 -o 100%% zoo.%(ext)s');
    expect(joined).toContain('--js-runtimes node:/usr/bin/node');
    expect(args).not.toContain('--force-overwrites');
    expect(args.slice(-2)).toEqual(['--', 'https://www.youtube.com/watch?v=jNQXAC9IVRw']);
  });

  it('makes an MP3 with its cover for music', () => {
    const args = downloadArgs(OPTIONS, {
      url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      kind: 'music',
      folder: '/media/music',
      tempFolder: '/data/tmp/2',
      baseName: 'zoo',
      overwrite: true,
    });
    expect(args.join(' ')).toContain('--extract-audio --audio-format mp3 --audio-quality 0');
    expect(args).toContain('--embed-thumbnail');
    expect(args).toContain('--force-overwrites');
  });

  it('gives yt-dlp the cookies when there are some', () => {
    const args = downloadArgs(
      { ...OPTIONS, cookiesFile: '/data/tmp/3/cookies.txt' },
      { url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', kind: 'video', folder: '/m', tempFolder: '/data/tmp/3', baseName: 'x', overwrite: false },
    );
    expect(args.join(' ')).toContain('--cookies /data/tmp/3/cookies.txt');
    expect(downloadArgs(OPTIONS, { url: 'u', kind: 'video', folder: '/m', tempFolder: '/t', baseName: 'x', overwrite: false })).not.toContain(
      '--cookies',
    );
  });

  it('escapes % in names', () => {
    expect(escapeTemplate('100% %(title)s')).toBe('100%% %%(title)s');
  });
});

describe('following a download', () => {
  const progress = (file: string, downloaded: number, total: number, status = 'downloading') =>
    `${MARKS.progress} ${JSON.stringify({ status, filename: file, downloaded_bytes: downloaded, total_bytes: total, speed: 1000, eta: 5 })}`;

  it('counts the picture and the sound of a video together', () => {
    const tracker = new ProgressTracker();
    const feed = (line: string) => tracker.apply(parseLine(line)!);
    feed(`${MARKS.format} 137+140 1000`);
    expect(tracker.snapshot()).toEqual({ phase: 'starting', fraction: 0, speed: null, eta: null });

    feed(progress('v.f137.mp4', 400, 900));
    expect(tracker.snapshot()).toMatchObject({ phase: 'downloading', fraction: 0.4, speed: 1000, eta: 5 });
    feed(progress('v.f137.mp4', 900, 900, 'finished'));
    feed(progress('v.f140.m4a', 50, 100));
    expect(tracker.snapshot().fraction).toBeCloseTo(0.95);

    feed(progress('v.f140.m4a', 100, 100, 'finished'));
    feed(`${MARKS.postprocess} started Merger`);
    expect(tracker.snapshot()).toEqual({ phase: 'processing', fraction: 1, speed: null, eta: null });

    feed(`${MARKS.file} /media/abc/v.mp4`);
    expect(tracker.finalPath).toBe('/media/abc/v.mp4');
  });

  it('does not take converting the cover before the download for the end', () => {
    const tracker = new ProgressTracker();
    tracker.apply(parseLine(`${MARKS.postprocess} started ThumbnailsConvertor`)!);
    expect(tracker.snapshot().phase).toBe('starting');
  });

  it('ignores other lines', () => {
    expect(parseLine('[download] Destination: x')).toBeNull();
    expect(parseLine(`${MARKS.progress} {not json`)).toBeNull();
  });
});

describe('yt-dlp versions', () => {
  it('tidies what an update says', () => {
    expect(tidyUpdateMessage('yt-dlp is up to date (stable@2026.11.23 from yt-dlp/yt-dlp)')).toBe('yt-dlp is up to date');
    expect(tidyUpdateMessage('Updated yt-dlp to stable@2026.11.24 from yt-dlp/yt-dlp')).toBe('Updated yt-dlp to 2026.11.24');
    expect(tidyUpdateMessage('ERROR: Unable to write to /data/bin/yt-dlp')).toBe('Unable to write to /data/bin/yt-dlp');
  });

  it('compares dates, nightly builds included', () => {
    expect(compareVersions('2026.11.23', '2026.11.3')).toBe(1);
    expect(compareVersions('2026.11.23', '2026.11.23.120000')).toBe(-1);
    expect(compareVersions('2026.11.23', '2026.11.23')).toBe(0);
  });
});
