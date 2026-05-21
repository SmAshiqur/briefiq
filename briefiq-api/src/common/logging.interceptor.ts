// Logs every HTTP request: method, path, status, duration, request id.
// Registered globally in AppModule via APP_INTERCEPTOR.
//
// 5xx capture lives in HttpExceptionFilter (consistent JSON + EventStore).
// This interceptor is for the human-readable access log line.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { getRequestId } from './request-id.middleware';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    const requestId = getRequestId(req) ?? '-';
    const t0 = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<{ statusCode: number }>();
          this.logger.log(
            `${method} ${url} ${res.statusCode} +${Date.now() - t0}ms rid=${requestId}`,
          );
        },
        error: (err: { status?: number; message?: string }) => {
          const status = err.status ?? 500;
          this.logger.warn(
            `${method} ${url} ${status} +${Date.now() - t0}ms rid=${requestId} — ${err.message ?? 'unknown error'}`,
          );
        },
      }),
    );
  }
}
