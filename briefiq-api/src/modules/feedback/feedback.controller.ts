import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Controller('briefings/:id/feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly svc: FeedbackService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) briefingId: string,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.svc.create(briefingId, user.id, dto);
  }
}
