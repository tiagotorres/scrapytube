import type { ApiErrorBody, ErrorCode } from '#shared/types.ts';

import i18n from '@/i18n/index.ts';
import { createStore } from '@/lib/store.ts';

/** `NETWORK`: the server could not be reached at all. */
export type ClientErrorCode = ErrorCode | 'NETWORK';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;

  constructor(status: number, code: ClientErrorCode, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

/** Becomes true when the server runs another version than this page. */
export const updateAvailable = createStore(false);

/** True while the NAS can't be reached (no connection, or the NAS is off). */
export const unreachable = createStore(false);

let onUnauthorized = () => {};

/** Called when the session has ended (signed out elsewhere, user removed…). */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

/** Sent with every change: other websites can't send it without CORS permission. */
const CSRF_HEADER = 'x-scrapytube';

interface RequestOptions {
  /**
   * Lets a change made just before the page is closed still arrive. Browsers
   * refuse it for bodies over 64 KB, so large requests turn it off.
   */
  keepalive?: boolean;
}

async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      keepalive: options.keepalive ?? method !== 'GET',
      headers: {
        [CSRF_HEADER]: '1',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    unreachable.set(true);
    throw new ApiError(0, 'NETWORK');
  }
  unreachable.set(false);

  const version = res.headers.get('x-app-version');
  if (version && version !== import.meta.env.APP_VERSION) updateAvailable.set(true);

  if (res.ok) return res.status === 204 ? (undefined as T) : ((await res.json()) as T);

  const data = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const code = data?.error ?? (res.status >= 500 ? 'INTERNAL' : 'BAD_REQUEST');
  if (code === 'UNAUTHORIZED') onUnauthorized();
  throw new ApiError(res.status, code, data?.message);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** A message for the person, in their language. */
export function errorMessage(error: unknown): string {
  const code: ClientErrorCode = error instanceof ApiError ? error.code : 'INTERNAL';
  return i18n.t(`errors.${code}`);
}

export function isApiError(error: unknown, code: ClientErrorCode): boolean {
  return error instanceof ApiError && error.code === code;
}
