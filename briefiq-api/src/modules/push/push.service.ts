import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_TOKEN, type DrizzleDb } from '../../db/client';
import { users } from '../../db/schema';
import type { RegisterPushDto } from './dto/register-push.dto';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(@Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDb) {}

  async register(userId: string, dto: RegisterPushDto) {
    await this.db
      .update(users)
      .set({ pushToken: dto.deviceToken })
      .where(eq(users.id, userId));
    this.logger.log(`Stored APNs token (${dto.deviceToken.slice(0, 8)}…) for user ${userId}`);
    return { ok: true };
  }
}
