// QueriesService — owns CRUD over the queries table + the LLM analyze step.
//
// Controllers call this; nothing here knows about HTTP. Tests mock this
// service directly when testing the controller, and mock the LLM/DB when
// testing this service.

import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE_TOKEN, type DrizzleDb } from '../../db/client';
import { queries } from '../../db/schema';
import { LlmService, type QueryUnderstanding } from '../../services/llm.service';
import type { CreateQueryDto } from './dto/create-query.dto';
import type { UpdateQueryDto } from './dto/update-query.dto';

@Injectable()
export class QueriesService {
  private readonly logger = new Logger(QueriesService.name);

  constructor(
    @Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDb,
    private readonly llm: LlmService,
  ) {}

  /**
   * AI parse of a raw user query. Powers the Add Query confirm panel.
   * Pure read — no DB write. iOS will follow up with POST /queries to save.
   */
  async analyze(text: string): Promise<QueryUnderstanding> {
    return this.llm.understandQuery(text);
  }

  /** Create a new query for the current user. */
  async create(userId: string, dto: CreateQueryDto) {
    const [row] = await this.db
      .insert(queries)
      .values({
        userId,
        rawText: dto.rawText,
        intentType: dto.intentType,
        frequency: dto.frequency,
        sourcesJson: dto.sources ? { domains: dto.sources.domains } : null,
        signalThreshold: dto.signalThreshold ?? null,
        status: 'active',
        // Schedule the first check immediately. The cron worker picks it up.
        nextCheckAt: new Date(),
      })
      .returning();
    this.logger.log(`Created query ${row.id} for user ${userId}`);
    return row;
  }

  /** List the user's queries, newest first. */
  async list(userId: string) {
    return this.db
      .select()
      .from(queries)
      .where(eq(queries.userId, userId))
      .orderBy(desc(queries.createdAt));
  }

  /**
   * Fetch a single query and confirm ownership in one trip. Throws 404 if
   * missing, 403 if it belongs to another user.
   */
  async getOne(userId: string, id: string) {
    const rows = await this.db
      .select()
      .from(queries)
      .where(eq(queries.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException(`Query ${id} not found`);
    }
    if (rows[0].userId !== userId) {
      throw new ForbiddenException('You do not own this query');
    }
    return rows[0];
  }

  /** Partial update — pause/resume, change frequency, etc. */
  async update(userId: string, id: string, dto: UpdateQueryDto) {
    // Reuse getOne for the auth check.
    await this.getOne(userId, id);

    const [row] = await this.db
      .update(queries)
      .set({
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
        ...(dto.signalThreshold !== undefined && {
          signalThreshold: dto.signalThreshold,
        }),
      })
      .where(and(eq(queries.id, id), eq(queries.userId, userId)))
      .returning();
    return row;
  }

  /** Hard delete (and CASCADEs to fetches/snapshots/briefings/feedback). */
  async remove(userId: string, id: string) {
    await this.getOne(userId, id);
    await this.db
      .delete(queries)
      .where(and(eq(queries.id, id), eq(queries.userId, userId)));
    return { ok: true };
  }
}
