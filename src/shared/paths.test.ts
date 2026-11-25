import { describe, expect, it } from 'vitest';

import { channelFolderName, checkFolderName, downloadPath, safeName, splitMediaPath, truncateBytes } from './paths.ts';

describe('file names from titles', () => {
  it('keeps titles readable, replacing what Windows shares refuse', () => {
    expect(safeName('AC/DC: Live? "Best" <of> *|* \\o/', 'x')).toBe('AC⧸DC： Live？ ＂Best＂ ＜of＞ ＊｜＊ ⧹o⧸');
  });

  it('collapses spaces and drops control characters', () => {
    expect(safeName('  Hello\n\tWorld  \u0007 ', 'x')).toBe('Hello World');
  });

  it('never starts with a dot (hidden) nor ends with one (Windows)', () => {
    expect(safeName('...hidden...', 'x')).toBe('hidden');
    expect(safeName('. . .', 'Untitled')).toBe('Untitled');
  });

  it('avoids names Windows reserves', () => {
    expect(safeName('CON', 'x')).toBe('CON_');
    expect(safeName('Con Air', 'x')).toBe('Con Air');
  });

  it('keeps long names under the limit without breaking a character', () => {
    const name = safeName('é'.repeat(300), 'x');
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(180);
    expect(name).toBe('é'.repeat(90));
    expect(truncateBytes('ab😀', 5)).toBe('ab');
  });
});

describe('where downloads go', () => {
  it('uses the handle without the @ for the channel folder, else the channel name', () => {
    expect(channelFolderName('@handle1', 'Channel One')).toBe('handle1');
    expect(channelFolderName(null, 'Channel: One')).toBe('Channel： One');
    expect(channelFolderName(null, null)).toBe('Unknown channel');
  });

  it('puts the file in the folder, then the channel folder when asked', () => {
    expect(downloadPath({ folder: 'abc', channelFolder: 'handle1', title: 'video1', kind: 'video' })).toBe(
      'abc/handle1/video1.mp4',
    );
    expect(downloadPath({ folder: 'abc', channelFolder: null, title: 'song', kind: 'music' })).toBe('abc/song.mp3');
    expect(downloadPath({ folder: '', channelFolder: null, title: 'song', kind: 'music' })).toBe('song.mp3');
  });
});

describe('folder names typed by people', () => {
  it('accepts ordinary names, tidied', () => {
    expect(checkFolderName('  My   Music ')).toEqual({ ok: true, name: 'My Music' });
    expect(checkFolderName('Vídeos 2026')).toEqual({ ok: true, name: 'Vídeos 2026' });
  });

  it.each(['', '  ', '.', '..', 'a/b', 'a\\b', 'what?', 'x:y', '.hidden', 'end.', 'nul', 'tab\u0001'])('refuses %j', name => {
    expect(checkFolderName(name)).toEqual({ ok: false });
  });

  it('gives the same answer every time (no regex state)', () => {
    expect(checkFolderName('a\u0001b')).toEqual({ ok: false });
    expect(checkFolderName('fine')).toEqual({ ok: true, name: 'fine' });
  });
});

describe('paths sent by the web app', () => {
  it('splits a path into folders', () => {
    expect(splitMediaPath('')).toEqual([]);
    expect(splitMediaPath('abc/def')).toEqual(['abc', 'def']);
  });

  it.each(['../etc', 'abc/../..', '/abs', 'abc//def', 'abc/', 'a\\b', 'a\0b', '.'])('refuses %j', path => {
    expect(splitMediaPath(path)).toBeNull();
  });
});
