import { existsSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { HttpError } from './errors.ts';

// YouTube cookies, for when YouTube asks yt-dlp to sign in ("confirm you're
// not a bot"). Someone exports them from a browser as a cookies.txt file
// (the Netscape format yt-dlp reads) and adds them in Settings. They are kept
// in DATA_DIR/cookies.txt, readable by ScrapyTube only, and never sent back.

const HEADER = '# Netscape HTTP Cookie File';

/** How many cookies a cookies.txt has for YouTube (and Google, which signs in to it); null if it isn't one. */
export function checkCookies(text: string): { text: string; youtube: number } | null {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  let youtube = 0;
  let cookies = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    // "#HttpOnly_" lines are cookies; other "#" lines are comments.
    if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('#HttpOnly_'))) continue;
    const fields = line.split('\t');
    if (fields.length !== 7) return null;
    const domain = fields[0]!.replace(/^#HttpOnly_/, '').toLowerCase();
    if (!/^(TRUE|FALSE)$/i.test(fields[1]!) || !/^-?\d+(\.\d+)?$/.test(fields[4]!)) return null;
    cookies++;
    if (/(^|\.)(youtube|google)\.com$/.test(domain)) youtube++;
  }
  if (cookies === 0) return null;
  const body = lines.join('\n').trim();
  // yt-dlp wants the header the browsers' extensions sometimes leave out.
  return { text: `${/^# (Netscape )?HTTP Cookie File/.test(body) ? '' : `${HEADER}\n`}${body}\n`, youtube };
}

export class CookieStore {
  readonly file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'cookies.txt');
  }

  /** The file to give yt-dlp, if cookies were added. */
  get path(): string | null {
    return existsSync(this.file) ? this.file : null;
  }

  status(): { added: boolean; updatedAt: string | null } {
    try {
      return { added: true, updatedAt: statSync(this.file).mtime.toISOString() };
    } catch {
      return { added: false, updatedAt: null };
    }
  }

  /** Keeps a cookies.txt, or refuses one that has no YouTube cookies. */
  save(text: string) {
    const checked = checkCookies(text);
    if (!checked || checked.youtube === 0) throw new HttpError(400, 'INVALID_COOKIES');
    const temp = `${this.file}.new`;
    writeFileSync(temp, checked.text, { mode: 0o600 });
    renameSync(temp, this.file);
  }

  remove() {
    rmSync(this.file, { force: true });
  }
}
