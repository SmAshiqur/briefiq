// Settings — read/write the user's preferences row.
// One row per user, identified by users.id. We never create a separate
// settings table; the columns live on `users` for simplicity.

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_TOKEN, type DrizzleDb } from '../../db/client';
import { users } from '../../db/schema';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(@Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDb) {}

  async get(userId: string) {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        quietStart: users.quietStart,
        quietEnd: users.quietEnd,
        digestTime: users.digestTime,
        defaultThreshold: users.defaultThreshold,
        defaultDetail: users.defaultDetail,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('User not found');
    }
    return rows[0];
  }

  async update(userId: string, dto: UpdateSettingsDto) {
    const [row] = await this.db
      .update(users)
      .set({
        ...(dto.quietStart !== undefined && { quietStart: dto.quietStart }),
        ...(dto.quietEnd !== undefined && { quietEnd: dto.quietEnd }),
        ...(dto.digestTime !== undefined && { digestTime: dto.digestTime }),
        ...(dto.defaultThreshold !== undefined && {
          defaultThreshold: dto.defaultThreshold,
        }),
        ...(dto.defaultDetail !== undefined && {
          defaultDetail: dto.defaultDetail,
        }),
      })
      .where(eq(users.id, userId))
      .returning();
    return row;
  }
}
