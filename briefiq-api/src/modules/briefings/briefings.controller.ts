import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { BriefingsService } from './briefings.service';

@Controller('briefings')
@UseGuards(JwtAuthGuard)
export class BriefingsController {
  constructor(private readonly svc: BriefingsService) {}

  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.svc.today(user.id);
  }

  // Declared before @Get(':id') so NestJS matches the static 'query' segment
  // first and doesn't try to parse it as a UUID.
  @Get('query/:queryId')
  forQuery(
    @CurrentUser() user: AuthUser,
    @Param('queryId', ParseUUIDPipe) queryId: string,
  ) {
    return this.svc.forQuery(user.id, queryId);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getOne(user.id, id);
  }
}
