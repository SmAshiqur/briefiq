import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import { PushService } from './push.service';
import { RegisterPushDto } from './dto/register-push.dto';

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly svc: PushService) {}

  @Post('register')
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterPushDto) {
    return this.svc.register(user.id, dto);
  }
}
