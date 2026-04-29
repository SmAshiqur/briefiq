// Tiny health endpoint. Used by:
//   - Fly.io / load balancers as a liveness probe
//   - The iOS app's Settings screen "API reachable" indicator
//   - You, when you want to verify the server actually started
//
// Intentionally cheap — no DB ping here. A separate /readiness endpoint can
// add deeper checks once the rest of the system is in place.

import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      ok: true,
      service: 'briefiq-api',
      // ISO-8601 so iOS Date decoders parse it without a custom format.
      timestamp: new Date().toISOString(),
      // Bumped manually per release. Helpful when a stale machine is serving.
      version: '0.1.0',
    };
  }
}
