// Run pending Drizzle migrations against the configured DATABASE_URL.
//
// Usage:
//   npm run drizzle:migrate
//
// Reads .env via dotenv-style loading (NestJS's ConfigModule isn't booted
// here — this is a CLI script). Calls `migrate()` from drizzle-orm which
// applies any SQL files in ./drizzle/migrations not already in the
// `__drizzle_migrations` tracking table.

import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Did you copy .env.example to .env?');
  }

  // Single-connection client is best for migrations to avoid pool churn.
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  console.log('Running migrations against', url.replace(/:[^:@/]+@/, ':***@'));

  // The pgvector extension must exist before the schema migration that
  // declares vector columns runs. We add it via the 0000_init.sql migration.
  await migrate(db, { migrationsFolder: './drizzle/migrations' });

  console.log('Migrations applied.');
  await sql.end();
}

main().catch((err) => {
  // Loud failure so CI / dev sees the cause immediately.
  console.error('Migration failed:', err);
  process.exit(1);
});
