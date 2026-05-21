// Assigns a correlation id to every HTTP request.
//
// Clients may send X-Request-Id; otherwise we generate one. The id is echoed
// on the response and included in logs + error payloads so iOS and backend
// logs can be joined during debugging.

import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Express middleware — register in main.ts before Nest routes. */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId =
    typeof incoming === 'string' && incoming.trim().length > 0
      ? incoming.trim()
      : randomUUID();

  // Attach for interceptors, filters, and controllers.
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

/** Read request id from an Express request (safe when middleware skipped). */
export function getRequestId(req: Request): string | undefined {
  return (req as Request & { requestId?: string }).requestId;
}
