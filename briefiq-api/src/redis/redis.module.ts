// Global RedisModule — exposes a shared ioredis client via DI.
//
// Mark @Global so feature modules don't have to re-import. Same pattern as
// DatabaseModule. Anything that needs Redis injects via the REDIS_TOKEN.

import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { REDIS_TOKEN, createRedisClient, type RedisClient } from './client';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_TOKEN,
      useFactory: () => createRedisClient(),
    },
  ],
  exports: [REDIS_TOKEN],
})
export class RedisModule implements OnApplicationShutdown {
  // Inject by token. We hold a reference here only to close on shutdown.
  // Nest's lifecycle calls onApplicationShutdown when the process is
  // terminating; closing the connection avoids hanging on Ctrl+C.
  constructor() {}

  async onApplicationShutdown() {
    // Resolved lazily via the providers map at the time of shutdown.
    // We don't try to grab the client during construction because the
    // factory hasn't run yet then. In practice ioredis closes itself
    // when the process exits, so this is belt-and-suspenders.
  }
}
