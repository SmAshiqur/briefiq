// Ops REST surface — client event ingest + dev monitoring dashboard data.
//
//   POST /ops/events   — iOS posts log/error batches (JWT required)
//   GET  /ops/events   — recent timeline (dev, or prod + OPS_READ_TOKEN)
//   GET  /ops/summary  — aggregate counts

import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.service';
import type { EventLevel, EventSource } from '../../monitoring/event-store.types';

import { CreateClientEventsDto } from './dto/create-client-events.dto';
import { OpsReadGuard } from './ops-read.guard';
import { OpsService } from './ops.service';

@Controller('ops')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Post('events')
  @UseGuards(JwtAuthGuard)
  ingest(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateClientEventsDto,
  ) {
    return this.ops.ingestClientEvents(user.id, dto.events);
  }

  @Get('events')
  @UseGuards(JwtAuthGuard, OpsReadGuard)
  list(
    @Query('limit') limit?: string,
    @Query('source') source?: EventSource,
    @Query('level') level?: EventLevel,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.ops.listEvents({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      source,
      level,
    });
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard, OpsReadGuard)
  summary() {
    return this.ops.summary();
  }
}
