// Development: runs the API server (port 5011, or API_PORT; restarted when
// its code changes) and the Vite dev server (http://localhost:5173) together.
//
//   yarn dev          both
//   yarn dev:server   only the API server
//   yarn dev:web      only the web app
//
// Data is kept in ./data and downloads in ./media (like the Docker volumes).
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const which = process.argv[2] ?? 'all';
// PORT may be set for the web app by whatever starts this script, so the
// API server gets its own variable.
const apiPort = process.env.API_PORT || '5011';
const children: ChildProcess[] = [];

const run = (args: string[], env: Record<string, string>) =>
  children.push(spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } }));

if (which !== 'web') run(['--watch', 'src/server/main.ts'], { PORT: apiPort });
if (which !== 'server') run([path.join(root, 'node_modules/vite/bin/vite.js')], { API_PORT: apiPort });

const stop = () => {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) {
  child.on('exit', code => {
    stop();
    process.exitCode = code ?? 0;
  });
}
