import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, statfsSync } from 'node:fs';
import path from 'node:path';

import { checkFolderName, joinPath, splitMediaPath } from '#shared/paths.ts';
import type { Folder, FolderListing } from '#shared/types.ts';

import { HttpError, badRequest } from './errors.ts';

// The media folder (a Docker volume): everything ScrapyTube saves is in it,
// and nothing outside it is ever read or written. Paths from the web app are
// relative to it, with "/" between folders.

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Folders the NAS keeps for itself (Synology, QNAP, Linux): not shown. */
const SYSTEM_FOLDERS = new Set(['@eaDir', '#recycle', '#snapshot', '@Recycle', '@Recently-Snapshot', 'lost+found']);

export class MediaFolder {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Creates the media folder if needed (development; in Docker it's the volume). */
  ensureRoot() {
    mkdirSync(this.root, { recursive: true });
  }

  /**
   * The absolute path of a path in the media folder, refusing anything that
   * leads out of it, through ".." or through a link to elsewhere.
   */
  resolve(relative: string): string {
    const parts = splitMediaPath(relative);
    if (!parts) throw badRequest('Not a folder of the media folder.');
    const absolute = path.join(this.root, ...parts);
    // The deepest part that exists must really be inside (links are followed).
    let existing = absolute;
    while (!existsSync(existing) && existing !== this.root) existing = path.dirname(existing);
    if (existsSync(existing)) {
      const real = realpathSync(existing);
      const realRoot = realpathSync(this.root);
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw badRequest('Not a folder of the media folder.');
    }
    return absolute;
  }

  isFolder(relative: string): boolean {
    try {
      return statSync(this.resolve(relative)).isDirectory();
    } catch (error) {
      if (error instanceof HttpError) throw error;
      return false;
    }
  }

  exists(relative: string): boolean {
    return existsSync(this.resolve(relative));
  }

  /** The folders in a folder, by name (hidden ones left out). */
  list(relative: string): FolderListing {
    const parts = splitMediaPath(relative);
    if (!parts) throw badRequest('Not a folder of the media folder.');
    if (!this.isFolder(relative)) throw new HttpError(404, 'FOLDER_NOT_FOUND');
    const absolute = this.resolve(relative);
    const folders: Folder[] = [];
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SYSTEM_FOLDERS.has(entry.name)) continue;
      const child = joinPath(relative, entry.name);
      let isFolder = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          isFolder = this.isFolder(child);
        } catch {
          isFolder = false; // A link to outside the media folder.
        }
      }
      if (isFolder) folders.push({ name: entry.name, path: child });
    }
    folders.sort((a, b) => collator.compare(a.name, b.name));
    return {
      path: parts.join('/'),
      parents: parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join('/') })),
      folders,
    };
  }

  /** Makes a folder in `parent`. */
  createFolder(parent: string, name: string): Folder {
    const checked = checkFolderName(name);
    if (!checked.ok) throw new HttpError(400, 'INVALID_FOLDER_NAME');
    if (!this.isFolder(parent)) throw new HttpError(404, 'FOLDER_NOT_FOUND');
    const relative = joinPath(parent, checked.name);
    const absolute = this.resolve(relative);
    // Names that differ only by case are the same folder on many NAS shares.
    const lower = checked.name.toLowerCase();
    const taken = readdirSync(this.resolve(parent)).some(existing => existing.normalize('NFC').toLowerCase() === lower);
    if (taken || existsSync(absolute)) throw new HttpError(409, 'FOLDER_EXISTS');
    mkdirSync(absolute);
    return { name: checked.name, path: relative };
  }

  /** Free and total space on the media folder's disk. */
  space(): { free: number | null; total: number | null } {
    try {
      const stats = statfsSync(this.root);
      return { free: stats.bavail * stats.bsize, total: stats.blocks * stats.bsize };
    } catch {
      return { free: null, total: null };
    }
  }
}
