import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';

import type { Config } from './config.ts';
import type { Database } from './db.ts';
import { HttpError, badRequest, notFound } from './errors.ts';
import type { MediaFolder } from './media.ts';
import type { DownloadQueue } from './queue.ts';
import { SESSION_COOKIE, createSession } from './sessions.ts';
import type { VideoLookup } from './ytdlp/probe.ts';
import type { YtDlpTool } from './ytdlp/tool.ts';

export interface AppContext {
  db: Database;
  config: Config;
  media: MediaFolder;
  ytDlp: YtDlpTool;
  lookup: VideoLookup;
  queue: DownloadQueue;
}

export interface AppEnv {
  Variables: {
    /** The signed-in session, if any (always set past the auth check). */
    session: { id: string; userId: number; renewed: boolean } | undefined;
  };
}

export type Ctx = Context<AppEnv>;

/** The signed-in user's id (routes behind the auth check). */
export function userId(c: Ctx): number {
  const session = c.get('session');
  if (!session) throw new HttpError(401, 'UNAUTHORIZED');
  return session.userId;
}

export function sessionId(c: Ctx): string {
  const session = c.get('session');
  if (!session) throw new HttpError(401, 'UNAUTHORIZED');
  return session.id;
}

/** Parses and validates the JSON body. */
export async function readBody<S extends z.ZodType>(c: Ctx, schema: S): Promise<z.output<S>> {
  if (!c.req.header('content-type')?.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw badRequest('The body is not valid JSON.');
  }
  const result = schema.safeParse(json);
  if (!result.success) throw badRequest(z.prettifyError(result.error));
  return result.data;
}

export function idParam(c: Ctx, name = 'id'): number {
  const value = Number(c.req.param(name));
  if (!Number.isInteger(value) || value <= 0) throw notFound();
  return value;
}

function isHttps(c: Ctx): boolean {
  return (
    new URL(c.req.url).protocol === 'https:' ||
    c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() === 'https'
  );
}

/** Sets (or renews) the session cookie, valid for `days`. */
export function setSessionCookie(c: Ctx, token: string, days: number) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    // Only over HTTPS: on a plain-HTTP LAN address the browser would drop it.
    secure: isHttps(c),
    maxAge: days * 86_400,
  });
}

/** Starts a session for the user and sets its cookie. */
export function signIn(c: Ctx, { db, config }: AppContext, userId: number) {
  const { token } = createSession(db, userId, config.sessionDays, c.req.header('user-agent'));
  setSessionCookie(c, token, config.sessionDays);
}

const PRIVATE_ADDRESS =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;

/**
 * The client's address. Behind a reverse proxy on the NAS (a private address),
 * the last X-Forwarded-For entry is the address the proxy received from.
 */
export function clientAddress(c: Ctx): string {
  let peer = 'unknown';
  try {
    peer = (getConnInfo(c).remote.address ?? 'unknown').replace(/^::ffff:/, '');
  } catch {
    // Not running behind a Node socket (tests).
  }
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded && PRIVATE_ADDRESS.test(peer)) {
    const last = forwarded.split(',').pop()?.trim();
    if (last) return last;
  }
  return peer;
}
