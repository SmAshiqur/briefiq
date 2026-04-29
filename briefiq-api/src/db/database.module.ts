// DatabaseModule — exposes the shared Drizzle client to the rest of the app
// via DI. Mark it global so feature modules don't have to re-import it.

import { Global, Module } from '@nestjs/common';
import { DRIZZLE_TOKEN, createDb } from './client';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_TOKEN,
      // useFactory so the connection is built once at app start, not at
      // module import time. Fail-fast on bad DATABASE_URL.
      useFactory: () => createDb(),
    },
  ],
  exports: [DRIZZLE_TOKEN],
})
export class DatabaseModule {}
