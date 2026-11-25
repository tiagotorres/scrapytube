// File and folder names in the media folder. Shared by the server (which
// decides where files go) and the web app (which shows where they will go),
// so both always agree.
//
// Names must work on the NAS's disk and through its shares: Windows (SMB)
// refuses some characters and names. Characters it refuses are replaced by
// look-alikes (as yt-dlp does), so "AC/DC: Live" stays readable.

import type { DownloadKind } from './types.ts';
import { FILE_EXTENSIONS } from './types.ts';

const LOOK_ALIKES: Record<string, string> = {
  '/': '⧸',
  '\\': '⧹',
  ':': '：',
  '*': '＊',
  '?': '？',
  '"': '＂',
  '<': '＜',
  '>': '＞',
  '|': '｜',
};

/** Characters a folder name typed by someone can't have. */
export const FORBIDDEN_IN_NAMES = '/ \\ : * ? " < > |';

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
// eslint-disable-next-line no-control-regex
const HAS_CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** Cuts a text to at most `maxBytes` bytes of UTF-8, without breaking a character. */
export function truncateBytes(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  let result = '';
  let size = 0;
  for (const char of text) {
    const length = encoder.encode(char).length;
    if (size + length > maxBytes) break;
    result += char;
    size += length;
  }
  return result;
}

/** Tidies the ends of a name: no spaces, no dots at the end (Windows), no dot at the start (hidden). */
function trimName(name: string): string {
  return name.replace(/^[\s.]+/, '').replace(/[\s.]+$/, '');
}

/**
 * A title or channel name as a file or folder name: forbidden characters
 * replaced, spaces collapsed, at most `maxBytes` long. `fallback` when
 * nothing is left.
 */
export function safeName(text: string, fallback: string, maxBytes = 180): string {
  let name = text
    .normalize('NFC')
    .replace(CONTROL, ' ')
    .replace(/[/\\:*?"<>|]/g, char => LOOK_ALIKES[char] ?? '_')
    .replace(/\s+/g, ' ');
  name = trimName(truncateBytes(trimName(name), maxBytes));
  if (!name) return fallback;
  if (WINDOWS_RESERVED.test(name)) name = `${name}_`;
  return name;
}

/** The channel's folder: its handle without the @, else its name. */
export function channelFolderName(handle: string | null, channel: string | null): string {
  const cleanHandle = handle?.replace(/^@/, '').trim();
  return safeName(cleanHandle || channel || '', 'Unknown channel', 120);
}

/** A file's name for a video: its title, with the kind's extension. */
export function fileName(title: string, kind: DownloadKind): string {
  return `${safeName(title, 'Untitled')}.${FILE_EXTENSIONS[kind]}`;
}

/** Joins folders of the media folder ("" is the media folder itself). */
export function joinPath(...parts: (string | null | undefined)[]): string {
  return parts.filter(part => part).join('/');
}

/** Where a download goes, in the media folder: "abc/handle1/Video.mp4". */
export function downloadPath(options: {
  folder: string;
  channelFolder: string | null;
  title: string;
  kind: DownloadKind;
}): string {
  return joinPath(options.folder, options.channelFolder, fileName(options.title, options.kind));
}

/**
 * A folder name typed by someone, cleaned up; or why it can't be used.
 * Unlike titles, typed names aren't changed behind the person's back.
 */
export function checkFolderName(input: string): { ok: true; name: string } | { ok: false } {
  const name = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name || name === '.' || name === '..') return { ok: false };
  if (/[/\\:*?"<>|]/.test(name) || HAS_CONTROL.test(name)) return { ok: false };
  if (name.startsWith('.') || /[\s.]$/.test(name) || WINDOWS_RESERVED.test(name)) return { ok: false };
  if (new TextEncoder().encode(name).length > 120) return { ok: false };
  return { ok: true, name };
}

/**
 * Checks a path in the media folder sent by the web app: folders joined with
 * "/", none of them empty, "." or "..". Returns its folders, or null.
 */
export function splitMediaPath(path: string): string[] | null {
  if (path === '') return [];
  if (path.length > 2000) return null;
  const parts = path.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0')) return null;
  }
  return parts;
}
