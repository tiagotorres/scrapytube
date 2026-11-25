import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { ErrorCode } from '#shared/types.ts';

/** An error sent to the client as `{ error: code }` with an HTTP status. */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;

  constructor(status: ContentfulStatusCode, code: ErrorCode, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export const notFound = () => new HttpError(404, 'NOT_FOUND');
export const badRequest = (message?: string) => new HttpError(400, 'BAD_REQUEST', message);
