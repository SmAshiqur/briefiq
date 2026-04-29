// Feedback service — 'useful' / 'noise' flags from the iOS detail screen.
//
// On every feedback row, we (eventually) auto-tune the user's
// `defaultThreshold`. For the prototype, we just log and persist; the
// auto-tune lives in the next iteration once we have data to learn from.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_TOKEN, type DrizzleDb } from '../../db/client';
import { briefings, feedback } from '../../db/schema';
import type { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(@Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDb) {}

  async create(briefingId: string, userId: string, dto: CreateFeedbackDto) {
    // Confirm briefing exists. The unique index on (user_id, briefing_id)
    // prevents duplicate rows; UPSERT lets the user re-rate.
    const found = await this.db
      .select({ id: briefings.id })
      .from(briefings)
      .where(eq(briefings.id, briefingId))
      .limit(1);

    if (found.length === 0) {
      throw new Error(`Briefing ${briefingId} not found`);
    }

    const [row] = await this.db
      .insert(feedback)
      .values({ briefingId, userId, rating: dto.rating })
      .onConflictDoUpdate({
        target: [feedback.userId, feedback.briefingId],
        set: { rating: dto.rating },
      })
      .returning();

    this.logger.log(
      `Feedback ${row.id} (${dto.rating}) for briefing=${briefingId} user=${userId}`,
    );
    return row;
  }
}
