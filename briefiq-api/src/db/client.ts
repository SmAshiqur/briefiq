// Drizzle DB client — single shared pool for the whole app.
//
// We use `postgres` (postgres.js) as the underlying driver because it's
// faster than node-postgres for our workload and is the one Drizzle's docs
// optimize for. The pool size 10 is fine for prototype; scale via env later.
//
// Anywhere else in the code, inject DRIZZLE via `@Inject(DRIZZLE_TOKEN)`
// instead of importing this module directly. That keeps tests mockable.

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from './schema';
import { getEnv } from '../config/env';

// Symbol-keyed token for NestJS DI. Imported by DatabaseModule + any service
// that needs DB access.
export const DRIZZLE_TOKEN = Symbol('DRIZZLE_DB');

/**
 * Build the postgres connection + Drizzle wrapper. Called once by
 * DatabaseModule's provider factory.
 *
 * The `prepare: false` flag is required for compatibility with PgBouncer
 * (Neon uses it). Cheap to keep on locally, so we always set it.
 */
export function createDb() {
  const env = getEnv();
  const connection = postgres(env.DATABASE_URL, {
    max: 10,
    prepare: false,
    // Long-lived idle connections drop without onnotice noise.
    onnotice: () => {},
  });

  return drizzle(connection, { schema });
}

// Type alias used everywhere we need to type a Drizzle client. Keeps imports
// short and refactor-friendly.
export type DrizzleDb = ReturnType<typeof createDb>;
