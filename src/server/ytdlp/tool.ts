import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { SystemInfo } from '#shared/types.ts';

import type { Config } from '../config.ts';
import { HttpError } from '../errors.ts';
import type { CommonOptions } from './args.ts';
import { runCommand } from './process.ts';

// yt-dlp itself. YouTube changes often and old copies of yt-dlp stop working,
// so ScrapyTube keeps its own copy in DATA_DIR/bin and updates it (yt-dlp
// updates itself, checking what it downloads). The Docker image ships one,
// installed there on the first start; elsewhere (development) it is
// downloaded from yt-dlp's releases.

const RELEASES = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

/** yt-dlp's standalone build for this computer (it includes Python). */
function releaseAsset(): string | null {
  const key = `${process.platform}-${process.arch}`;
  const assets: Record<string, string> = {
    'linux-x64': 'yt-dlp_linux',
    'linux-arm64': 'yt-dlp_linux_aarch64',
    'darwin-x64': 'yt-dlp_macos',
    'darwin-arm64': 'yt-dlp_macos',
    'win32-x64': 'yt-dlp.exe',
  };
  return assets[key] ?? null;
}

/** Compares yt-dlp versions ("2026.11.23", "2026.11.24.233012"). */
export function compareVersions(a: string, b: string): number {
  const parts = (version: string) => version.split('.').map(part => Number.parseInt(part, 10) || 0);
  const [left, right] = [parts(a), parts(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

/**
 * yt-dlp's update message, without what the person doesn't need:
 * "yt-dlp is up to date (stable@2026.11.23 from yt-dlp/yt-dlp)" → "yt-dlp is up to date".
 */
export function tidyUpdateMessage(line: string): string {
  return line
    .replace(/^ERROR:\s*/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+from yt-dlp\/[\w-]+/g, '')
    .replace(/\b(stable|nightly|master)@/g, '')
    .trim();
}

async function versionOf(file: string): Promise<string | null> {
  const result = await runCommand(file, ['--version'], { timeoutMs: 60_000 });
  const version = result.stdout.trim().split(/\s+/)[0];
  return result.code === 0 && version ? version : null;
}

export class YtDlpTool {
  private readonly config: Config;
  /** The yt-dlp to run; null until found or installed. */
  path: string | null = null;
  version: string | null = null;
  ffmpegVersion: string | null = null;
  readonly managed: boolean;
  private updatePromise: Promise<void> | null = null;
  lastCheckedAt: string | null = null;
  lastCheck: string | null = null;
  /** Called after an update, so waiting downloads can start. */
  onUpdated: () => void = () => {};

  constructor(config: Config) {
    this.config = config;
    this.managed = config.ytDlp.path === null;
  }

  get updating(): boolean {
    return this.updatePromise !== null;
  }

  private get managedPath(): string {
    return path.join(this.config.dataDir, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  }

  /** Options every yt-dlp command line has. */
  commonOptions(): CommonOptions {
    const configFile = path.join(this.config.dataDir, 'yt-dlp.conf');
    return {
      nodePath: process.execPath,
      cacheDir: path.join(this.config.dataDir, 'cache', 'yt-dlp'),
      configFile: existsSync(configFile) ? configFile : null,
      ffmpegPath: this.config.ffmpegPath,
    };
  }

  /** The yt-dlp to run, or a 503 while there is none. */
  require(): string {
    if (!this.path) throw new HttpError(503, 'YTDLP_MISSING');
    return this.path;
  }

  /** Finds yt-dlp, installing ScrapyTube's own copy if needed. */
  async init() {
    this.ffmpegVersion = await this.findFfmpeg();
    if (!this.managed) {
      this.path = this.config.ytDlp.path;
      this.version = await versionOf(this.path!);
      if (!this.version) console.warn(`yt-dlp at ${this.path} doesn't run.`);
      return;
    }
    const file = this.managedPath;
    let version = existsSync(file) ? await versionOf(file) : null;
    const bundled = this.config.ytDlp.bundled;
    const bundledVersion = bundled && existsSync(bundled) ? await versionOf(bundled) : null;
    // A newer image brings a newer yt-dlp than the one kept, if updates are off.
    if (bundled && bundledVersion && (!version || compareVersions(bundledVersion, version) > 0)) {
      this.install(() => copyFileSync(bundled, `${file}.new`));
      version = bundledVersion;
      console.log(`Installed yt-dlp ${version} from the image.`);
    } else if (!version) {
      try {
        await this.download();
        version = await versionOf(file);
        console.log(`Downloaded yt-dlp ${version}.`);
      } catch (error) {
        console.error('yt-dlp could not be downloaded:', error);
      }
    }
    this.path = version ? file : null;
    this.version = version;
  }

  /** Puts a new copy in place: `write` makes `<file>.new`. */
  private install(write: () => void) {
    const file = this.managedPath;
    mkdirSync(path.dirname(file), { recursive: true });
    rmSync(`${file}.new`, { force: true });
    write();
    chmodSync(`${file}.new`, 0o755);
    renameSync(`${file}.new`, file);
  }

  /** Downloads the latest release for this computer, checked against its published checksums. */
  private async download() {
    const asset = releaseAsset();
    if (!asset) throw new Error(`No yt-dlp build for ${process.platform}-${process.arch}: set YTDLP_PATH.`);
    const [binary, sums] = await Promise.all([
      fetch(`${RELEASES}/${asset}`).then(res => {
        if (!res.ok) throw new Error(`Downloading ${asset}: HTTP ${res.status}`);
        return res.arrayBuffer();
      }),
      fetch(`${RELEASES}/SHA2-256SUMS`).then(res => {
        if (!res.ok) throw new Error(`Downloading the checksums: HTTP ${res.status}`);
        return res.text();
      }),
    ]);
    const expected = sums
      .split('\n')
      .map(line => line.trim().split(/\s+/))
      .find(([, name]) => name === asset)?.[0];
    const actual = createHash('sha256').update(Buffer.from(binary)).digest('hex');
    if (!expected || expected !== actual) throw new Error(`${asset} doesn't match its published checksum.`);
    this.install(() => writeFileSync(`${this.managedPath}.new`, Buffer.from(binary)));
  }

  private async findFfmpeg(): Promise<string | null> {
    const result = await runCommand(this.config.ffmpegPath, ['-hide_banner', '-version'], { timeoutMs: 20_000 });
    const match = /ffmpeg version (\S+)/.exec(result.stdout);
    if (result.code !== 0 || !match) {
      console.warn(`ffmpeg was not found (${this.config.ffmpegPath}): videos can't be merged nor music converted.`);
      return null;
    }
    return match[1]!;
  }

  /**
   * Updates ScrapyTube's copy of yt-dlp to the latest release of its channel.
   * Calls made while one runs wait for it.
   */
  update(): Promise<void> {
    if (!this.managed) return Promise.reject(new HttpError(409, 'UPDATE_UNAVAILABLE'));
    this.updatePromise ??= this.runUpdate().finally(() => {
      this.updatePromise = null;
      this.onUpdated();
    });
    return this.updatePromise;
  }

  private async runUpdate() {
    if (!this.path) {
      await this.init();
      this.lastCheckedAt = new Date().toISOString();
      this.lastCheck = this.version ? `Installed yt-dlp ${this.version}` : 'yt-dlp could not be installed.';
      return;
    }
    const result = await runCommand(this.path, ['--update-to', this.config.ytDlp.channel], { timeoutMs: 5 * 60_000 });
    const lines = `${result.stdout}\n${result.stderr}`
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    const said =
      lines.findLast(line => /^ERROR:/.test(line)) ??
      lines.findLast(line => /up to date|updated|updating/i.test(line)) ??
      lines.at(-1) ??
      null;
    this.lastCheckedAt = new Date().toISOString();
    this.lastCheck = said ? tidyUpdateMessage(said) : null;
    this.version = (await versionOf(this.path)) ?? this.version;
    if (result.code !== 0) console.warn(`yt-dlp update failed: ${this.lastCheck}`);
    else console.log(`yt-dlp update: ${this.lastCheck}`);
  }

  status(): SystemInfo['ytDlp'] {
    return {
      version: this.version,
      managed: this.managed,
      channel: this.config.ytDlp.channel,
      updating: this.updating,
      lastCheckedAt: this.lastCheckedAt,
      lastCheck: this.lastCheck,
    };
  }
}
