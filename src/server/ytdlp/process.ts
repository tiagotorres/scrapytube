import { spawn } from 'node:child_process';

// Running yt-dlp (and ffmpeg) as child processes.

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** Stopped because it took too long, or was aborted. */
  stopped: boolean;
}

/** Keeps the end of a long output (yt-dlp's last lines say what went wrong). */
function keepTail(text: string, max: number): string {
  return text.length > max ? text.slice(-max) : text;
}

export interface RunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called with each complete line, as it comes. */
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
  env?: NodeJS.ProcessEnv;
  /**
   * How much of each output to keep (its end), in characters. Downloads print
   * progress for as long as they run; a command whose whole answer is needed
   * must fit in it.
   */
  maxOutput?: number;
}

/**
 * Runs a command to its end. It runs in its own process group, so stopping
 * it also stops what it started (yt-dlp runs ffmpeg).
 */
export function runCommand(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  const maxOutput = options.maxOutput ?? 200_000;
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let stopped = false;
    let child;
    try {
      child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        env: { ...process.env, PYTHONUNBUFFERED: '1', ...options.env },
      });
    } catch (error) {
      resolve({ code: null, stdout: '', stderr: String(error), stopped: false });
      return;
    }

    const kill = (signal: NodeJS.Signals) => {
      if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        // Already gone.
      }
    };
    const stop = () => {
      stopped = true;
      kill('SIGTERM');
      setTimeout(() => kill('SIGKILL'), 5000).unref();
    };

    const timer = options.timeoutMs ? setTimeout(stop, options.timeoutMs) : undefined;
    if (options.signal?.aborted) stop();
    options.signal?.addEventListener('abort', stop, { once: true });

    const lines = (stream: 'stdout' | 'stderr') => {
      let pending = '';
      return (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        if (stream === 'stdout') stdout = keepTail(stdout + text, maxOutput);
        else stderr = keepTail(stderr + text, maxOutput);
        if (!options.onLine) return;
        pending += text;
        const parts = pending.split(/\r?\n|\r/);
        pending = parts.pop() ?? '';
        for (const line of parts) if (line) options.onLine(line, stream);
      };
    };
    child.stdout.on('data', lines('stdout'));
    child.stderr.on('data', lines('stderr'));

    child.on('error', error => {
      stderr += `\n${error.message}`;
    });
    child.on('close', code => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', stop);
      resolve({ code, stdout, stderr, stopped });
    });
  });
}
