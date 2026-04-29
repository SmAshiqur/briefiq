---
name: add-nestjs-module
description: Scaffold a new NestJS module in the BriefIQ backend with controller, service, DTOs, Drizzle schema additions, migration, and tests. Use when adding a new REST resource, when the user asks for a new endpoint group, or when introducing a new domain concept (e.g., feedback, sources, tags).
---

# Add a NestJS Module

## When to use

You need a new REST resource group: `/feedback`, `/sources`, `/tags`, etc. The work spans the HTTP layer, the service, the DB schema, and tests.

## Workflow

```
- [ ] 1. Generate scaffold with nest CLI
- [ ] 2. Define DTOs (class-validator)
- [ ] 3. Add Drizzle schema entries + generate migration
- [ ] 4. Write the service
- [ ] 5. Wire controller endpoints
- [ ] 6. Register module in AppModule
- [ ] 7. Write tests
```

## Step 1: Scaffold

```bash
cd briefiq-api
pnpm nest g resource modules/<name> --no-spec
```

This creates `src/modules/<name>/<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`, and `dto/`. Skip the auto-spec; add tests intentionally in step 7.

## Step 2: DTOs (class-validator)

```ts
// src/modules/feedback/dto/create-feedback.dto.ts
import { IsEnum, IsUUID } from 'class-validator';

export class CreateFeedbackDto {
  @IsUUID()
  briefingId!: string;

  @IsEnum(['useful', 'noise'])
  rating!: 'useful' | 'noise';
}
```

`ValidationPipe` is registered globally in `main.ts` with `{ whitelist: true, transform: true }` so unknown fields are stripped automatically.

## Step 3: Drizzle schema + migration

Add to `src/db/schema.ts`:

```ts
export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  briefingId: uuid('briefing_id').notNull().references(() => briefings.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  rating: text('rating', { enum: ['useful', 'noise'] }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

Generate and apply the migration:

```bash
pnpm drizzle-kit generate --name add_feedback
pnpm drizzle:migrate
```

Commit the generated SQL file under `drizzle/migrations/`.

## Step 4: Service

```ts
@Injectable()
export class FeedbackService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async create(dto: CreateFeedbackDto, userId: string) {
    const [row] = await this.db
      .insert(feedback)
      .values({ ...dto, userId })
      .returning();
    return row;
  }
}
```

Business logic lives here. Controllers stay thin.

## Step 5: Controller

```ts
@Controller('briefings/:id/feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly svc: FeedbackService) {}

  @Post()
  create(
    @Param('id') briefingId: string,
    @Body() dto: Omit<CreateFeedbackDto, 'briefingId'>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.create({ ...dto, briefingId }, user.id);
  }
}
```

## Step 6: Register

In `src/app.module.ts`:

```ts
@Module({
  imports: [..., FeedbackModule],
})
export class AppModule {}
```

## Step 7: Tests

```ts
// feedback.service.spec.ts
describe('FeedbackService', () => {
  it('creates feedback and returns it with id and timestamp', async () => {
    const row = await svc.create(
      { briefingId: 'uuid', rating: 'useful' },
      userId,
    );
    expect(row.id).toBeDefined();
    expect(row.rating).toBe('useful');
  });
});
```

## Anti-patterns

- Hand-writing module/controller/service files instead of `nest g resource`.
- Skipping migration generation — the deploy will fail silently.
- Calling `db.execute(sql\`...\`)` when Drizzle's typed API works.
- Putting business logic in the controller.
- Forgetting `@UseGuards(JwtAuthGuard)` on user-scoped endpoints.
