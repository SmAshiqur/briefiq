// Queries controller — REST surface for the user's tracking queries.
//
// All endpoints require auth. The :id endpoints are scoped to the current
// user inside the service so this controller stays thin.

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';

import { QueriesService } from './queries.service';
import { AnalyzeQueryDto } from './dto/analyze-query.dto';
import { CreateQueryDto } from './dto/create-query.dto';
import { UpdateQueryDto } from './dto/update-query.dto';

@Controller('queries')
@UseGuards(JwtAuthGuard)
export class QueriesController {
  constructor(private readonly svc: QueriesService) {}

  /** AI analyze — read-only, no DB write. Powers the iOS confirm panel. */
  @Post('analyze')
  analyze(@Body() dto: AnalyzeQueryDto) {
    return this.svc.analyze(dto.text);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateQueryDto) {
    return this.svc.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user.id);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQueryDto,
  ) {
    return this.svc.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.remove(user.id, id);
  }
}
