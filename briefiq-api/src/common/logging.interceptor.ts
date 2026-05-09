// Logs every HTTP request: method, path, status, duration.
// Registered globally in AppModule via APP_INTERCEPTOR.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ method: string; url: string }>();
    const { method, url } = req;
    const t0 = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<{ statusCode: number }>();
          this.logger.log(`${method} ${url} ${res.statusCode} +${Date.now() - t0}ms`);
        },
        error: (err: { status?: number; message?: string }) => {
          const status = err.status ?? 500;
          this.logger.warn(
            `${method} ${url} ${status} +${Date.now() - t0}ms — ${err.message ?? 'unknown error'}`,
          );
        },
      }),
    );
  }
}
