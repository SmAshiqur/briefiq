// Optional Sentry bootstrap. No-op when SENTRY_DSN is unset.
//
// Install @sentry/nestjs when you want production error tracking:
//   npm install @sentry/nestjs @sentry/node
//
// We use dynamic require so local dev works without the package installed.

import type { Env } from '../config/env';

export function initOptionalSentry(env: Env): void {
  if (!env.SENTRY_DSN) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/nestjs') as {
      init: (opts: { dsn: string; environment: string }) => void;
    };
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
    });
    // eslint-disable-next-line no-console
    console.log('Sentry initialized');
  } catch {
    // eslint-disable-next-line no-console
    console.warn(
      'SENTRY_DSN is set but @sentry/nestjs is not installed. ' +
        'Run: npm install @sentry/nestjs @sentry/node',
    );
  }
}
