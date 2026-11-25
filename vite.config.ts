/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import react from '@vitejs/plugin-react';
import ts from 'typescript';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

// In development the web app runs on Vite (port 5173) and sends API calls to
// the server (port 5012, or API_PORT; `yarn dev` starts both).
const serverUrl = `http://localhost:${process.env.API_PORT || 5012}`;

/**
 * Writes Brotli and gzip copies of the built files, so the server can send
 * them compressed without spending CPU on every request (the NAS is often
 * reached directly, without a proxy that would compress).
 */
function precompress(): Plugin {
  return {
    name: 'scrapytube-precompress',
    apply: 'build',
    writeBundle(options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (!/\.(js|css|html|svg|json)$/.test(fileName)) continue;
        const file = path.join(options.dir!, fileName);
        const data = readFileSync(file);
        if (data.length < 1024) continue;
        writeFileSync(`${file}.br`, brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
        writeFileSync(`${file}.gz`, gzipSync(data, { level: 9 }));
      }
    },
  };
}

/** Every file in a folder, relative to it, with "/" separators. */
function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

/**
 * Builds the service worker (src/client/sw.ts) into sw.js, with the list of
 * built files it saves for offline use put in front of it. Runs last, once
 * everything it lists is in the output folder.
 */
function serviceWorker(): Plugin {
  return {
    name: 'scrapytube-service-worker',
    apply: 'build',
    enforce: 'post',
    writeBundle: {
      order: 'post',
      handler(options) {
        const outDir = options.dir!;
        const files = listFiles(outDir).filter(file => !/\.(br|gz|map)$/.test(file) && file !== 'sw.js');
        // The server answers "/" with index.html: that is the page the worker keeps.
        const precache = files.map(file => (file === 'index.html' ? '/' : `/${file}`)).sort();
        const hash = createHash('sha256');
        for (const file of files.sort()) hash.update(file).update(readFileSync(path.join(outDir, file)));

        const source = readFileSync(new URL('./src/client/sw.ts', import.meta.url), 'utf8');
        const code = ts.transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, removeComments: false },
        }).outputText;
        writeFileSync(
          path.join(outDir, 'sw.js'),
          `const __PRECACHE__ = ${JSON.stringify(precache)};\nconst __VERSION__ = ${JSON.stringify(`${version}-${hash.digest('hex').slice(0, 12)}`)};\n${code}`,
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), precompress(), serviceWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src/client', import.meta.url)) },
  },
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(version),
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: { '/api': serverUrl },
  },
  preview: {
    port: 5173,
    proxy: { '/api': serverUrl },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/server/**/*.test.ts', 'src/shared/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/client/**/*.test.{ts,tsx}'],
          setupFiles: ['src/client/test/setup.ts'],
        },
      },
    ],
  },
});
