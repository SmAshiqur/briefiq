// Drizzle Kit config. Tells `drizzle-kit generate` where the schema lives
// and where to write SQL migrations.
//
// `dialect: 'postgresql'` is required for Drizzle Kit >= 0.21.

import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://briefiq:briefiq@localhost:5432/briefiq',
  },
  // Stricter validation catches accidental schema drift early.
  strict: true,
  verbose: true,
} satisfies Config;
