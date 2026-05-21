// Global exception filter — consistent JSON errors + monitoring capture.
//
// Every unhandled HTTP exception becomes:
//   { statusCode, message, requestId, timestamp }
//
// 5xx and unknown errors are recorded in EventStoreService so GET /ops/events
// shows a unified timeline with iOS client reports.

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { EventStoreService } from '../monitoring/event-store.service';
import { getRequestId } from './request-id.middleware';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly eventStore: EventStoreService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const requestId = getRequestId(req) ?? 'unknown';
    const timestamp = new Date().toISOString();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>;
        message =
          typeof obj.message === 'string'
            ? obj.message
            : Array.isArray(obj.message)
              ? obj.message.join('; ')
              : message;
        details = obj;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Record server-side failures for the ops dashboard. Skip routine 4xx
    // (validation, auth) — those are expected client mistakes, not incidents.
    if (status >= 500) {
      this.eventStore.record({
        source: 'server',
        level: 'error',
        message,
        context: {
          statusCode: status,
          requestId,
          method: req.method,
          path: req.url,
          details,
        },
      });
      this.logger.error(
        `${req.method} ${req.url} ${status} requestId=${requestId} — ${message}`,
      );
    }

    const payload = {
      statusCode: status,
      message,
      requestId,
      timestamp,
    };

    if (!res.headersSent) {
      res.status(status).json(payload);
    }
  }
}
