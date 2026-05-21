// Blocks read-only ops endpoints in production unless OPS_READ_TOKEN matches.
//
// POST /ops/events stays open in prod (authenticated users report client errors).
// GET /ops/events and GET /ops/summary are dev-only by default so we don't
// leak an error timeline to arbitrary JWT holders in production.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { getEnv } from '../../config/env';

@Injectable()
export class OpsReadGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const env = getEnv();
    const req = context.switchToHttp().getRequest<Request>();

    // Non-production: any authenticated user can read the ops timeline.
    if (env.NODE_ENV !== 'production') {
      return true;
    }

    const token = env.OPS_READ_TOKEN;
    if (!token) {
      throw new ForbiddenException(
        'Ops read endpoints are disabled in production',
      );
    }

    const header = req.header('x-ops-read-token');
    if (header !== token) {
      throw new ForbiddenException('Invalid ops read token');
    }

    return true;
  }
}
